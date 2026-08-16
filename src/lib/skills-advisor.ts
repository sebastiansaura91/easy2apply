import { CVContent, CVMeta } from "@/types/cv";
import { collectProxyTerms, isPedigreeTerm } from "./pedigree";

/**
 * Deterministic skills-section advisor. Zero AI calls.
 *
 * Evidence base (researched): 8-12 skills is the sweet spot — above that reads as
 * padding to recruiters; Teamtailor (dominant in Sweden) has NO automated scoring,
 * so the list's job is human skim + recruiter search, which rewards the ad's exact
 * words in the ad's language; Workday matches literal tokens, so exact wording never
 * costs anything. Selection order: named tools first, then one concrete term per
 * demand theme. Never generic one-word soft skills, never a term and its synonym.
 *
 * Honesty gate: a skill is only suggested for ADDING when the CV text or the user's
 * verified answers already prove it — unproven ad terms route to the question flow.
 */

export interface SkillsAdvice {
  /** Ad terms missing from the skills list and proven by CV text or verified answers. */
  add: { term: string; theme?: string }[];
  /** Ad terms nothing proves yet — ask, never claim. */
  unproven: { term: string; theme?: string }[];
  /** Current skill that names the same competence in other words — swap to the ad's term. */
  reword: { from: string; to: string }[];
  /** Least ad-relevant current skills beyond the cap — candidates for the character budget. */
  trim: string[];
  cap: number;
  current: number;
}

const CAP = 12;

const norm = (s: string) => s.toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();
const stem = (s: string) => (s.length >= 6 ? s.replace(/(erna|arna|orna|en|et|er|ar|or|s)$/i, "") : s);

// Cross-language/synonym pairs mirrored from the server's matching table: a current
// skill naming the same competence in the other language is a REWORD, not a duplicate.
const SYNONYM_GROUPS: string[][] = [
  ["prissättning", "pricing"],
  ["förändringsledning", "change management"],
  ["affärsutveckling", "business development"],
  ["verksamhetsutveckling", "operational development"],
  ["projektledning", "project management"],
  ["tvärfunktionell projektledning", "cross functional project management"],
  ["digitalisering", "digital transformation", "digitalization"],
  ["automatisering", "automation", "processautomatisering", "process automation"],
  ["ledningsgrupp", "management team"],
  ["effektmätning", "impact measurement", "benefits realization"],
  ["strategisk planering", "strategic planning"],
  ["m&a", "due diligence", "förvärv"],
  ["affärsanalys", "business analysis"],
];
const groupOf = (n: string): number => SYNONYM_GROUPS.findIndex(g => g.some(t => norm(t) === n));

// Generic one-word soft skills never belong in the list — they get proven in bullets.
const SOFT_ONE_WORDERS = new Set([
  "ledarskap", "leadership", "kommunikation", "communication", "driv", "engagemang",
  "samarbete", "teamwork", "flexibilitet", "flexibility", "kreativitet", "creativity",
]);

export function adviseSkills(
  cv: CVContent,
  profile: CVMeta["demandProfile"] | undefined,
  evidence: { keyword: string; answer: string }[] | undefined,
): SkillsAdvice | null {
  const themes = profile?.competence_themes || [];
  if (!themes.length) return null;

  const proxies = collectProxyTerms(profile);
  const targets: { term: string; theme?: string }[] = [];
  const seen = new Set<string>();
  const push = (term: string, theme?: string) => {
    const t = String(term || "").trim();
    if (!t || targets.length >= CAP) return;
    if (t.split(/\s+/).length > 4) return; // skills are short noun phrases
    if (isPedigreeTerm(t, proxies)) return; // brands are class labels, never skills
    const n = norm(t);
    if (!n || seen.has(n) || SOFT_ONE_WORDERS.has(n)) return;
    const g = groupOf(n);
    if (g >= 0 && targets.some(x => groupOf(norm(x.term)) === g)) return; // one concept, one entry
    seen.add(n);
    targets.push({ term: t, theme });
  };

  // Selection order: named tools → one/two terms per must theme → nice themes → fill.
  (profile?.tools_and_systems || []).forEach(t => push(t));
  const ordered = [...themes].sort((a, b) => (a.importance === "must" ? 0 : 1) - (b.importance === "must" ? 0 : 1));
  for (const th of ordered) (th.supporting_terms || []).slice(0, 2).forEach(s => push(s, th.theme));
  for (const th of ordered) (th.supporting_terms || []).slice(2).forEach(s => push(s, th.theme));

  const skills = (cv.skills || []).map(s => s.trim()).filter(Boolean);
  const skillsNorm = skills.map(norm);
  const blob = norm(JSON.stringify([cv.profile, cv.experience, cv.certifications, cv.other]));
  const evText = norm((evidence || []).map(e => `${e.keyword} ${e.answer}`).join(" "));

  const inSkills = (n: string) =>
    skillsNorm.some(s => s === n || s.includes(n) || (n.length >= 5 && s.length >= 5 && n.includes(s)));
  const provenIn = (hay: string, n: string) => hay.includes(n) || (stem(n) !== n && hay.includes(stem(n)));
  const proven = (n: string) => provenIn(blob, n) || provenIn(evText, n);

  const add: SkillsAdvice["add"] = [];
  const unproven: SkillsAdvice["unproven"] = [];
  for (const t of targets) {
    const n = norm(t.term);
    if (inSkills(n)) continue;
    // Synonym already listed → reword case, handled below, not an add.
    const g = groupOf(n);
    if (g >= 0 && skillsNorm.some(s => groupOf(s) === g)) continue;
    (proven(n) ? add : unproven).push(t);
  }

  const reword: SkillsAdvice["reword"] = [];
  for (let i = 0; i < skills.length; i++) {
    const g = groupOf(skillsNorm[i]);
    if (g < 0) continue;
    const target = targets.find(t => groupOf(norm(t.term)) === g && norm(t.term) !== skillsNorm[i]);
    if (target && !inSkills(norm(target.term))) reword.push({ from: skills[i], to: target.term });
  }

  // Over the cap: keep everything the ad asks for; the rest are trim candidates,
  // least-recently-listed last (end of list goes first).
  const trim: string[] = [];
  if (skills.length > CAP) {
    const relevant = (s: string, i: number) => {
      const n = skillsNorm[i];
      const g = groupOf(n);
      return targets.some(t => {
        const tn = norm(t.term);
        return tn === n || tn.includes(n) || n.includes(tn) || (g >= 0 && groupOf(tn) === g);
      });
    };
    const candidates = skills.filter((s, i) => !relevant(s, i));
    trim.push(...candidates.slice(-(skills.length - CAP)));
  }

  return { add, unproven, reword, trim, cap: CAP, current: skills.length };
}
