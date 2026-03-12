export interface BulletWizardInput {
  jobTitle: string;
  period: string;
  industry: string;
  companyType: string;
  tasks: string[];
  tools: string[];
  stakeholders: string[];
  results: string;
  constraints: string;
  tone: "Saklig" | "Skärpt" | "Konsult" | "Ledarskap";
  seniority: "IC" | "Manager" | "Program" | "Head-of";
}

export interface GeneratedBullet {
  level: "bas" | "skarpt" | "max";
  bullet: string;
  tags: string[];
  confidence: "high" | "medium" | "low";
  needs_user_input: string[];
}

export interface BulletGeneratorResult {
  bullets: GeneratedBullet[];
  follow_up_questions: string[];
  blocked_phrases_detected: string[];
}

export type RefinementAction = "shorter" | "concrete" | "impact" | "verb" | "metrics" | "ats";

export const INDUSTRIES = [
  "Tech / SaaS", "Finans / Bank", "Konsult", "Retail / E-commerce",
  "Hälsa / Life Science", "Industri / Tillverkning", "Telekom / Media",
  "Offentlig sektor", "Energi / Cleantech", "Fastigheter", "Annat",
];

export const COMPANY_TYPES = [
  "Startup", "Scaleup", "Storföretag", "Konsultbolag",
  "Myndighet", "Ideell organisation", "Annat",
];

export const COMMON_TOOLS = [
  "Excel", "Power BI", "Tableau", "SQL", "Python", "Salesforce", "HubSpot",
  "SAP", "Jira", "Confluence", "Monday.com", "Asana", "Figma", "Miro",
  "Google Analytics", "AWS", "Azure", "Kubernetes", "Docker",
  "Slack", "Teams", "SharePoint", "CPQ", "ERP",
];

export const COMMON_STAKEHOLDERS = [
  "CEO", "CFO", "CTO", "COO", "Head of Sales", "Head of Ops",
  "Head of Product", "IT", "Sälj", "Kundtjänst", "HR",
  "Extern kund", "Leverantör", "Styrelse",
];

export const emptyWizardInput: BulletWizardInput = {
  jobTitle: "",
  period: "",
  industry: "",
  companyType: "",
  tasks: [""],
  tools: [],
  stakeholders: [],
  results: "",
  constraints: "",
  tone: "Saklig",
  seniority: "IC",
};
