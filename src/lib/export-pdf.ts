import jsPDF from "jspdf";
import { CVContent, CVSection } from "@/types/cv";
import { getTemplateStyle, withAccent } from "./templates";
import { formatCvDateRange } from "./format-date";

/**
 * Renders CV data directly to PDF using jsPDF text rendering.
 * Produces crisp vector text that is selectable and ATS-parseable.
 */
/**
 * Build the CV PDF document (without saving). Exposed for testing the rendered output.
 */
export function buildPdf(
  cv: CVContent,
  enabledSections: CVSection[],
  t: (k: string) => string,
  styleId?: string,
  accentHex?: string,
  lang?: "sv" | "en"
): jsPDF {
  // Fall back to detecting the CV language from the translated "present" label.
  const dateLang: "sv" | "en" = lang ?? (t("present") === "Nuvarande" ? "sv" : "en");
  const tpl = withAccent(getTemplateStyle(styleId), accentHex);
  const font = tpl.pdfFont;
  const pdf = new jsPDF("p", "mm", "a4");
  const pageW = 210;
  const pageH = 297;
  const marginL = 25;
  const marginR = 25;
  // 17mm keeps a safe print margin while buying ~2 lines of content per page.
  const marginTop = 17;
  const marginBottom = 17;
  const contentW = pageW - marginL - marginR;
  let y = marginTop;

  const colors = {
    black: [15, 23, 42] as [number, number, number],
    gray: [71, 85, 105] as [number, number, number],
    border: [26, 26, 26] as [number, number, number],
  };

  function checkPage(needed: number) {
    if (y + needed > pageH - marginBottom) {
      pdf.addPage();
      y = marginTop;
    }
  }

  function drawText(
    text: string,
    x: number,
    currentY: number,
    opts: {
      fontSize?: number;
      fontStyle?: string;
      color?: [number, number, number];
      maxWidth?: number;
      lineHeight?: number;
    } = {}
  ): number {
    const {
      fontSize = 10,
      fontStyle = "normal",
      color = colors.black,
      maxWidth = contentW,
      lineHeight = 1.4,
    } = opts;

    pdf.setFontSize(fontSize);
    pdf.setFont(font,fontStyle);
    pdf.setTextColor(...color);

    const lines = pdf.splitTextToSize(text, maxWidth);
    const lineHeightMm = (fontSize * lineHeight * 0.3528); // pt to mm

    for (const line of lines) {
      checkPage(lineHeightMm);
      pdf.text(line, x, y);
      y += lineHeightMm;
    }

    return y;
  }

  function drawCenteredText(
    text: string,
    opts: {
      fontSize?: number;
      fontStyle?: string;
      color?: [number, number, number];
      maxWidth?: number;
    } = {}
  ) {
    const { fontSize = 10, fontStyle = "normal", color = colors.black, maxWidth = contentW } = opts;
    pdf.setFontSize(fontSize);
    pdf.setFont(font,fontStyle);
    pdf.setTextColor(...color);

    const lines = pdf.splitTextToSize(text, maxWidth);
    const lineHeightMm = fontSize * 1.4 * 0.3528;

    for (const line of lines) {
      checkPage(lineHeightMm);
      const textWidth = pdf.getTextWidth(line);
      const x = marginL + (contentW - textWidth) / 2;
      pdf.text(line, x, y);
      y += lineHeightMm;
    }
  }

  function drawH2(text: string) {
    y += 2.5;
    checkPage(8);
    pdf.setFontSize(11);
    pdf.setFont(font,"bold");
    pdf.setTextColor(...tpl.accentRgb);
    const heading = tpl.uppercaseHeadings ? text.toUpperCase() : text;
    pdf.text(heading, marginL, y);
    y += 1.5;
    // Accent rule under the heading
    pdf.setDrawColor(...tpl.accentRgb);
    pdf.setLineWidth(0.4);
    pdf.line(marginL, y, marginL + contentW, y);
    y += 3.5;
  }

  function drawH3(text: string) {
    checkPage(5);
    drawText(text, marginL, y, { fontSize: 10.5, fontStyle: "bold" });
  }

  function drawBullet(text: string, marker?: string) {
    checkPage(5);
    const bulletX = marginL + 3;
    const textX = marginL + 7;
    const bulletMaxW = contentW - 7;

    pdf.setFontSize(10);
    pdf.setFont(font,"normal");
    pdf.setTextColor(...colors.black);

    if (marker) {
      // Numbered marker (e.g. "1.") left-aligned to the bullet column
      pdf.text(marker, bulletX - 1, y);
    } else {
      // Draw bullet dot
      pdf.circle(bulletX, y - 1, 0.5, "F");
    }

    const lines = pdf.splitTextToSize(text, bulletMaxW);
    const lineHeightMm = 10 * 1.4 * 0.3528;

    for (const line of lines) {
      checkPage(lineHeightMm);
      pdf.text(line, textX, y);
      y += lineHeightMm;
    }
    y += 0.5;
  }

  // === RENDER SECTIONS ===
  for (const section of enabledSections) {
    switch (section.type) {
      case "contact": {
        checkPage(20);
        drawCenteredText(cv.contact.name || t("yourName"), {
          fontSize: 18,
          fontStyle: "bold",
        });
        y += 1;
        // One compact line — values only, no "Email:" labels. Recruiters and ATS
        // recognize an address/phone on sight; labels just eat vertical space.
        const contactLine = [
          cv.contact.email, cv.contact.phone, cv.contact.city, cv.contact.linkedin, cv.contact.website,
        ].filter(Boolean).join("   ·   ");
        if (contactLine) drawCenteredText(contactLine, { fontSize: 9, color: colors.gray });
        y += 1;
        break;
      }

      case "profile": {
        if (!cv.profile) break;
        drawH2(t("sectionProfile"));
        drawText(cv.profile, marginL, y, { color: colors.black });
        y += 1;
        break;
      }

      case "experience": {
        if (cv.experience.length === 0) break;
        drawH2(t("sectionExperience"));
        for (const exp of cv.experience) {
          const validBullets = exp.bullets.filter(Boolean);
          const metaLine = [
            exp.pnlSize ? `${t("labelPnl")}: ${exp.pnlSize}` : null,
            exp.headcount ? `${t("labelTeam")}: ${exp.headcount}` : null,
            exp.revenueImpact ? `${t("labelRevenue")}: ${exp.revenueImpact}` : null,
          ].filter(Boolean).join("   ·   ");

          let titleLine = exp.title;
          if (exp.company) titleLine += `, ${exp.company}`;
          if (exp.location) titleLine += ` – ${exp.location}`;
          // Never break inside the role title: if the combined line would wrap, split at
          // the comma instead — title on its own line, company – location beneath it.
          const companyLine = [exp.company, exp.location].filter(Boolean).join(" – ");
          pdf.setFontSize(10.5);
          pdf.setFont(font, "bold");
          const titleFitsOneLine = pdf.splitTextToSize(titleLine, contentW).length === 1;
          const splitTitle = !titleFitsOneLine && !!companyLine;
          const dateLine = formatCvDateRange(exp.startDate, exp.endDate, exp.isPresent, dateLang, t("present") || "Nuvarande");

          // A role must never split across pages: measure its FULL height (wrapped lines
          // included) and start a fresh page when it doesn't fit — unless the role alone
          // is taller than a page, in which case it has to flow.
          const mm = (pt: number, lines: number) => pt * 1.4 * 0.3528 * lines;
          const linesOf = (text: string, pt: number, width: number) => {
            pdf.setFontSize(pt);
            pdf.setFont(font, "normal");
            return pdf.splitTextToSize(text, width).length;
          };
          let fullH = splitTitle
            ? mm(10.5, linesOf(exp.title, 10.5, contentW)) + mm(9.5, linesOf(companyLine, 9.5, contentW))
            : mm(10.5, linesOf(titleLine, 10.5, contentW));
          fullH += mm(9, 1) + 1;
          if (metaLine) fullH += mm(9, linesOf(metaLine, 9, contentW)) + 0.5;
          if (exp.roleScope) fullH += mm(9.5, linesOf(exp.roleScope, 9.5, contentW)) + 1;
          for (const b of validBullets) fullH += mm(10, linesOf(b, 10, contentW - 7)) + 0.5;
          fullH += 2;
          const spaceLeft = pageH - marginBottom - y;
          const fullPage = pageH - marginTop - marginBottom;
          if (fullH > spaceLeft && fullH <= fullPage) {
            pdf.addPage();
            y = marginTop;
          }

          if (splitTitle) {
            drawH3(exp.title);
            drawText(companyLine, marginL, y, { fontSize: 9.5, color: colors.gray });
          } else {
            drawH3(titleLine);
          }
          drawText(dateLine, marginL, y, { fontSize: 9, color: colors.gray });
          y += 1;

          // Executive scope metrics (P&L / team / revenue impact)
          if (metaLine) {
            drawText(metaLine, marginL, y, { fontSize: 9, color: colors.gray });
            y += 0.5;
          }

          // Role scope prose (mandate, P&L, team, geography)
          if (exp.roleScope) {
            drawText(exp.roleScope, marginL, y, { fontSize: 9.5, fontStyle: "italic", color: colors.gray });
            y += 1;
          }

          // Bullets — honor numbered vs bulleted style
          const numbered = exp.bulletStyle === "numbered";
          validBullets.forEach((bullet, bi) => {
            drawBullet(bullet, numbered ? `${bi + 1}.` : undefined);
          });
          y += 2;
        }
        break;
      }

      case "education": {
        if (cv.education.length === 0) break;
        drawH2(t("sectionEducation"));
        for (const edu of cv.education) {
          let titleLine = edu.degree;
          if (edu.field) titleLine += `, ${edu.field}`;
          drawH3(titleLine);

          const dateLine = `${edu.school}  ·  ${formatCvDateRange(edu.startDate, edu.endDate, false, dateLang, "")}`;
          drawText(dateLine, marginL, y, { fontSize: 9, color: colors.gray });
          y += 3;
        }
        break;
      }

      case "skills": {
        if (cv.skills.length === 0) break;
        drawH2(t("sectionSkills"));
        drawText(cv.skills.join(", "), marginL, y);
        y += 1;
        break;
      }

      case "certifications": {
        if (cv.certifications.length === 0) break;
        drawH2(t("sectionCertifications"));
        for (const cert of cv.certifications) {
          drawText(`${cert.name} – ${cert.issuer} (${cert.date})`, marginL, y);
          y += 1;
        }
        break;
      }

      case "projects": {
        if (cv.projects.length === 0) break;
        drawH2(t("sectionProjects"));
        for (const p of cv.projects) {
          // Keep project header together with its first line of content.
          const headerH = 10 * 1.4 * 0.3528;
          const firstLineH = (p.description || p.bullets[0]) ? 10 * 1.4 * 0.3528 : 0;
          const needed = headerH + firstLineH + 2;
          if (y + needed > pageH - marginBottom) {
            pdf.addPage();
            y = marginTop;
          }
          drawH3(p.name);
          if (p.description) {
            drawText(p.description, marginL, y, { color: colors.gray });
          }
          for (const b of p.bullets.filter(Boolean)) {
            drawBullet(b);
          }
          y += 2;
        }
        break;
      }

      case "languages": {
        if (cv.languages.length === 0) break;
        drawH2(t("sectionLanguages"));
        for (const lang of cv.languages) {
          drawText(`${lang.language} – ${lang.level}`, marginL, y);
          y += 1;
        }
        break;
      }

      case "other": {
        if (!cv.other) break;
        drawH2(t("sectionOther"));
        drawText(cv.other, marginL, y);
        y += 1;
        break;
      }
    }
  }

  return pdf;
}

export async function exportToPdf(
  cv: CVContent,
  enabledSections: CVSection[],
  t: (k: string) => string,
  filename: string = "cv.pdf",
  styleId?: string,
  accentHex?: string,
  lang?: "sv" | "en"
): Promise<void> {
  const pdf = buildPdf(cv, enabledSections, t, styleId, accentHex, lang);
  pdf.save(filename);
}
