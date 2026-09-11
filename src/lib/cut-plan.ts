import { CVContent, CVMeta } from "@/types/cv";
import { estimatePages } from "@/lib/readiness";

/**
 * Bantningsplanen: an AD-AWARE cut list for an over-budget CV. The generic advice
 * ("bullets over two lines, old roles over three bullets") never answers the real
 * question: what to cut FOR THIS AD. This does, deterministically: every bullet is
 * scored on how many of the ad's theme terms it carries (musts count double, tools
 * count too); zero-hit bullets in the oldest roles go first, until the estimate is
 * back inside the page budget. No model, no honesty risk — cutting is always safe.
 */

const CHARS_PER_LINE = 95; // mirrors readiness.ts / the A4 preview
const LINES_PER_PAGE = 52;

const norm = (s: string) => s.toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();
const stem = (s: string) => (s.length >= 6 ? s.replace(/(erna|arna|orna|en|et|er|ar|or|s)$/i, "") : s);

export interface CutItem {
  expIndex: number;
  bulletIdx: number;
  bullet: string;
  roleTitle: string;
  /** Why this bullet is expendable for THIS ad. */
  reason: "no-theme" | "old-role-depth";
  lines: number;
}

/** A strong bullet buried where the six-second read never goes. */
export interface BuriedGem {
  expIndex: number;
  bulletIdx: number;
  bullet: string;
  roleTitle: string;
  themes: string[];
}

export interface CutPlanResult {
  items: CutItem[];
  gems: BuriedGem[];
  pagesNow: number;
  pagesAfter: number;
  linesSaved: number;
}

const bulletLines = (b: string) => Math.max(1, Math.ceil(b.trim().length / (CHARS_PER_LINE - 5)));

/** Term hit score for one bullet: must-theme terms x2, nice x1, named tools x1. */
function bulletScore(
  bullet: string,
  demand: NonNullable<CVMeta["demandProfile"]>,
): { score: number; themes: string[] } {
  const blob = norm(bullet);
  if (!blob) return { score: 0, themes: [] };
  let score = 0;
  const themes: string[] = [];
  for (const t of demand.competence_themes || []) {
    const terms = [
      ...(t.supporting_terms || []),
      ...t.theme.split(/[\s/&,·]+/).filter(w => w.length >= 5),
    ];
    const hit = terms.some(term => {
      const n = norm(term);
      return n.length >= 3 && (blob.includes(n) || (stem(n) !== n && blob.includes(stem(n))));
    });
    if (hit) {
      score += t.importance === "must" ? 2 : 1;
      themes.push(t.theme);
    }
  }
  for (const tool of demand.tools_and_systems || []) {
    const n = norm(tool);
    if (n.length >= 2 && blob.includes(n)) score += 1;
  }
  return { score, themes };
}

/**
 * Build the cut plan. Returns null when the CV is already inside the budget or
 * there is no demand profile to judge relevance against.
 */
export function cutPlan(
  cv: CVContent,
  demand: CVMeta["demandProfile"] | undefined,
  targetPages = 2,
): CutPlanResult | null {
  if (!demand?.competence_themes?.length) return null;
  const est = estimatePages(cv);
  if (est.pages <= targetPages) return null;
  const linesOver = est.lines - targetPages * LINES_PER_PAGE;

  interface Candidate extends CutItem { score: number }
  const candidates: Candidate[] = [];
  const gems: BuriedGem[] = [];

  (cv.experience || []).forEach((e, ei) => {
    (e.bullets || []).forEach((b, bi) => {
      if (!b.trim()) return;
      const { score, themes } = bulletScore(b, demand);
      // The top of the two latest roles is protected: that's the six-second read,
      // and reordering (not cutting) is the tool there.
      const isProtected = ei <= 1 && bi < 2;
      if (!isProtected) {
        if (score === 0) {
          candidates.push({ expIndex: ei, bulletIdx: bi, bullet: b, roleTitle: e.title || e.company || `Roll ${ei + 1}`, reason: "no-theme", lines: bulletLines(b), score });
        } else if (ei >= 2 && bi >= 3) {
          // Even relevant depth in a role two jobs back rarely earns its lines.
          candidates.push({ expIndex: ei, bulletIdx: bi, bullet: b, roleTitle: e.title || e.company || `Roll ${ei + 1}`, reason: "old-role-depth", lines: bulletLines(b), score });
        }
      }
      // Buried gem: a bullet that carries must-theme weight, sitting below the fold
      // of a recent role. Cutting elsewhere should be paired with lifting these.
      if (ei <= 1 && bi >= 3 && score >= 2) {
        gems.push({ expIndex: ei, bulletIdx: bi, bullet: b, roleTitle: e.title || e.company || `Roll ${ei + 1}`, themes });
      }
    });
  });

  // Zero-relevance first, then oldest role, then deepest position.
  candidates.sort((a, b) =>
    (a.score - b.score) || (b.expIndex - a.expIndex) || (b.bulletIdx - a.bulletIdx));

  const items: CutItem[] = [];
  let saved = 0;
  for (const c of candidates) {
    if (saved >= linesOver || items.length >= 20) break;
    items.push({ expIndex: c.expIndex, bulletIdx: c.bulletIdx, bullet: c.bullet, roleTitle: c.roleTitle, reason: c.reason, lines: c.lines });
    saved += c.lines;
  }
  if (!items.length) return null;

  return {
    items,
    gems: gems.sort((a, b) => b.themes.length - a.themes.length).slice(0, 3),
    pagesNow: est.pages,
    pagesAfter: Math.max(1, Math.ceil((est.lines - saved) / LINES_PER_PAGE)),
    linesSaved: saved,
  };
}

/** Apply a plan: the bullets to keep per experience index, ready for onUpdateExperienceBullets. */
export function applyCutPlan(cv: CVContent, items: CutItem[]): { expIndex: number; bullets: string[] }[] {
  const byExp = new Map<number, Set<number>>();
  for (const it of items) {
    if (!byExp.has(it.expIndex)) byExp.set(it.expIndex, new Set());
    byExp.get(it.expIndex)!.add(it.bulletIdx);
  }
  const out: { expIndex: number; bullets: string[] }[] = [];
  for (const [expIndex, drop] of byExp) {
    const exp = cv.experience[expIndex];
    if (!exp) continue;
    // Only apply when the bullets are unchanged since the plan was computed.
    const stillValid = items.every(it => it.expIndex !== expIndex || exp.bullets[it.bulletIdx] === it.bullet);
    if (!stillValid) continue;
    out.push({ expIndex, bullets: exp.bullets.filter((_, i) => !drop.has(i)) });
  }
  return out;
}
