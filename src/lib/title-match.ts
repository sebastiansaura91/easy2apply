import { CVContent } from "@/types/cv";

/**
 * Job-title alignment — recruiters search by title before anything else, so whether
 * the CV carries the ad's title (or close to it) is its own signal, separate from
 * the competence score. Deterministic: no model involved.
 */
export interface TitleMatch {
  level: "exact" | "partial" | "none";
  /** The CV title that matched best (or the current one when none matched). */
  cvTitle: string | null;
}

const STOP = new Set(["of", "and", "the", "for", "av", "och", "för", "inom", "till", "på", "en", "a", "an", "&", "-", "–"]);

const tokens = (s: string) =>
  s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(w => w && !STOP.has(w));

export function titleMatch(jobTitle: string | undefined | null, cv: CVContent): TitleMatch | null {
  const jt = (jobTitle || "").trim();
  if (!jt) return null;
  const want = tokens(jt);
  if (!want.length) return null;

  const candidates = [
    cv.__meta?.targetRoleLabel,
    ...cv.experience.map(e => e.title),
  ].filter((t): t is string => !!t && !!t.trim());
  if (!candidates.length) return { level: "none", cvTitle: null };

  let best: TitleMatch = { level: "none", cvTitle: cv.experience.find(e => e.isPresent)?.title ?? candidates[0] };
  for (const c of candidates) {
    const have = new Set(tokens(c));
    const hits = want.filter(w => have.has(w)).length;
    if (hits === want.length && have.size <= want.length + 1) return { level: "exact", cvTitle: c };
    if (hits >= Math.ceil(want.length / 2) && best.level === "none") best = { level: "partial", cvTitle: c };
  }
  return best;
}
