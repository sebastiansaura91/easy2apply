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

export const defaultSections: CVSection[] = [
  { id: "contact", type: "contact", enabled: true, order: 0 },
  { id: "profile", type: "profile", enabled: true, order: 1 },
  { id: "experience", type: "experience", enabled: true, order: 2 },
  { id: "education", type: "education", enabled: true, order: 3 },
  { id: "skills", type: "skills", enabled: true, order: 4 },
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
