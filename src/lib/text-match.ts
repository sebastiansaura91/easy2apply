/**
 * Matchmotorn: THE one answer to "does the CV carry this word?". Every check that
 * compares ad language to CV language (profile coverage, six-second, cut plan,
 * skills advisor, values mirror) imports these primitives — never a local copy.
 * Before this module the codebase held 12 hand-copied variants with real drift:
 * one check stemmed, its neighbour didn't, and the server stemmed differently.
 *
 * The server cannot import from src/, so supabase/functions/_shared/text-match.ts
 * is a byte-for-byte mirror; text-match.contract.test.ts fails the build if the
 * twins ever diverge.
 */

/** Lowercase, dashes to spaces, collapsed whitespace — the comparison form. */
export const norm = (s: string) => s.toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Light Swedish stemming so "ledarskapet" matches "ledarskap": strip one common
 * suffix from words of 6+ characters. Deliberately conservative — no "ning"/"ande"
 * stripping, which would collapse "ledning" into "led".
 */
export const stem = (s: string) => (s.length >= 6 ? s.replace(/(erna|arna|orna|en|et|er|ar|or|s)$/i, "") : s);

/**
 * Term-in-text predicate factory: `hitIn(normedBlob)(term)`. Exact normalized
 * containment first, stemmed as fallback. Terms under 3 characters never match
 * (too many false hits).
 */
export const hitIn = (blob: string) => (term: string): boolean => {
  const n = norm(term);
  if (n.length < 3 || !blob) return false;
  if (blob.includes(n)) return true;
  const st = stem(n);
  return st !== n && blob.includes(st);
};

/** Distinctive words from a theme name — connectors and short words carry no signal. */
export const themeWords = (theme: string) => theme.split(/[\s/&,·]+/).filter(w => w.length >= 5);

/**
 * The one rating fallback (was copied 10 times, only one copy clamped): the model's
 * 1–5 rating when finite, else derived from the evidence verdict, always clamped.
 */
export const ratingOf = (t: { rating?: number | null; evidence?: string }): number => {
  const raw = typeof t.rating === "number" && Number.isFinite(t.rating)
    ? t.rating
    : t.evidence === "strong" ? 4 : t.evidence === "missing" ? 1 : 3;
  return Math.max(1, Math.min(5, Math.round(raw)));
};
