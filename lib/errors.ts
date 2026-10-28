/**
 * Supabase / PostgREST errors are plain objects ({ message, code, ... }),
 * not Error instances, so `cause instanceof Error` is false for them and the
 * real database message (e.g. "amount exceeds remaining balance") is lost.
 */
export function getErrorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message) return cause.message;

  if (typeof cause === "object" && cause !== null && "message" in cause) {
    const message = String((cause as { message: unknown }).message);
    if (message) return message;
  }

  return fallback;
}