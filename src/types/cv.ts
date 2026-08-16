export interface ContactInfo {
  name: string;
  email: string;
  phone: string;
  city: string;
  linkedin: string;
  website: string;
}

export interface ExperienceItem {
  id: string;
  title: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  isPresent: boolean;
  bullets: string[];
  pnlSize?: string;
  headcount?: string;
  revenueImpact?: string;
  roleScope?: string;
  bulletStyle?: "bulleted" | "numbered";
}

export interface EducationItem {
  id: string;
  degree: string;
  school: string;
  field: string;
  startDate: string;
  endDate: string;
}

export interface CertificationItem {
  id: string;
  name: string;
  issuer: string;
  date: string;
}

export interface ProjectItem {
  id: string;
  name: string;
  description: string;
  bullets: string[];
}

export interface LanguageItem {
  id: string;
  language: string;
  level: string;
}

export interface CVSection {
  id: string;
  type: "contact" | "profile" | "experience" | "education" | "skills" | "certifications" | "projects" | "languages" | "other";
  enabled: boolean;
  order: number;
}

/**
 * App-level metadata stored alongside CV content (inside content_json). Kept separate
 * from the document fields so it never affects PDF/preview output. Enables the dashboard
 * to group master templates vs. job-tailored copies without a DB schema change.
 */
export interface CVMeta {
  isTemplate?: boolean;
  tailoredForJob?: string;
  tailoredForCompany?: string;
  /** Raw job posting pasted when the application was created — persisted so role-fit context survives a reload. */
  jobPostingText?: string;
  /** Last deep ATS score for THIS CV — the one score shown everywhere, surviving reloads. */
  lastAtsScore?: {
    score: number;
    grade: string;
    at: string;
    /** Subscores kept so the next scan can show what improved. */
    subscores?: { parse: number; scanability: number; relevance: number; evidence: number };
  };
  /**
   * Full last analysis + a hash of the input it was computed from. The model is not
   * perfectly deterministic even at temperature 0, so unchanged input returns THIS
   * stored result instead of re-sampling — stability by construction.
   */
  lastAtsResult?: { hash: string; at: string; result: unknown };
  /** Same stability contract for the role-fit analysis. */
  lastRoleFit?: { hash: string; at: string; result: unknown };
  /**
   * The employer's demand profile extracted from the ad at application creation —
   * the single source of truth every later scan anchors to (report and editor must
   * always show the same themes).
   */
  demandProfile?: {
    competence_themes?: {
      theme: string; importance: "must" | "nice"; supporting_terms: string[];
      /** Pedigree examples from the ad (firm names, MBB, Big 4) — class labels, never CV keywords. */
      proxy_terms?: string[];
      /** What the pedigree stands for, in the ad's language — powers the "motsvarande" bridge. */
      proxy_translation?: string | null;
      canonical_id?: string | null;
    }[];
    knockout_requirements?: string[];
    /** Explicitly named products/technologies — exact-match keywords, separate from competence judgment. */
    tools_and_systems?: string[];
  };
  /** Themes the user has consciously accepted as honest gaps — shown muted, never nagged. */
  acceptedGaps?: string[];
  /**
   * Readiness checks (Färdigmodellen) the user has consciously waived — prefixed ids
   * like "six:Transformation", "profile:X", "scope:exp-1", "length", "skills".
   */
  acceptedChecks?: string[];
  /** The knockout-requirements card has been acknowledged — don't lead the queue with it again. */
  knockoutsAcked?: boolean;
  /** Honest answers to the ad's hard requirements — "no" means likely screen-out, said out loud. */
  knockoutAnswers?: Record<string, "yes" | "no">;
  /** Lifecycle after the CV leaves the app — the tracking half. Readiness statuses stop here. */
  applicationStatus?: { stage: "sent" | "interview" | "offer" | "rejected"; at: string };
  /** One-step undo: the document as it was before the last automatic change (swap = redo). */
  lastSnapshot?: { at: string; label: string; doc: Omit<CVContent, "__meta"> };
  /**
   * Verified answers from the guided interview — permanent evidence of real experience.
   * The competence map (Profilen) aggregates these across every CV, so a question
   * answered once is never asked again and never lost.
   */
  verifiedEvidence?: { keyword: string; answer: string; at: string; role?: string }[];
  /** Marks the hidden resume row that stores the canonical competence registry. */
  isRegistryRow?: boolean;
  /** The registry itself — only present on the registry row. See lib/competence-registry. */
  competenceRegistry?: {
    version: number;
    updatedAt: string;
    competences: { id: string; name_sv: string; name_en: string; aliases: string[]; escoUri?: string; escoLabels?: string[] }[];
  };
  createdFrom?: string;
  /**
   * Your one true "base profile" — the canonical set of real facts. Role templates are
   * angled copies of this. Only one resume should carry this flag.
   */
  isBaseProfile?: boolean;
  /**
   * The role this CV is angled for (e.g. "head-of-commercial"). Same person, different
   * emphasis. Used to group role templates on the dashboard and to surface role-specific
   * advice in the editor. Free-text custom roles are allowed.
   */
  targetRole?: string;
  /** Human-readable label for a custom target role that isn't in the preset list. */
  targetRoleLabel?: string;
  /** Chosen visual template style id (see lib/templates.ts). Defaults to "classic". */
  templateStyle?: string;
  /** Optional accent colour hex overriding the style's default accent. */
  templateAccent?: string;
}

export interface CVContent {
  contact: ContactInfo;
  profile: string;
  experience: ExperienceItem[];
  education: EducationItem[];
  skills: string[];
  certifications: CertificationItem[];
  projects: ProjectItem[];
  languages: LanguageItem[];
  other: string;
  sections: CVSection[];
  __meta?: CVMeta;
}

/**
 * ATS-recommended section order (hybrid format): summary and core competencies first —
 * the parser weights them heaviest — then reverse-chronological experience.
 */
export const atsSectionOrder: CVSection["type"][] = [
  "contact", "profile", "skills", "experience", "education", "certifications", "projects", "languages", "other",
];

export const defaultSections: CVSection[] = [
  { id: "contact", type: "contact", enabled: true, order: 0 },
  { id: "profile", type: "profile", enabled: true, order: 1 },
  { id: "skills", type: "skills", enabled: true, order: 2 },
  { id: "experience", type: "experience", enabled: true, order: 3 },
  { id: "education", type: "education", enabled: true, order: 4 },
  { id: "certifications", type: "certifications", enabled: false, order: 5 },
  { id: "projects", type: "projects", enabled: false, order: 6 },
  { id: "languages", type: "languages", enabled: true, order: 7 },
  { id: "other", type: "other", enabled: false, order: 8 },
];

export const emptyCV: CVContent = {
  contact: { name: "", email: "", phone: "", city: "", linkedin: "", website: "" },
  profile: "",
  experience: [],
  education: [],
  skills: [],
  certifications: [],
  projects: [],
  languages: [],
  other: "",
  sections: [...defaultSections],
};

export const sampleCV: CVContent = {
  contact: {
    name: "Anna Lindström",
    email: "anna.lindstrom@email.com",
    phone: "+46 70 123 45 67",
    city: "Stockholm",
    linkedin: "linkedin.com/in/annalindstrom",
    website: "",
  },
  profile:
    "Erfaren Strategy & Transformation Lead med 10+ års erfarenhet av att driva strategiska förändringsinitiativ inom stora organisationer. Stark bakgrund inom affärsutveckling, digital transformation och stakeholder management. Bevisad förmåga att leda tvärfunktionella team och leverera mätbara resultat i komplexa miljöer.",
  experience: [
    {
      id: "exp-1",
      title: "Strategy & Transformation Lead",
      company: "[FYLL I Företag]",
      location: "Stockholm",
      startDate: "2020-01",
      endDate: "",
      isPresent: true,
      bullets: [
        "Ledde en portfölj av [FYLL I antal] transformationsprojekt med en total budget på [FYLL I] MSEK, levererade samtliga inom tid och budget.",
        "Utvecklade och implementerade en ny affärsstrategi som resulterade i [FYLL I]% ökad tillväxt inom 18 månader.",
        "Faciliterade workshops och beslutsprocesser med C-level stakeholders för att säkerställa strategisk alignment.",
        "Byggde och coachade ett team på [FYLL I antal] strategi- och förändringskonsulter.",
      ],
    },
    {
      id: "exp-2",
      title: "Senior Management Consultant",
      company: "[FYLL I Konsultbolag]",
      location: "Stockholm",
      startDate: "2016-03",
      endDate: "2019-12",
      isPresent: false,
      bullets: [
        "Genomförde strategiska analyser och marknadsutredningar för kunder inom [FYLL I bransch], vilket ledde till identifiering av tillväxtmöjligheter värda [FYLL I] MSEK.",
        "Designade och implementerade operativa förbättringsprogram som reducerade kostnader med [FYLL I]%.",
        "Ledde due diligence-processer vid [FYLL I antal] förvärv med ett samlat transaktionsvärde på [FYLL I] MSEK.",
      ],
    },
    {
      id: "exp-3",
      title: "Business Analyst",
      company: "[FYLL I Företag]",
      location: "Göteborg",
      startDate: "2013-08",
      endDate: "2016-02",
      isPresent: false,
      bullets: [
        "Analyserade affärsprocesser och identifierade effektiviseringsmöjligheter som sparade [FYLL I] timmar årligen.",
        "Skapade beslutsunderlag och presentationer för ledningsgruppen avseende [FYLL I].",
        "Samordnade datainsamling och modellering för prissättnings- och lönsamhetsanalyser.",
      ],
    },
  ],
  education: [
    {
      id: "edu-1",
      degree: "Civilekonomexamen",
      school: "Handelshögskolan i Stockholm",
      field: "Finansiell ekonomi & strategi",
      startDate: "2009-08",
      endDate: "2013-06",
    },
  ],
  skills: [
    "Strategisk planering",
    "Förändringsledning",
    "Digital transformation",
    "Stakeholder management",
    "Projektledning",
    "Affärsanalys",
    "Workshop-facilitering",
    "M&A / Due Diligence",
    "Prissättningsstrategi",
    "CRM-implementering",
  ],
  certifications: [
    { id: "cert-1", name: "Prosci Certified Change Practitioner", issuer: "Prosci", date: "2021" },
    { id: "cert-2", name: "PMP – Project Management Professional", issuer: "PMI", date: "2018" },
  ],
  projects: [],
  languages: [
    { id: "lang-1", language: "Svenska", level: "Modersmål" },
    { id: "lang-2", language: "Engelska", level: "Flytande" },
  ],
  other: "",
  sections: [
    { id: "contact", type: "contact", enabled: true, order: 0 },
    { id: "profile", type: "profile", enabled: true, order: 1 },
    { id: "experience", type: "experience", enabled: true, order: 2 },
    { id: "education", type: "education", enabled: true, order: 3 },
    { id: "skills", type: "skills", enabled: true, order: 4 },
    { id: "certifications", type: "certifications", enabled: true, order: 5 },
    { id: "projects", type: "projects", enabled: false, order: 6 },
    { id: "languages", type: "languages", enabled: true, order: 7 },
    { id: "other", type: "other", enabled: false, order: 8 },
  ],
};
