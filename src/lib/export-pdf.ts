import jsPDF from "jspdf";
import { CVContent, CVSection } from "@/types/cv";

/**
 * Renders CV data directly to PDF using jsPDF text rendering.
 * Produces crisp vector text that is selectable and ATS-parseable.
 */
export async function exportToPdf(
  cv: CVContent,
  enabledSections: CVSection[],
  t: (k: string) => string,
  filename: string = "cv.pdf"
): Promise<void> {
  const pdf = new jsPDF("p", "mm", "a4");
  const pageW = 210;
  const pageH = 297;
  const marginL = 25;
  const marginR = 25;
  const marginTop = 20;
  const marginBottom = 20;
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
    pdf.setFont("helvetica", fontStyle);
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
    pdf.setFont("helvetica", fontStyle);
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
    y += 3;
    checkPage(8);
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...colors.black);
    const upper = text.toUpperCase();
    pdf.text(upper, marginL, y);
    y += 1.5;
    // Border line
    pdf.setDrawColor(...colors.border);
    pdf.setLineWidth(0.4);
    pdf.line(marginL, y, marginL + contentW, y);
    y += 4;
  }

  function drawH3(text: string) {
    checkPage(5);
    drawText(text, marginL, y, { fontSize: 10.5, fontStyle: "bold" });
  }

  function drawBullet(text: string) {
    checkPage(5);
    const bulletX = marginL + 3;
    const textX = marginL + 7;
    const bulletMaxW = contentW - 7;

    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...colors.black);

    // Draw bullet dot
    pdf.circle(bulletX, y - 1, 0.5, "F");

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
        drawCenteredText(cv.contact.name || "Ditt Namn", {
          fontSize: 18,
          fontStyle: "bold",
        });
        y += 2;
        const contactFields = [
          cv.contact.email ? `Email: ${cv.contact.email}` : null,
          cv.contact.phone ? `${t("contactPhone")}: ${cv.contact.phone}` : null,
          cv.contact.linkedin ? `LinkedIn: ${cv.contact.linkedin}` : null,
          cv.contact.website ? `${t("contactWebsite")}: ${cv.contact.website}` : null,
          cv.contact.city ? `${t("contactAddress")}: ${cv.contact.city}` : null,
        ].filter(Boolean);
        for (const field of contactFields) {
          drawCenteredText(field!, { fontSize: 9, color: colors.gray });
        }
        y += 2;
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
          // Title line
          let titleLine = exp.title;
          if (exp.company) titleLine += `, ${exp.company}`;
          if (exp.location) titleLine += ` – ${exp.location}`;
          drawH3(titleLine);

          // Date line
          const dateLine = `${exp.startDate} – ${exp.isPresent ? (t("present") || "Nuvarande") : exp.endDate}`;
          drawText(dateLine, marginL, y, { fontSize: 9, color: colors.gray });
          y += 1;

          // Bullets
          const validBullets = exp.bullets.filter(Boolean);
          for (const bullet of validBullets) {
            drawBullet(bullet);
          }
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

          const dateLine = `${edu.school}  ·  ${edu.startDate} – ${edu.endDate}`;
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
          drawH3(p.name);
          if (p.description) {
            drawText(p.description, marginL, y, { color: colors.gray });
          }
          for (const b of p.bullets) {
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

  pdf.save(filename);
}
