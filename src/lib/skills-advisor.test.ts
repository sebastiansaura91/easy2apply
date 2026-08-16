import { describe, expect, it } from "vitest";
import { adviseSkills } from "./skills-advisor";
import { CVContent, emptyCV } from "@/types/cv";

const cvWith = (skills: string[], bullets: string[] = []): CVContent => ({
  ...emptyCV,
  skills,
  experience: bullets.length ? [{
    id: "e1", title: "Head of Commercial", company: "Acme", location: "", startDate: "2020-01",
    endDate: "", isPresent: true, bullets,
  }] : [],
});

const profile = {
  competence_themes: [
    { theme: "Transformation", importance: "must" as const, supporting_terms: ["förändringsledning", "transformationsprojekt"], proxy_terms: ["McKinsey", "Bain"] },
    { theme: "AI & automation", importance: "must" as const, supporting_terms: ["processautomatisering", "digitalisering"] },
    { theme: "Kommersiellt", importance: "nice" as const, supporting_terms: ["affärsutveckling"] },
  ],
  tools_and_systems: ["Salesforce"],
};

describe("adviseSkills", () => {
  it("returns null without a demand profile", () => {
    expect(adviseSkills(cvWith(["Pricing"]), undefined, [])).toBeNull();
    expect(adviseSkills(cvWith(["Pricing"]), { competence_themes: [] }, [])).toBeNull();
  });

  it("suggests adding only PROVEN ad terms; unproven ones route to questions", () => {
    const cv = cvWith(["Prissättning"], ["Drev förändringsledning genom två organisationer"]);
    const a = adviseSkills(cv, profile, [{ keyword: "digitalisering", answer: "Jag drev digitaliseringen av kundflödet" }])!;
    expect(a.add.map(x => x.term)).toContain("förändringsledning");
    expect(a.add.map(x => x.term)).toContain("digitalisering");
    expect(a.unproven.map(x => x.term)).toContain("processautomatisering");
    expect(a.unproven.map(x => x.term)).toContain("Salesforce");
  });

  it("never suggests pedigree brands as skills", () => {
    const cv = cvWith([], ["Byggde business case hos McKinsey-kunder"]);
    const a = adviseSkills(cv, profile, [])!;
    const all = [...a.add, ...a.unproven].map(x => x.term.toLowerCase());
    expect(all).not.toContain("mckinsey");
    expect(all).not.toContain("bain");
  });

  it("rewords a synonym to the ad's exact term instead of duplicating", () => {
    const cv = cvWith(["Change management"], ["Ledde förändringsledning i tre bolag"]);
    const a = adviseSkills(cv, profile, [])!;
    expect(a.reword).toContainEqual({ from: "Change management", to: "förändringsledning" });
    expect(a.add.map(x => x.term)).not.toContain("förändringsledning");
  });

  it("flags trim candidates only above the cap, keeping ad-relevant skills", () => {
    const skills = [
      "förändringsledning", "processautomatisering", "digitalisering", "affärsutveckling",
      "Salesforce", "Excel", "PowerPoint", "Fotografering", "Bokföring", "SEO",
      "Copywriting", "Eventplanering", "Videoredigering",
    ];
    const a = adviseSkills(cvWith(skills), profile, [])!;
    expect(a.current).toBe(13);
    expect(a.trim.length).toBe(1);
    expect(a.trim).not.toContain("förändringsledning");
    expect(a.trim).not.toContain("Salesforce");
  });

  it("never lists a term and its synonym among additions", () => {
    const cv = cvWith(["Digital transformation"], ["Drev digitalisering och processautomatisering med mätbar effekt"]);
    const a = adviseSkills(cv, profile, [])!;
    expect(a.add.map(x => x.term)).not.toContain("digitalisering");
  });
});
