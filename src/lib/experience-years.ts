import { CVContent } from "@/types/cv";

/**
 * Quantitative requirements ("minst 5 års erfarenhet av försäljning") matched
 * deterministically against the CV's own timeline — the thing the big matchers
 * (HiredScore, Lightcast) compute from work history and consumer tools skip.
 */
export interface YearsRequirement { years: number; subject: string }

/** Pull "N år/years" plus its subject out of a requirement sentence. */
export function parseYearsRequirement(text: string): YearsRequirement | null {
  const m = text.match(/(\d{1,2})\s*\+?\s*års?\b/i) || text.match(/(\d{1,2})\s*\+?\s*years?['’]?\b/i);
  if (!m) return null;
  const years = parseInt(m[1], 10);
  if (!years || years > 40) return null;
  const subject = text
    .replace(m[0], " ")
    .replace(/\b(minst|mer än|dokumenterad|erfarenhet|arbetslivserfarenhet|av|inom|som|at least|more than|proven|experience|of|in|as|working|with)\b/gi, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { years, subject };
}

const STOP = new Set(["och", "and", "the", "för", "for", "med", "with", "eller", "or"]);
const words = (s: string) =>
  s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(w => w.length >= 3 && !STOP.has(w));

const ym = (d: string): number | null => {
  const m = (d || "").match(/^(\d{4})(?:-(\d{2}))?/);
  if (!m) return null;
  return parseInt(m[1], 10) * 12 + (m[2] ? parseInt(m[2], 10) - 1 : 0);
};

/**
 * Years of experience the timeline supports for a subject: roles whose title or
 * bullets mention the subject's words count; overlapping periods are merged so
 * parallel roles are never double-counted. Empty subject = whole career.
 */
export function yearsOfExperience(cv: CVContent, subject: string, now = new Date()): number {
  const want = words(subject);
  const nowYm = now.getFullYear() * 12 + now.getMonth();
  const spans: [number, number][] = [];
  for (const e of cv.experience) {
    if (want.length > 0) {
      const hay = new Set(words(`${e.title} ${e.company} ${(e.bullets || []).join(" ")}`));
      const hits = want.filter(w => hay.has(w)).length;
      if (hits < Math.min(want.length, 2) || hits === 0) continue;
    }
    const start = ym(e.startDate);
    const end = e.isPresent ? nowYm : ym(e.endDate);
    if (start === null || end === null || end < start) continue;
    spans.push([start, end]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  let months = 0;
  let curS = Number.NEGATIVE_INFINITY, curE = Number.NEGATIVE_INFINITY;
  for (const [s, e] of spans) {
    if (s > curE) {
      if (curE > curS) months += curE - curS;
      curS = s; curE = e;
    } else if (e > curE) curE = e;
  }
  if (curE > curS) months += curE - curS;
  return Math.round((months / 12) * 2) / 2;
}
