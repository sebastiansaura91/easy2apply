import { CVContent } from "@/types/cv";

/**
 * Färdigmodellen: deterministic document-level checks that gate "ready to send".
 * The match score measures THEME EVIDENCE; these checks measure whether the document
 * itself communicates it — page budget, profile coverage, empty load-bearing fields.
 * Everything here is pure computation: no model, no score impact.
 */

const norm = (s: string) => s.toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();
const stem = (s: string) => (s.length >= 6 ? s.replace(/(erna|arna|orna|en|et|er|ar|or|s)$/i, "") : s);

/** Layout constants mirroring the A4 preview (10pt/1.4 on 160mm text width). */
const CHARS_PER_LINE = 95;
const LINES_PER_PAGE = 52;

export interface PageEstimate {
  pages: number;
  lines: number;
}

/**
 * Approximate rendered length. Deliberately labeled an ESTIMATE in the UI — the
 * exact count exists only after PDF rendering, but a recruiter's 2-page budget
 * doesn't need decimal precision to be worth enforcing.
 */
export function estimatePages(cv: CVContent): PageEstimate {
  const textLines = (s: string | undefined, width = CHARS_PER_LINE) =>
    s && s.trim() ? Math.ceil(s.trim().length / width) : 0;

  let lines = 4; // name + contact block
  if (cv.profile?.trim()) lines += 2.5 + textLines(cv.profile);
  if (cv.skills?.length) lines += 2.5 + Math.ceil(cv.skills.length / 3);
  for (const e of cv.experience || []) {
    lines += 2.5; // title + company/date line
    if (e.roleScope?.trim()) lines += textLines(e.roleScope);
    for (const b of e.bullets || []) lines += textLines(b, CHARS_PER_LINE - 5);
  }
  if (cv.education?.length) lines += 2.5 + cv.education.length * 2;
  if (cv.certifications?.length) lines += 2.5 + cv.certifications.length;
  if (cv.projects?.length) lines += 2.5 + cv.projects.length * 2;
  if (cv.languages?.length) lines += 2.5 + Math.ceil(cv.languages.length / 2);
  if (cv.other?.trim()) lines += 2.5 + textLines(cv.other);

  return { pages: Math.max(1, Math.ceil(lines / LINES_PER_PAGE)), lines: Math.round(lines) };
}

export interface ProfileCoverageCheck {
  theme: string;
  mentioned: boolean;
}

/**
 * The profile paragraph is the recruiter's first read and prime keyword real estate:
 * it should name the ad's top must-themes. A theme counts as mentioned when the
 * profile literally carries one of its supporting terms (lightly stemmed) or a
 * distinctive word from the theme name.
 */
export function profileCoverage(
  profile: string | undefined,
  mustThemes: { theme: string; supporting_terms_present?: string[]; supporting_terms_missing?: string[]; supporting_terms?: string[] }[],
): ProfileCoverageCheck[] {
  const blob = norm(profile || "");
  return mustThemes.map(t => {
    const terms = [
      ...(t.supporting_terms_present || []),
      ...(t.supporting_terms_missing || []),
      ...(t.supporting_terms || []),
      ...t.theme.split(/[\s/&,·]+/).filter(w => w.length >= 5),
    ];
    const mentioned = !!blob && terms.some(term => {
      const n = norm(term);
      if (n.length < 3) return false;
      return blob.includes(n) || (stem(n) !== n && blob.includes(stem(n)));
    });
    return { theme: t.theme, mentioned };
  });
}

export interface ShortenTarget {
  label: string;
  /** Which experience the cut lives in — for navigation. */
  expIndex: number;
}

/**
 * Concrete cuts for an over-budget CV, in the order a recruiter would make them:
 * bullets that run past two lines, then older roles carrying more than three bullets
 * (a role two jobs back earns 2-3 lines, not a biography).
 */
export function shortenTargets(cv: CVContent, max = 3): ShortenTarget[] {
  const out: ShortenTarget[] = [];
  (cv.experience || []).forEach((e, ei) => {
    for (const b of e.bullets || []) {
      if (b.length > 200 && out.length < max) {
        out.push({ label: `${e.title}: "${b.slice(0, 60)}…" (${b.length} tecken)`, expIndex: ei });
      }
    }
  });
  (cv.experience || []).forEach((e, ei) => {
    if (ei >= 2 && (e.bullets || []).length > 3 && out.length < max) {
      out.push({ label: `${e.title}: ${e.bullets.length} punkter, äldre roller bär 2–3`, expIndex: ei });
    }
  });
  return out.slice(0, max);
}
