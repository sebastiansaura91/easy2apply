import { describe, it, expect } from "vitest";
import { buildPdf } from "./export-pdf";
import { emptyCV, CVContent, CVSection } from "@/types/cv";
import { cvHeadings } from "@/i18n/cvHeadings";

const t = (k: string) => cvHeadings.en[k] || k;
const experienceOnly: CVSection[] = [{ id: "experience", type: "experience", enabled: true, order: 0 }];

const cvWith = (overrides: Partial<CVContent["experience"][number]>): CVContent => ({
  ...emptyCV,
  experience: [
    {
      id: "exp-1",
      title: "Head of Commercial",
      company: "Acme",
      location: "Stockholm",
      startDate: "2020-01",
      endDate: "",
      isPresent: true,
      bullets: ["Drove growth across the portfolio.", "Repriced subscription tiers."],
      ...overrides,
    },
  ],
});

// jsPDF (no compression) writes text literally into the PDF content stream, so we can
// assert on the raw output to confirm what actually renders.
const raw = (cv: CVContent) => buildPdf(cv, experienceOnly, t).output();

describe("PDF export renders executive fields", () => {
  it("includes P&L / team / revenue and role scope in the output", () => {
    const out = raw(cvWith({ pnlSize: "120M", headcount: "250", revenueImpact: "+35% YoY", roleScope: "Full P&L ownership of the B2C portfolio." }));
    expect(out).toContain("Team: 250");
    expect(out).toContain("Revenue: +35% YoY");
    expect(out).toContain("P&L: 120M");
    expect(out).toContain("Full P&L ownership");
  });

  it("omits the meta line when no exec fields are set", () => {
    const out = raw(cvWith({}));
    expect(out).not.toContain("Team:");
    expect(out).not.toContain("Revenue:");
  });
});

describe("PDF export honors bullet style", () => {
  it("renders numbered markers when bulletStyle is numbered", () => {
    const out = raw(cvWith({ bulletStyle: "numbered" }));
    expect(out).toContain("(1.)");
    expect(out).toContain("(2.)");
  });

  it("does not render numbers for the default bulleted style", () => {
    const out = raw(cvWith({ bulletStyle: "bulleted" }));
    expect(out).not.toContain("(1.)");
  });
});
