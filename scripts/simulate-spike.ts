/**
 * 🧪 PHASE 10: LIGHTWEIGHT SPIKE SIMULATION SCRIPT
 * 
 * This script simulates a burst of traffic to test rate limits, 
 * duplicate protection, and kill switches.
 * 
 * Usage: 
 * npx ts-node -r tsconfig-paths/register scripts/simulate-spike.ts
 */

import { assertCanMakeAiCall, assertCanSendEmail, assertCanAutoExecute } from "../app/services/killSwitch.server";
import { ErrorLogger } from "../app/services/errorLogger.server";

async function simulate() {
  const testStoreId = "test-store-123";
  console.log("🚀 Starting Phase 10 Spike Simulation...");

  // 1. Simulate AI Interaction Burst (Rate Limit Test)
  console.log("\n--- Testing AI Call Rate Limits ---");
  for (let i = 1; i <= 5; i++) {
    try {
      await assertCanMakeAiCall(testStoreId);
      console.log(`✅ AI Call ${i} allowed`);
    } catch (err: any) {
      console.log(`❌ AI Call ${i} blocked: ${err.message}`);
    }
  }

  // 2. Simulate Email Burst
  console.log("\n--- Testing Email Rate Limits ---");
  for (let i = 1; i <= 5; i++) {
    try {
      await assertCanSendEmail(testStoreId);
      console.log(`✅ Email ${i} allowed`);
    } catch (err: any) {
      console.log(`❌ Email ${i} blocked: ${err.message}`);
    }
  }

  // 3. Simulate Duplicate Webhook Attempt
  console.log("\n--- Testing Webhook Duplicate Protection ---");
  console.log("Note: This is best tested by hitting /api/webhooks with same X-Shopify-Webhook-Id twice.");

  // 4. Simulate Action Queue Auto-Execution
  console.log("\n--- Testing Auto-Execution Safety ---");
  try {
    await assertCanAutoExecute(testStoreId);
    console.log("✅ Auto-execution allowed");
  } catch (err: any) {
    console.log(`❌ Auto-execution blocked: ${err.message}`);
  }

  console.log("\n--- Simulation Complete ---");
  console.log("Check the /internal/debug page to see recorded usage and error logs.");
}

simulate().catch(console.error);
