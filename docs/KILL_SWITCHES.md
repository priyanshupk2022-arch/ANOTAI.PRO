# 🛑 KILL SWITCHES REFERENCE

Kill switches provide absolute control over AI behavior during emergencies or maintenance.

## 1. Global (System-Wide)
Set these as Environment Variables. They override everything.

| Variable | Effect |
| :--- | :--- |
| `KILL_SWITCH_AUTO_EXECUTION` | Prevents ANY action from running without manual click. |
| `KILL_SWITCH_RECOVERY_EMAILS` | Blocks all outgoing emails from Resend. |
| `KILL_SWITCH_WAR_ROOM` | Disables the War Room agent. |
| `KILL_SWITCH_CUSTOMER_AI_REPLIES` | Stops the AI from replying to customer chats. |
| `KILL_SWITCH_TEMPLATE_MODE` | AI will only use pre-defined templates, no dynamic generation. |

## 2. Store-Level
Merchants can toggle these in their dashboard settings.

- **Automation Enabled**: The master switch for that store.
- **Recovery Emails Enabled**: Specific to Cart Sniper emails.
- **Customer AI Replies Enabled**: Specific to the chat widget.
- **War Room Enabled**: Specific to long-term automation workflows.
