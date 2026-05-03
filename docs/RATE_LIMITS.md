# ⏱️ RATE LIMITS & THROUGHPUT

ANOTAI implements strict rate limiting to ensure platform stability and cost control.

## 1. Global Platform Limits
These prevent the entire platform from being overwhelmed by a sudden spike (e.g., a viral TikTok campaign hitting 50 stores at once).

| Metric | Limit | Window | Config Var |
| :--- | :--- | :--- | :--- |
| **AI Calls** | 60 | 1 Minute | `GLOBAL_MAX_AI_CALLS_PER_MINUTE` |
| **Emails** | 30 | 1 Minute | `GLOBAL_MAX_EMAILS_PER_MINUTE` |
| **Executions** | 20 | 1 Minute | `GLOBAL_MAX_AUTO_EXECUTIONS_PER_MINUTE` |
| **War Room** | 10 | 1 Hour | `GLOBAL_MAX_WAR_ROOM_RUNS_PER_HOUR` |

## 2. Per-Store Daily Limits
These prevent individual stores from burning through the plan's budget or hitting API limits.

- **AI Interactions**: Max 500/day (Default).
- **Recovery Emails**: Max 50/day (Default).
- **Auto-Executions**: Max 20/day (Default).

## 3. Handling Limit Reaches
When a limit is reached:
1. The operation is **blocked**.
2. A message is logged to the **Error Logs**.
3. In the Action Queue, the action may be marked as `failed` with the reason "Daily limit reached".
4. The **Internal Debug** page will show stores near their usage limits.

> [!IMPORTANT]
> **Scaling Note**: The current in-memory rate limiting is designed for a single-instance Private Beta deployment. For multi-instance scaling (100+ stores), these limits must be migrated to a distributed store like Redis (Upstash) or a DB-backed counter to ensure consistency across nodes.
