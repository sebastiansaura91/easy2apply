import { describe, expect, it } from "vitest";
import { estimatePages, profileCoverage, shortenTargets } from "./readiness";
import { CVContent, emptyCV, sampleCV } from "@/types/cv";

describe("estimatePages", () => {
  it("keeps a normal CV at 1-2 pages", () => {
    const est = estimatePages(sampleCV);
    expect(est.pages).toBeGreaterThanOrEqual(1);
    expect(est.pages).toBeLessThanOrEqual(2);
  });

  it("flags a bloated CV as 3+ pages", () => {
    const bloated: CVContent = {
      ...sampleCV,
      experience: Array.from({ length: 7 }, (_, i) => ({
        id: `e${i}`, title: `Roll ${i}`, company: "Bolag", location: "", startDate: "2010-01",
        endDate: "2012-01", isPresent: false,
        bullets: Array.from({ length: 7 }, () => "En mycket lång punkt som beskriver arbetet i stor detalj med många ord och bisatser som fortsätter och fortsätter tills raden bryts flera gånger om."),
      })),
    };
    expect(estimatePages(bloated).pages).toBeGreaterThanOrEqual(3);
  });
});

describe("profileCoverage", () => {
  const themes = [
    { theme: "Transformation", supporting_terms_present: ["förändringsledning"] },
    { theme: "AI och digital transformation", supporting_terms_missing: ["digitalisering"] },
  ];

  it("detects mentioned and missing themes in the profile text", () => {
    const r = profileCoverage("Ledare med djup erfarenhet av förändringsledning i stora organisationer.", themes);
    expect(r).toEqual([
      { theme: "Transformation", mentioned: true },
      { theme: "AI och digital transformation", mentioned: false },
    ]);
  });

  it("matches lightly inflected forms", () => {
    const r = profileCoverage("Drev digitaliseringen av kärnverksamheten.", themes);
    expect(r[1].mentioned).toBe(true);
  });

  it("treats an empty profile as covering nothing", () => {
    expect(profileCoverage("", themes).every(c => !c.mentioned)).toBe(true);
  });
});

describe("shortenTargets", () => {
  it("flags 200+ character bullets and bullet-heavy old roles, capped", () => {
    const long = "x".repeat(210);
    const cv: CVContent = {
      ...emptyCV,
      experience: [
        { id: "a", title: "Nu", company: "", location: "", startDate: "2022-01", endDate: "", isPresent: true, bullets: [long] },
        { id: "b", title: "Förra", company: "", location: "", startDate: "2018-01", endDate: "2022-01", isPresent: false, bullets: ["kort"] },
        { id: "c", title: "Gammal", company: "", location: "", startDate: "2012-01", endDate: "2018-01", isPresent: false, bullets: ["a", "b", "c", "d", "e"] },
      ],
    };
    const t = shortenTargets(cv);
    expect(t.length).toBe(2);
    expect(t[0].expIndex).toBe(0);
    expect(t[1].expIndex).toBe(2);
  });

  it("returns nothing for a tight CV", () => {
    expect(shortenTargets(sampleCV)).toEqual([]);
  });
});
