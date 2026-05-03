import { GoogleGenerativeAI } from "@google/generative-ai";
import { assertCanMakeAiCall } from "~/services/killSwitch.server";
import { ErrorLogger } from "~/services/errorLogger.server";

if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is missing");

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// We use the Gemini 1.5 Pro model for complex agent reasoning
export const aiModel = genAI.getGenerativeModel({
  model: "gemini-1.5-pro",
});

/**
 * 🤖 SAFE AI CALL WRAPPER — Phase 10
 * Use this instead of calling aiModel directly to ensure rate limits are enforced.
 */
export async function askAgent(storeId: string, prompt: string): Promise<string> {
  try {
    // 1. Safety & Rate Limit Check
    await assertCanMakeAiCall(storeId);

    // 2. Real AI Call
    const result = await aiModel.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    await ErrorLogger.aiCall(storeId, "gemini_generation", error.message);
    
    // If rate limited or blocked, we might want to return a safe fallback message
    // but throwing allows the caller to handle specific UI/logic states.
    throw error;
  }
}
