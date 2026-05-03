# 🛑 SAFETY CONTROLS & RATE LIMITS

ANOTAI is built with a multi-layered safety architecture to protect both the merchant (margins) and the platform (costs/stability).

## 1. Global Kill Switches (Admin Only)
These are controlled via environment variables for instant, system-wide pauses.
- `KILL_SWITCH_AUTO_EXECUTION`: Pauses all automated actions.
- `KILL_SWITCH_RECOVERY_EMAILS`: Pauses all outgoing emails.
- `KILL_SWITCH_WAR_ROOM`: Disables the War Room feature.
- `KILL_SWITCH_TEMPLATE_MODE`: Forces AI to use templates only.
- `KILL_SWITCH_CUSTOMER_AI_REPLIES`: Pauses all AI chat replies.

## 2. Global Throughput Limits
Prevents system-wide crashes during traffic spikes.
- **AI Calls**: 60 per minute (default)
- **Emails**: 30 per minute (default)
- **Auto-Executions**: 20 per minute (default)

## 3. Store-Level Limits
Configure these in the Merchant Dashboard under **Settings > Safety**.
- **Max Daily AI Interactions**: Default 500.
- **Max Daily Recovery Emails**: Default 50.
- **Max Daily Auto-Executions**: Default 20.

## 4. Margin Guardian
Protects against unprofitable discounts.
- **Safety Zone**: Default 20% profit floor.
- **Approval Above X%**: Any discount above this threshold (default 15%) stays in the Action Queue for manual approval.

## 5. Duplicate Protection
- **Webhooks**: Every Shopify event is tracked by ID to prevent double processing.
- **Action Queue**: Atomic status locking ensures no action (email/discount) is ever executed twice.
