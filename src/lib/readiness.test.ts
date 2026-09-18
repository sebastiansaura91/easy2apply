import { describe, expect, it } from "vitest";
import { estimatePages, profileCoverage, shortenTargets, valuesMirror, scopeDupes, leadershipEvidence, isLeadershipAd, adCvLanguageMismatch } from "./readiness";
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

describe("valuesMirror (Tonlägeslagret)", () => {
  const cvWith = (profile: string, bullets: string[] = []): CVContent => ({
    ...emptyCV,
    profile,
    experience: [{ id: "a", title: "Segmentchef", company: "", location: "", startDate: "2020-01", endDate: "", isPresent: true, bullets }],
  });
  const reg = { style: "values", values_language: ["delaktighet", "självbestämmande", "tillit"] };

  it("returns empty for metrics postings and missing registers", () => {
    expect(valuesMirror(cvWith("Ledde tillväxt"), undefined)).toEqual([]);
    expect(valuesMirror(cvWith("Ledde tillväxt"), { style: "metrics", values_language: ["tillit"] })).toEqual([]);
  });

  it("finds value words in the profile and top bullets, stemmed", () => {
    const checks = valuesMirror(cvWith("Ledarskap byggt på tillit.", ["Stärkte medarbetarnas delaktighet i sex regioner"]), reg);
    expect(checks.find(c => c.word === "tillit")?.present).toBe(true);
    expect(checks.find(c => c.word === "delaktighet")?.present).toBe(true);
    expect(checks.find(c => c.word === "självbestämmande")?.present).toBe(false);
  });

  it("does not look below the top three bullets", () => {
    const checks = valuesMirror(cvWith("", ["a", "b", "c", "byggde tillit i teamet"]), reg);
    expect(checks.find(c => c.word === "tillit")?.present).toBe(false);
  });
});

describe("scopeDupes (G4)", () => {
  const exp = (roleScope: string, bullets: string[]): CVContent => ({
    ...emptyCV,
    experience: [{ id: "a", title: "Chef", company: "", location: "", startDate: "2020-01", endDate: "", isPresent: true, roleScope, bullets }],
  });
  it("flags a bullet that repeats the scope ingress", () => {
    const scope = "Ledde strategiska och kommersiella transformationsinitiativ som påverkade 20 000 kunder och 500 000 årliga serviceuppdrag.";
    const d = scopeDupes(exp(scope, [scope + " Fokus på skalning.", "Helt annan punkt om prissättning av abonnemang."]));
    expect(d).toHaveLength(1);
    expect(d[0].bulletIdx).toBe(0);
  });
  it("leaves genuinely different bullets alone", () => {
    const d = scopeDupes(exp("Ansvarade för regionens centrala affärsstödsfunktion med tydligt leveransansvar.",
      ["Byggde om bokningsprocessen och höjde fyllnadsgraden med 30 procent."]));
    expect(d).toEqual([]);
  });
});

describe("leadershipEvidence + isLeadershipAd (G2)", () => {
  it("reads doing-only CVs as weak", () => {
    const cv: CVContent = { ...emptyCV, experience: [{ id: "a", title: "x", company: "", location: "", startDate: "", endDate: "", isPresent: false,
      bullets: ["Optimerade kundresan och ökade merförsäljningen med 3 procent.", "Byggde ett analysverktyg för expansion."] }] };
    expect(leadershipEvidence(cv).strong).toBe(false);
  });
  it("reads team sizes plus repeated lead verbs as strong, and 'enabled' never counts as 'led'", () => {
    const cv: CVContent = { ...emptyCV, profile: "Enabled growth.", experience: [{ id: "a", title: "Chef", company: "", location: "", startDate: "", endDate: "", isPresent: true,
      headcount: "6 direktrapporterande",
      bullets: ["Ledde 6 chefer med personalansvar för 40 medarbetare.", "Coachade teamledare i utvecklingssamtal.", "Ledde förändringsarbetet."] }] };
    const ev = leadershipEvidence(cv);
    expect(ev.strong).toBe(true);
    const weak: CVContent = { ...emptyCV, profile: "Enabled and failed and installed things." };
    expect(leadershipEvidence(weak).verbHits).toBe(0);
  });
  it("isLeadershipAd: stored seniority or chef in the title", () => {
    expect(isLeadershipAd({ demandProfile: { seniority: "Management" } } as never)).toBe(true);
    expect(isLeadershipAd({ tailoredForJob: "Chef Affärsstöd" } as never)).toBe(true);
    expect(isLeadershipAd({ tailoredForJob: "Senior Analyst" } as never)).toBe(false);
  });
});

describe("adCvLanguageMismatch (G3)", () => {
  const svAd = "Vi söker en chef som vill leda och utveckla vår centrala funktion för regionens avdelningar och filialer. Du har erfarenhet av att leda förändring och skapa förtroende i organisationen.";
  it("stored ad language wins", () => {
    expect(adCvLanguageMismatch({ demandProfile: { ad_language: "sv" } } as never, "en")).toBe("sv");
    expect(adCvLanguageMismatch({ demandProfile: { ad_language: "sv" } } as never, "sv")).toBeNull();
  });
  it("falls back to detecting the pasted posting", () => {
    expect(adCvLanguageMismatch({ jobPostingText: svAd } as never, "en")).toBe("sv");
  });
  it("stays silent without enough signal", () => {
    expect(adCvLanguageMismatch({ jobPostingText: "short" } as never, "en")).toBeNull();
    expect(adCvLanguageMismatch(undefined, "en")).toBeNull();
  });
});
