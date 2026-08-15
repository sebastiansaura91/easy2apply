import { CVContent } from "@/types/cv";

export interface SixSecondThemeCheck {
  theme: string;
  visible: boolean;
}

export interface SixSecondResult {
  /** Must-themes only: does the top third of page 1 show each one? */
  themes: SixSecondThemeCheck[];
  /** How many of the latest role's first bullets carry a number. */
  quantifiedTop: number;
  topCount: number;
  /** A safe, honest fix: move an existing proof bullet to the top of the latest role. */
  suggestion?: { expIndex: number; fromIndex: number; bullet: string; theme: string };
}

interface ThemeLike {
  theme: string;
  importance: string;
  supporting_terms_present?: string[];
  supporting_terms?: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Deterministic six-second pass: recruiters spend their first seconds on the top
 * third of page 1 — the profile line and the latest role's first bullets. A
 * must-theme "shows" when any of its supporting terms (or a distinctive word from
 * the theme name) appears there literally. No model, no score impact.
 */
export function sixSecondTest(cv: CVContent, themes: ThemeLike[]): SixSecondResult | null {
  const must = themes.filter(t => t.importance === "must");
  const exp = cv.experience?.[0];
  if (!must.length || !exp) return null;

  const top = (exp.bullets || []).slice(0, 3);
  const topBlob = norm([cv.profile || "", exp.title || "", ...top].join(" \n "));

  const termsOf = (t: ThemeLike) => [
    ...(t.supporting_terms_present || []),
    ...(t.supporting_terms || []),
    ...t.theme.split(/[\s/&,·]+/).filter(w => w.length >= 5),
  ];
  const hitIn = (blob: string) => (term: string) => {
    const n = norm(term);
    return n.length >= 3 && blob.includes(n);
  };

  const checks = must.map(t => ({ theme: t.theme, visible: termsOf(t).some(hitIn(topBlob)) }));

  // Reorder suggestion: the first invisible must-theme that already has a proof
  // bullet lower down in the same role. Pure reordering — zero honesty risk.
  let suggestion: SixSecondResult["suggestion"];
  const rest = (exp.bullets || []).slice(3);
  outer: for (const c of checks) {
    if (c.visible) continue;
    const src = must.find(m => m.theme === c.theme)!;
    for (let i = 0; i < rest.length; i++) {
      if (termsOf(src).some(hitIn(norm(rest[i])))) {
        suggestion = { expIndex: 0, fromIndex: i + 3, bullet: rest[i], theme: c.theme };
        break outer;
      }
    }
  }

  return {
    themes: checks,
    quantifiedTop: top.filter(b => /\d/.test(b)).length,
    topCount: top.length,
    suggestion,
  };
}
