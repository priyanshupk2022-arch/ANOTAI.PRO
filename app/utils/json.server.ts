/**
 * 🛠️ SAFE JSON PARSER
 *
 * Handles AI-hallucinated JSON by:
 * 1. Removing markdown blocks (```json ... ```)
 * 2. Trimming whitespace
 * 3. Handling parsing errors gracefully
 */

export function safeParseJson<T>(
  raw: string,
  fallback: T,
  context?: string,
  storeId?: string | null,
  logger?: { aiCall: (storeId: string | null, eventType: string, error: string) => Promise<void> }
): T {
  if (!raw) return fallback;

  let cleaned = raw;

  // 1. Remove Markdown code blocks if present
  // Matches ```json [...] ``` or ``` [...] ```
  const markdownRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
  const match = cleaned.match(markdownRegex);
  if (match) {
    cleaned = match[1];
  }

  // 2. Extract first array or object if there's surrounding text
  // This is a common AI failure mode where it includes conversational filler.
  if (!cleaned.trim().startsWith("[") && !cleaned.trim().startsWith("{")) {
    const jsonMatch = cleaned.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
  }

  try {
    return JSON.parse(cleaned.trim()) as T;
  } catch (error: any) {
    console.error(`[JSON Parse Error] ${context || "Unknown context"}:`, error.message);

    // Log to our internal error tracking if logger is provided
    if (logger) {
      logger.aiCall(
        storeId || null,
        `json_parse_error:${context || "unknown"}`,
        error.message
      ).catch(() => {});
    }

    return fallback;
  }
}
