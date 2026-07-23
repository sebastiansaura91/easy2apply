/**
 * Broad role catalog — the target roles a user can angle a CV toward, organized by the
 * same categories Teal uses for its resume examples (Finance, Product, Engineering, …).
 *
 * These are label-only entries: picking one sets CVMeta.targetRole/targetRoleLabel and the
 * role-fit AI works from the title. The small set of curated senior roles in role-advice.ts
 * additionally carry hand-written emphasis/keywords/metrics. Everything else is angled by
 * the AI from the title, or by you in the editor. Nothing here invents experience.
 */

import type { Lang } from "./role-advice";

export interface RoleCategory {
  id: string;
  label: Record<Lang, string>;
  /** Sort order in the picker. Leadership (curated) first. */
  order: number;
}

export interface RoleCatalogEntry {
  id: string;
  /** Canonical role title (job titles read the same in SV/EN CVs for these roles). */
  label: string;
  category: string;
}

export const ROLE_CATEGORIES: RoleCategory[] = [
  { id: "leadership", label: { sv: "Ledarskap", en: "Leadership" }, order: 0 },
  { id: "finance", label: { sv: "Ekonomi & Finans", en: "Finance" }, order: 1 },
  { id: "product", label: { sv: "Produkt", en: "Product" }, order: 2 },
  { id: "data", label: { sv: "Data & Analys", en: "Data & Analytics" }, order: 3 },
  { id: "engineering", label: { sv: "Utveckling & Teknik", en: "Dev & Engineering" }, order: 4 },
  { id: "it", label: { sv: "IT", en: "IT" }, order: 5 },
  { id: "design", label: { sv: "Design & UX", en: "Design & UX" }, order: 6 },
  { id: "marketing", label: { sv: "Marknad", en: "Marketing" }, order: 7 },
  { id: "sales", label: { sv: "Sälj", en: "Sales" }, order: 8 },
  { id: "customer", label: { sv: "Kund & Success", en: "Customer Service & Success" }, order: 9 },
  { id: "operations", label: { sv: "Verksamhet & Drift", en: "Operations" }, order: 10 },
  { id: "project", label: { sv: "Projekt & Program", en: "Project & Program" }, order: 11 },
  { id: "hr", label: { sv: "HR & People", en: "Human Resources" }, order: 12 },
  { id: "legal", label: { sv: "Juridik", en: "Legal" }, order: 13 },
  { id: "admin", label: { sv: "Administration", en: "Administrative" }, order: 14 },
  { id: "content", label: { sv: "Innehåll", en: "Content" }, order: 15 },
  { id: "education", label: { sv: "Utbildning", en: "Education" }, order: 16 },
  { id: "healthcare", label: { sv: "Vård & Hälsa", en: "Healthcare" }, order: 17 },
  { id: "other", label: { sv: "Övrigt", en: "Other" }, order: 18 },
];

const r = (label: string, category: string): RoleCatalogEntry => ({
  id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
  label,
  category,
});

export const ROLE_CATALOG: RoleCatalogEntry[] = [
  // Finance
  r("Financial Analyst", "finance"), r("Senior Financial Analyst", "finance"),
  r("FP&A Manager", "finance"), r("Accountant", "finance"), r("Controller", "finance"),
  r("Finance Manager", "finance"), r("CFO", "finance"), r("Auditor", "finance"),
  r("Accounts Payable Specialist", "finance"), r("Accounts Receivable Specialist", "finance"),
  r("Investment Analyst", "finance"), r("Treasury Analyst", "finance"), r("Bookkeeper", "finance"),
  // Product
  r("Product Manager", "product"), r("Senior Product Manager", "product"),
  r("Group Product Manager", "product"), r("Product Owner", "product"),
  r("Technical Product Manager", "product"), r("Product Analyst", "product"),
  r("Director of Product", "product"), r("VP Product", "product"),
  r("Product Marketing Manager", "product"),
  // Data & Analytics
  r("Data Analyst", "data"), r("Data Scientist", "data"), r("Data Engineer", "data"),
  r("Analytics Engineer", "data"), r("Business Intelligence Analyst", "data"),
  r("Machine Learning Engineer", "data"), r("Data Architect", "data"),
  r("Business Analyst", "data"), r("Statistician", "data"),
  // Dev & Engineering
  r("Software Engineer", "engineering"), r("Senior Software Engineer", "engineering"),
  r("Frontend Developer", "engineering"), r("Backend Developer", "engineering"),
  r("Full Stack Developer", "engineering"), r("Mobile Developer", "engineering"),
  r("DevOps Engineer", "engineering"), r("Engineering Manager", "engineering"),
  r("QA Engineer", "engineering"), r("Site Reliability Engineer", "engineering"),
  r("Staff Engineer", "engineering"), r("Cloud Engineer", "engineering"),
  // IT
  r("IT Support Specialist", "it"), r("System Administrator", "it"),
  r("Network Engineer", "it"), r("IT Manager", "it"), r("Cybersecurity Analyst", "it"),
  r("Security Engineer", "it"), r("Solutions Architect", "it"), r("Database Administrator", "it"),
  // Design & UX
  r("UX Designer", "design"), r("UI Designer", "design"), r("Product Designer", "design"),
  r("UX Researcher", "design"), r("Graphic Designer", "design"), r("Design Lead", "design"),
  r("Visual Designer", "design"), r("Web Designer", "design"),
  // Marketing
  r("Marketing Manager", "marketing"), r("Digital Marketing Manager", "marketing"),
  r("Content Marketing Manager", "marketing"), r("Growth Marketing Manager", "marketing"),
  r("SEO Specialist", "marketing"), r("Social Media Manager", "marketing"),
  r("Brand Manager", "marketing"), r("Performance Marketing Manager", "marketing"),
  r("Demand Generation Manager", "marketing"), r("Marketing Coordinator", "marketing"),
  r("CMO", "marketing"),
  // Sales
  r("Account Executive", "sales"), r("Sales Manager", "sales"), r("Account Manager", "sales"),
  r("Business Development Manager", "sales"), r("Sales Development Representative", "sales"),
  r("Sales Director", "sales"), r("Key Account Manager", "sales"),
  r("Regional Sales Manager", "sales"), r("VP Sales", "sales"),
  // Customer
  r("Customer Success Manager", "customer"), r("Customer Support Specialist", "customer"),
  r("Customer Service Representative", "customer"), r("Support Manager", "customer"),
  r("Head of Customer Success", "customer"), r("Onboarding Specialist", "customer"),
  // Operations
  r("Operations Manager", "operations"), r("Business Operations Manager", "operations"),
  r("Supply Chain Manager", "operations"), r("Logistics Manager", "operations"),
  r("COO", "operations"), r("Operations Analyst", "operations"),
  r("Process Improvement Manager", "operations"), r("Warehouse Manager", "operations"),
  // Project & Program
  r("Project Manager", "project"), r("Program Manager", "project"),
  r("Scrum Master", "project"), r("Agile Coach", "project"),
  r("Technical Program Manager", "project"), r("Delivery Manager", "project"),
  r("PMO Lead", "project"),
  // HR
  r("HR Manager", "hr"), r("HR Business Partner", "hr"), r("Recruiter", "hr"),
  r("Talent Acquisition Manager", "hr"), r("People Operations Manager", "hr"),
  r("HR Generalist", "hr"), r("Head of People", "hr"), r("Compensation & Benefits Manager", "hr"),
  // Legal
  r("Corporate Counsel", "legal"), r("Legal Counsel", "legal"), r("Paralegal", "legal"),
  r("Compliance Manager", "legal"), r("Contract Manager", "legal"), r("General Counsel", "legal"),
  // Administrative
  r("Executive Assistant", "admin"), r("Administrative Assistant", "admin"),
  r("Office Manager", "admin"), r("Personal Assistant", "admin"),
  // Content
  r("Content Writer", "content"), r("Copywriter", "content"),
  r("Content Strategist", "content"), r("Technical Writer", "content"), r("Editor", "content"),
  // Education
  r("Teacher", "education"), r("Instructional Designer", "education"),
  r("Corporate Trainer", "education"), r("Learning & Development Manager", "education"),
  // Healthcare
  r("Registered Nurse", "healthcare"), r("Medical Assistant", "healthcare"),
  r("Healthcare Administrator", "healthcare"), r("Clinical Research Associate", "healthcare"),
  r("Pharmacist", "healthcare"),
  // Other
  r("Management Consultant", "other"), r("Strategy Consultant", "other"),
  r("Chief of Staff", "other"), r("Founder / Entrepreneur", "other"),
];
