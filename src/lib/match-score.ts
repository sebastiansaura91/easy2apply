import { CompetenceTheme } from "@/types/ats-check";

/**
 * Matchpoäng — one number computed the way recruiter scorecards work:
 * each competence theme gets an anchored 1–5 rating; must-themes weigh double;
 * score = weighted rating / weighted maximum. Deterministic given the ratings,
 * pure demand-fit (presentation lives outside the number).
 */
export function computeMatchScore(themes: CompetenceTheme[] | undefined | null): number | null {
  const rated = (themes || []).filter(t => Number.isFinite(t.rating as number));
  if (!rated.length) return null;
  let num = 0;
  let den = 0;
  for (const t of rated) {
    const w = t.importance === "must" ? 2 : 1;
    const r = Math.max(1, Math.min(5, Math.round(t.rating as number)));
    num += w * r;
    den += w * 5;
  }
  return Math.round((num / den) * 100);
}

/** The weakest must-theme (ties broken by lowest rating) — "störst gap". */
export function biggestGap(themes: CompetenceTheme[] | undefined | null): CompetenceTheme | null {
  const rated = (themes || []).filter(t => Number.isFinite(t.rating as number));
  if (!rated.length) return null;
  const sorted = [...rated].sort((a, b) => {
    const mustDiff = (a.importance === "must" ? 0 : 1) - (b.importance === "must" ? 0 : 1);
    if (mustDiff !== 0) return mustDiff;
    return (a.rating as number) - (b.rating as number);
  });
  const top = sorted[0];
  return (top.rating as number) < 5 ? top : null;
}
