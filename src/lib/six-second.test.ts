import { describe, expect, it } from "vitest";
import { sixSecondTest } from "./six-second";
import { CVContent, emptyCV } from "@/types/cv";

const cvWith = (profile: string, bullets: string[]): CVContent => ({
  ...emptyCV,
  profile,
  experience: [{
    id: "e1", title: "Head of Commercial", company: "Acme", location: "", startDate: "2020-01",
    endDate: "", isPresent: true, bullets, bulletStyle: "bulleted",
  }],
});

describe("sixSecondTest", () => {
  it("returns null without must-themes or experience", () => {
    expect(sixSecondTest(cvWith("x", ["y"]), [{ theme: "T", importance: "nice" }])).toBeNull();
    expect(sixSecondTest({ ...emptyCV, experience: [] }, [{ theme: "T", importance: "must" }])).toBeNull();
  });

  it("sees a theme whose supporting term is in the top three bullets", () => {
    const r = sixSecondTest(
      cvWith("", ["Led pricing and packaging changes that raised ARPU 12%", "b", "c"]),
      [{ theme: "Commercial", importance: "must", supporting_terms_present: ["pricing"] }],
    )!;
    expect(r.themes[0].visible).toBe(true);
    expect(r.quantifiedTop).toBe(1);
  });

  it("misses a theme buried below the top three and suggests moving its proof up", () => {
    const r = sixSecondTest(
      cvWith("", ["a", "b", "c", "Drev transformationsprogram över tre funktioner"]),
      [{ theme: "Transformation", importance: "must", supporting_terms: ["transformationsprogram"] }],
    )!;
    expect(r.themes[0].visible).toBe(false);
    expect(r.suggestion).toEqual({
      expIndex: 0, fromIndex: 3,
      bullet: "Drev transformationsprogram över tre funktioner",
      theme: "Transformation",
    });
  });

  it("counts the profile line as top-third content", () => {
    const r = sixSecondTest(
      cvWith("Commercial leader driving transformation programs", ["a", "b", "c"]),
      [{ theme: "Transformation", importance: "must", supporting_terms: ["transformation"] }],
    )!;
    expect(r.themes[0].visible).toBe(true);
  });

  it("matches distinctive words from the theme name itself", () => {
    const r = sixSecondTest(
      cvWith("", ["Owned pricing strategy end to end", "b", "c"]),
      [{ theme: "Pricing excellence", importance: "must" }],
    )!;
    expect(r.themes[0].visible).toBe(true);
  });

  it("offers no suggestion when nothing lower down proves the theme", () => {
    const r = sixSecondTest(
      cvWith("", ["a", "b", "c", "d"]),
      [{ theme: "Transformation", importance: "must", supporting_terms: ["förändringsledning"] }],
    )!;
    expect(r.suggestion).toBeUndefined();
  });
});
