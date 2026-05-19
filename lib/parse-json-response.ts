// Robust JSON extractor for Claude responses. The model is told to "return
// only a JSON object" but in practice sometimes wraps it in ```json …```
// fences, prefixes it with prose, or appends a "Note: …" paragraph after.
//
// Strategy: find the first '{' and the last '}' in the trimmed text and
// parse what sits between them. Works for the (overwhelming) case where the
// payload is a single top-level object — Claude doesn't nest a second
// top-level object after the primary one.
//
// Returns null if no parseable object is found; callers fall back to a
// generic message rather than dumping raw model output on the user.

export function parseJsonResponse<T = unknown>(raw: string): T | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  try {
    return JSON.parse(trimmed.slice(first, last + 1)) as T;
  } catch {
    return null;
  }
}
