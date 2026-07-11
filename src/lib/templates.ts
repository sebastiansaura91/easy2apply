/**
 * CV template styles. Same content, different visual treatment. Each style drives BOTH
 * the on-screen A4 preview (via CSS variables) and the exported PDF (via jsPDF font +
 * accent colour). Kept ATS-safe: single column, no icons, standard fonts — only the
 * heading treatment, accent colour and body font change.
 */

export type TemplateStyleId = "classic" | "modern" | "elegant";

export interface TemplateStyle {
  id: TemplateStyleId;
  label: { sv: string; en: string };
  desc: { sv: string; en: string };
  /** jsPDF base-14 font used in the export. */
  pdfFont: "helvetica" | "times";
  /** CSS font stack for the preview. */
  cssFont: string;
  /** Accent used for section headings + rule, as RGB (PDF) and hex (preview). */
  accentRgb: [number, number, number];
  accentHex: string;
  uppercaseHeadings: boolean;
  /** Preview heading letter-spacing. */
  headingSpacing: string;
}

export const TEMPLATE_STYLES: TemplateStyle[] = [
  {
    id: "classic",
    label: { sv: "Klassisk", en: "Classic" },
    desc: { sv: "Sans-serif, versala rubriker, mörk accent.", en: "Sans-serif, uppercase headings, dark accent." },
    pdfFont: "helvetica",
    cssFont: "'Inter', sans-serif",
    accentRgb: [26, 26, 26],
    accentHex: "#1a1a1a",
    uppercaseHeadings: true,
    headingSpacing: "0.5pt",
  },
  {
    id: "modern",
    label: { sv: "Modern", en: "Modern" },
    desc: { sv: "Sans-serif, gemena rubriker, blå accent.", en: "Sans-serif, title-case headings, blue accent." },
    pdfFont: "helvetica",
    cssFont: "'Inter', sans-serif",
    accentRgb: [29, 78, 216],
    accentHex: "#1d4ed8",
    uppercaseHeadings: false,
    headingSpacing: "0",
  },
  {
    id: "elegant",
    label: { sv: "Elegant", en: "Elegant" },
    desc: { sv: "Serif, versala rubriker, mörk accent.", en: "Serif, uppercase headings, dark accent." },
    pdfFont: "times",
    cssFont: "Georgia, 'Times New Roman', serif",
    accentRgb: [15, 23, 42],
    accentHex: "#0f172a",
    uppercaseHeadings: true,
    headingSpacing: "0.6pt",
  },
];

export const DEFAULT_TEMPLATE_STYLE = TEMPLATE_STYLES[0];

export function getTemplateStyle(id?: string | null): TemplateStyle {
  return TEMPLATE_STYLES.find((s) => s.id === id) ?? DEFAULT_TEMPLATE_STYLE;
}
