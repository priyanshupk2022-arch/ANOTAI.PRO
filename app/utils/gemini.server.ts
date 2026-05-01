import { GoogleGenerativeAI } from "@google/generative-ai";

if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is missing");

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// We use the Gemini 1.5 Pro model for complex agent reasoning (Margin Guardian & Shopper)
export const aiModel = genAI.getGenerativeModel({
  model: "gemini-1.5-pro",
});

export async function askAgent(prompt: string): Promise<string> {
  try {
    const result = await aiModel.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("Failed to communicate with AI Agent");
  }
}
