/**
 * Client-side CV quality analysis — gives instant, actionable feedback
 * on what specifically needs to change.
 */

import { CVContent } from "@/types/cv";

export type IssueSeverity = "error" | "warning" | "tip";

export interface CvIssue {
  id: string;
  severity: IssueSeverity;
  section: string;        // e.g. "experience", "contact", "profile"
  title: string;
  description: string;
  fix: string;
  /** If this issue is about a specific bullet */
  bulletPath?: string;
}

export interface BulletQuality {
  index: number;
  expIndex: number;
  section: "experience" | "projects";
  score: "good" | "okay" | "weak";
  issues: string[];
}

// ── Generic / weak verb patterns ──
const WEAK_STARTS_SV = ["ansvarade för", "arbetade med", "hjälpte till", "var delaktig", "deltog i", "bidrog till", "sysslade med"];
const WEAK_STARTS_EN = ["responsible for", "worked with", "helped", "assisted", "participated in", "contributed to", "involved in"];

const STRONG_VERB_PATTERN_SV = /^(ledde|drev|ökade|minskade|utvecklade|implementerade|byggde|skapade|lanserade|förhandlade|säkrade|optimerade|automatiserade|etablerade|införde|designade|analyserade|förbättrade|levererade|samordnade)/i;
const STRONG_VERB_PATTERN_EN = /^(led|drove|increased|decreased|developed|implemented|built|created|launched|negotiated|secured|optimized|automated|established|introduced|designed|analyzed|improved|delivered|coordinated|managed|spearheaded|orchestrated|transformed|reduced|accelerated|generated|streamlined)/i;

const METRIC_PATTERN = /\d+\s*(%|kr|SEK|USD|EUR|MSEK|MUSD|x|ggr|gånger|times|units|users|customers|kunder|deals|leads|points|poäng)/i;
const NUMBER_PATTERN = /\d/;

const PLACEHOLDER_PATTERN = /\[.*?\]|\{.*?\}|FYLL I|TBD|TODO|XXX|___/i;

export function analyzeBullet(text: string, lang: "sv" | "en"): { score: "good" | "okay" | "weak"; issues: string[] } {
  if (!text.trim()) return { score: "weak", issues: [] };
  
  const issues: string[] = [];
  const lower = text.toLowerCase().trim();
  
  // Check for placeholders
  if (PLACEHOLDER_PATTERN.test(text)) {
    issues.push(lang === "sv" ? "Innehåller platshållare" : "Contains placeholders");
  }

  // Check for weak/generic starts
  const weakStarts = lang === "sv" ? WEAK_STARTS_SV : WEAK_STARTS_EN;
  if (weakStarts.some(w => lower.startsWith(w))) {
    issues.push(lang === "sv" ? "Börjar med generisk aktivitet" : "Starts with generic activity");
  }

  // Check for strong verb start
  const strongPattern = lang === "sv" ? STRONG_VERB_PATTERN_SV : STRONG_VERB_PATTERN_EN;
  if (!strongPattern.test(text.trim()) && !issues.some(i => i.includes("generisk") || i.includes("generic"))) {
    issues.push(lang === "sv" ? "Saknar starkt verb i början" : "Missing strong action verb");
  }

  // Check for metrics/numbers
  if (!NUMBER_PATTERN.test(text)) {
    issues.push(lang === "sv" ? "Inga siffror eller mätetal" : "No numbers or metrics");
  } else if (!METRIC_PATTERN.test(text)) {
    issues.push(lang === "sv" ? "Har siffror men saknar tydligt mätetal" : "Has numbers but no clear metric");
  }

  // Check length
  if (text.length > 200) {
    issues.push(lang === "sv" ? "För lång (>200 tecken)" : "Too long (>200 chars)");
  } else if (text.length < 30) {
    issues.push(lang === "sv" ? "Mycket kort — lägg till kontext" : "Very short — add context");
  }

  // Score
  let score: "good" | "okay" | "weak";
  if (issues.length === 0) score = "good";
  else if (issues.length <= 1 && !issues.some(i => i.includes("generisk") || i.includes("generic") || i.includes("platshållare") || i.includes("placeholder"))) score = "okay";
  else score = "weak";

  return { score, issues };
}

export function analyzeAllBullets(cv: CVContent, lang: "sv" | "en"): BulletQuality[] {
  const results: BulletQuality[] = [];
  
  cv.experience.forEach((exp, ei) => {
    exp.bullets.forEach((bullet, bi) => {
      if (!bullet.trim()) return;
      const { score, issues } = analyzeBullet(bullet, lang);
      results.push({ index: bi, expIndex: ei, section: "experience", score, issues });
    });
  });

  cv.projects.forEach((proj, pi) => {
    proj.bullets.forEach((bullet, bi) => {
      if (!bullet.trim()) return;
      const { score, issues } = analyzeBullet(bullet, lang);
      results.push({ index: bi, expIndex: pi, section: "projects", score, issues });
    });
  });

  return results;
}

export function findCvIssues(cv: CVContent, lang: "sv" | "en"): CvIssue[] {
  const issues: CvIssue[] = [];
  const isSv = lang === "sv";

  // Contact completeness
  if (!cv.contact.name) {
    issues.push({ id: "no-name", severity: "error", section: "contact", title: isSv ? "Namn saknas" : "Name missing", description: isSv ? "Utan namn kan rekryteraren inte identifiera dig." : "Without a name, the recruiter can't identify you.", fix: isSv ? "Fyll i ditt fullständiga namn" : "Enter your full name" });
  }
  if (!cv.contact.email) {
    issues.push({ id: "no-email", severity: "error", section: "contact", title: isSv ? "E-post saknas" : "Email missing", description: isSv ? "E-post är det primära sättet för rekryterare att nå dig." : "Email is the primary way recruiters reach you.", fix: isSv ? "Lägg till din e-postadress" : "Add your email address" });
  }
  if (!cv.contact.phone) {
    issues.push({ id: "no-phone", severity: "warning", section: "contact", title: isSv ? "Telefonnummer saknas" : "Phone number missing", description: isSv ? "De flesta rekryterare föredrar att ringa." : "Most recruiters prefer to call.", fix: isSv ? "Lägg till telefonnummer" : "Add phone number" });
  }

  // Profile
  const enabledSections = cv.sections.filter(s => s.enabled).map(s => s.type);
  if (enabledSections.includes("profile")) {
    if (!cv.profile || cv.profile.length < 20) {
      issues.push({ id: "empty-profile", severity: "error", section: "profile", title: isSv ? "Profiltexten är för kort" : "Profile text too short", description: isSv ? "Profilen är det första en rekryterare läser. Den behöver sälja din erfarenhet på 2–3 meningar." : "The profile is the first thing a recruiter reads. It needs to sell your experience in 2–3 sentences.", fix: isSv ? "Skriv en sammanfattning på 2–4 meningar" : "Write a 2–4 sentence summary" });
    }
  }

  // Experience
  if (cv.experience.length === 0 && enabledSections.includes("experience")) {
    issues.push({ id: "no-experience", severity: "error", section: "experience", title: isSv ? "Inga erfarenheter tillagda" : "No experience added", description: isSv ? "Erfarenhet är den viktigaste sektionen i ditt CV." : "Experience is the most important section in your CV.", fix: isSv ? "Lägg till minst en erfarenhet" : "Add at least one experience" });
  }

  // Check for empty dates
  cv.experience.forEach((exp, i) => {
    if (!exp.startDate) {
      issues.push({ id: `exp-${i}-no-date`, severity: "warning", section: "experience", title: isSv ? `"${exp.title || `Roll ${i+1}`}" saknar startdatum` : `"${exp.title || `Role ${i+1}`}" missing start date`, description: isSv ? "Rekryterare vill se tidslinjen i din karriär." : "Recruiters want to see your career timeline.", fix: isSv ? "Lägg till start- och slutdatum" : "Add start and end dates" });
    }
  });

  // Future dates on experience
  const todayMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const currentYear = new Date().getFullYear();
  cv.experience.forEach((exp, i) => {
    if (exp.startDate && exp.startDate > todayMonth) {
      issues.push({ id: `exp-${i}-future-start`, severity: "error", section: "experience", title: isSv ? `"${exp.title || `Roll ${i+1}`}" har framtida startdatum` : `"${exp.title || `Role ${i+1}`}" has future start date`, description: isSv ? "Startdatum ligger i framtiden, vilket flaggas som fel av rekryterare." : "Start date is in the future, which is flagged as an error by recruiters.", fix: isSv ? "Justera startdatum till nutid eller tidigare" : "Adjust start date to today or earlier" });
    }
    if (!exp.isPresent && exp.endDate && exp.endDate > todayMonth) {
      issues.push({ id: `exp-${i}-future-end`, severity: "error", section: "experience", title: isSv ? `"${exp.title || `Roll ${i+1}`}" har framtida slutdatum` : `"${exp.title || `Role ${i+1}`}" has future end date`, description: isSv ? "Slutdatum ligger i framtiden." : "End date is in the future.", fix: isSv ? "Markera som 'Nuvarande' eller välj ett datum i nutid/dåtid" : "Mark as 'Present' or pick a date in the past/today" });
    }
  });

  // Overlapping employment periods at the SAME company
  const byCompany = new Map<string, { idx: number; exp: typeof cv.experience[number] }[]>();
  cv.experience.forEach((exp, i) => {
    const key = (exp.company || "").trim().toLowerCase();
    if (!key) return;
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key)!.push({ idx: i, exp });
  });
  for (const [, items] of byCompany) {
    if (items.length < 2) continue;
    // Sort by start
    const sorted = [...items].sort((a, b) => (a.exp.startDate || "").localeCompare(b.exp.startDate || ""));
    for (let j = 0; j < sorted.length - 1; j++) {
      const a = sorted[j];
      const b = sorted[j + 1];
      const aEnd = a.exp.isPresent ? "9999-99" : (a.exp.endDate || "");
      const bStart = b.exp.startDate || "";
      if (aEnd && bStart && aEnd > bStart) {
        const company = a.exp.company;
        issues.push({
          id: `exp-overlap-${a.idx}-${b.idx}`,
          severity: "warning",
          section: "experience",
          title: isSv ? `Överlappande datum hos ${company}` : `Overlapping dates at ${company}`,
          description: isSv
            ? `"${a.exp.title}" och "${b.exp.title}" har överlappande perioder. Det förvirrar rekryteraren och tolkas som fel.`
            : `"${a.exp.title}" and "${b.exp.title}" overlap in time. This confuses recruiters and is read as an error.`,
          fix: isSv
            ? "Sätt slutdatum på den tidigare rollen innan den senare börjar, eller förklara att rollerna var parallella i punkterna."
            : "Set the end date of the earlier role before the next one starts, or clarify that the roles were concurrent in the bullets.",
        });
      }
    }
  }

  // Future-dated certifications
  cv.certifications.forEach((cert, i) => {
    const yearMatch = (cert.date || "").match(/\b(20\d{2})\b/);
    if (yearMatch) {
      const yr = parseInt(yearMatch[1], 10);
      if (yr > currentYear) {
        issues.push({
          id: `cert-${i}-future`,
          severity: "error",
          section: "certifications",
          title: isSv ? `"${cert.name || `Certifiering ${i+1}`}" är daterad i framtiden` : `"${cert.name || `Certification ${i+1}`}" is dated in the future`,
          description: isSv ? "Framtida datum på certifieringar uppfattas som ett misstag." : "Future-dated certifications read as a mistake.",
          fix: isSv ? "Använd det år certifieringen faktiskt erhölls (max innevarande år)." : "Use the year the certification was actually obtained (max current year).",
        });
      }
    }
  });

  // Bullet quality
  const bulletAnalysis = analyzeAllBullets(cv, lang);
  const weakBullets = bulletAnalysis.filter(b => b.score === "weak");
  if (weakBullets.length > 0) {
    const topIssueTypes = new Map<string, number>();
    weakBullets.forEach(b => b.issues.forEach(issue => topIssueTypes.set(issue, (topIssueTypes.get(issue) || 0) + 1)));
    const sortedIssues = [...topIssueTypes.entries()].sort((a, b) => b[1] - a[1]);
    
    if (sortedIssues.length > 0) {
      const [topIssue, count] = sortedIssues[0];
      issues.push({
        id: "weak-bullets",
        severity: "warning",
        section: "experience",
        title: isSv ? `${weakBullets.length} punkter behöver förbättras` : `${weakBullets.length} bullets need improvement`,
        description: isSv 
          ? `Vanligaste problemet: "${topIssue}" (${count} punkter). Svaga punkter gör att rekryteraren hoppar vidare.`
          : `Most common issue: "${topIssue}" (${count} bullets). Weak bullets make recruiters skip ahead.`,
        fix: isSv ? "Klicka ✨ på varje punkt för AI-förbättring" : "Click ✨ on each bullet for AI improvement",
      });
    }
  }

  // Skills
  if (cv.skills.length === 0 && enabledSections.includes("skills")) {
    issues.push({ id: "no-skills", severity: "warning", section: "skills", title: isSv ? "Inga kompetenser tillagda" : "No skills added", description: isSv ? "ATS-system matchar ofta på kompetensord." : "ATS systems often match on skill keywords.", fix: isSv ? "Lägg till relevanta kompetenser" : "Add relevant skills" });
  }

  return issues;
}
