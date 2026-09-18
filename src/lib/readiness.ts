import { CVContent, CVMeta } from "@/types/cv";
import { detectLanguageOfText } from "@/lib/language-detection";

/**
 * Färdigmodellen: deterministic document-level checks that gate "ready to send".
 * The match score measures THEME EVIDENCE; these checks measure whether the document
 * itself communicates it — page budget, profile coverage, empty load-bearing fields.
 * Everything here is pure computation: no model, no score impact.
 */

import { norm, stem } from "@/lib/text-match";

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
  if (cv.skills?.length) lines += 2.5 + textLines(cv.skills.filter(Boolean).join(", "));
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

export interface ValuesMirrorCheck {
  word: string;
  present: boolean;
}

/**
 * Tonlägeslagret's document check: for a values-driven posting, does the recruiter's
 * first read (profile + latest role's scope line and top bullets) reflect ANY of the
 * ad's own value words? Pure string matching, lightly stemmed — no model, no score.
 */
export function valuesMirror(
  cv: CVContent,
  register: { style?: string; values_language?: string[] } | undefined,
): ValuesMirrorCheck[] {
  if (!register || (register.style !== "values" && register.style !== "mixed")) return [];
  const exp = cv.experience?.[0];
  const blob = norm([cv.profile || "", exp?.roleScope || "", ...(exp?.bullets || []).slice(0, 3)].join(" \n "));
  return (register.values_language || [])
    .filter(w => w && w.trim().length >= 3)
    .slice(0, 8)
    .map(w => {
      const n = norm(w);
      const present = !!blob && (blob.includes(n) || (stem(n) !== n && blob.includes(stem(n))));
      return { word: w, present };
    });
}

export interface ScopeDupe {
  expIndex: number;
  bulletIdx: number;
  bullet: string;
}

/**
 * G4: the role-scope ingress and a bullet saying the same thing twice — reads as
 * copy-paste sloppiness. Token overlap (stemmed) against every bullet; >=70% of
 * the shorter side shared = duplicate.
 */
export function scopeDupes(cv: CVContent): ScopeDupe[] {
  const toks = (s: string) => new Set(norm(s).split(" ").filter(w => w.length >= 3).map(stem));
  const out: ScopeDupe[] = [];
  (cv.experience || []).forEach((e, ei) => {
    const scope = (e.roleScope || "").trim();
    if (scope.length < 30) return;
    const st = toks(scope);
    if (st.size < 5) return;
    (e.bullets || []).forEach((b, bi) => {
      const bt = toks(b);
      if (bt.size < 5) return;
      const inter = [...bt].filter(w => st.has(w)).length;
      if (inter / Math.min(bt.size, st.size) >= 0.7) out.push({ expIndex: ei, bulletIdx: bi, bullet: b });
    });
  });
  return out;
}

export interface LeadershipEvidence {
  verbHits: number;
  teamSizes: number;
  strong: boolean;
}

/**
 * G2 (Altitudkollen): does the CV show leading THROUGH people, or only doing?
 * Deterministic counts of leadership verbs and stated team sizes (headcount
 * fields included). "Strong" needs at least one size AND repeated lead verbs.
 */
const LEAD_VERB_RE = /\b(ledde|leder|coachade|coachar|rekryterade|personalansvar|ledningsgrupp(en)?|utvecklingssamtal|direktrapporterande|managed|led|leading|coached|mentored|hired|direct reports?)\b/gi;
const TEAM_SIZE_RE = /\b\d+\s*(direktrapporterande|medarbetare|chefer|utvecklare|personer|anställda|direct reports?|managers|developers|employees|people|fte)\b|\bteam\s+(of|på)\s+\d+\b/gi;

export function leadershipEvidence(cv: CVContent): LeadershipEvidence {
  const text = [
    cv.profile || "",
    ...(cv.experience || []).flatMap(e => [e.roleScope || "", e.headcount || "", ...(e.bullets || [])]),
  ].join(" \n ");
  const verbHits = (text.match(LEAD_VERB_RE) || []).length;
  const sizeHits = (text.match(TEAM_SIZE_RE) || []).length
    + (cv.experience || []).filter(e => (e.headcount || "").trim()).length;
  return { verbHits, teamSizes: sizeHits, strong: sizeHits >= 1 && verbHits >= 3 };
}

/** The ad reads as a leadership hire: stored seniority, or the job title says chef. */
export function isLeadershipAd(meta: CVMeta | undefined): boolean {
  const s = meta?.demandProfile?.seniority || "";
  if (s === "Management" || s === "Upper Management") return true;
  return /(^|\s)(chef|chefen|head of|director|vp|vice president|manager|ledare)(\s|$|,)/i.test(meta?.tailoredForJob || "");
}

/**
 * G3: Swedish ad, English CV (or vice versa) is silent friction. Ad language from
 * the demand profile when stored, else detected from the pasted posting text.
 * Returns the ad's language when it mismatches the CV, else null.
 */
export function adCvLanguageMismatch(meta: CVMeta | undefined, cvLanguage: "sv" | "en"): "sv" | "en" | null {
  let ad = (meta?.demandProfile as { ad_language?: string } | undefined)?.ad_language;
  if (ad !== "sv" && ad !== "en") {
    const text = (meta?.jobPostingText || "").trim();
    if (text.length < 80) return null;
    const det = detectLanguageOfText(text);
    if ((det.language !== "sv" && det.language !== "en") || det.confidence < 0.7) return null;
    ad = det.language;
  }
  return ad !== cvLanguage ? ad : null;
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
