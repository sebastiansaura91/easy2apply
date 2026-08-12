import { CVContent, CVSection } from "@/types/cv";
import { buildPdf } from "@/lib/export-pdf";

/**
 * Parse-back check: build the REAL export PDF, read it back with pdf.js (a real
 * parser) and verify every field survives extraction. "ATS-safe" as a measurement.
 */
export interface ParseCheck { label: string; ok: boolean }

export async function runParseBackCheck(
  cv: CVContent,
  enabledSections: CVSection[],
  tCv: (k: string) => string,
  styleId: string | undefined,
  accent: string | undefined,
  lang: "sv" | "en",
): Promise<ParseCheck[]> {
  const pdfjs: any = await import("pdfjs-dist");
  const worker: any = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const built = buildPdf(cv, enabledSections, tCv, styleId, accent, lang);
  const pdf = await pdfjs.getDocument({ data: built.output("arraybuffer") }).promise;
  let raw = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    raw += " " + content.items.map((it: any) => it.str).join(" ");
  }
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const hay = norm(raw);
  const checks: ParseCheck[] = [];
  const push = (label: string, value?: string) => {
    if (value && value.trim()) checks.push({ label, ok: hay.includes(norm(value)) });
  };
  const sv = lang === "sv";
  push(sv ? "Namn" : "Name", cv.contact.name);
  push(sv ? "E-post" : "Email", cv.contact.email);
  push(sv ? "Telefon" : "Phone", cv.contact.phone);
  push(sv ? "Profiltext" : "Profile", cv.profile);
  for (const e of cv.experience) {
    push(`${sv ? "Titel" : "Title"}: ${e.title}`, e.title);
    push(`${sv ? "Företag" : "Company"}: ${e.company}`, e.company);
    e.bullets.forEach((b, i) => push(`${e.title || "?"} · ${sv ? "punkt" : "bullet"} ${i + 1}`, b));
  }
  for (const s of cv.skills) push(`${sv ? "Kompetens" : "Skill"}: ${s}`, s);
  for (const ed of cv.education) { push(ed.degree, ed.degree); push(ed.school, ed.school); }
  for (const l of cv.languages) push(`${sv ? "Språk" : "Language"}: ${l.language}`, l.language);
  return checks;
}
