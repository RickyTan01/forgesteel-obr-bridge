/**
 * Errors crossing OBR's postMessage-based SDK boundary usually arrive as
 * plain serialized objects (e.g. `{ error: { name, message } }`), not real
 * Error instances — console.error("...", err) then prints an opaque
 * collapsed object reference in Firefox/Chrome devtools instead of visible
 * text, making bug reports useless without someone manually expanding it.
 * This flattens either shape into a string worth pasting.
 */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
