# ⚡ ACTION QUEUE & APPROVAL GUIDE

The Action Queue is the "brain-to-hand" interface of ANOTAI. It's where AI recommendations become real-world actions.

## 1. How it Works
1. **Agent Observation**: An agent (like Cart Sniper) detects an event (Abandoned Cart).
2. **Proposal**: The agent proposes an action (Send 10% discount).
3. **Safety Gate**: Margin Guardian checks the proposal against COGS.
4. **Queueing**:
   - If **Safe & Low Risk**: Action is queued as `approved` and executed automatically (if auto-execution is enabled).
   - If **Sensitive or Unsafe**: Action is queued as `pending` for merchant review.

## 2. Status Definitions
- `pending`: Awaiting merchant approval.
- `approved`: Ready for execution.
- `executing`: Currently being processed (Atomic Lock).
- `executed`: Action successfully completed.
- `failed`: Error occurred during execution (check `error_message`).
- `rejected`: Merchant manually declined the recommendation.

## 3. Best Practices for Merchants
- **Check daily**: Spend 5 minutes every morning reviewing pending actions.
- **Trust the Guardian**: If Margin Guardian marks an action as "Unsafe", review it carefully—it usually means the discount eats all your profit.
- **Use Bulk Actions**: You can approve or reject multiple actions at once to save time.
