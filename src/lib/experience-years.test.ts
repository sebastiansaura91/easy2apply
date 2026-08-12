import { describe, it, expect } from "vitest";
import { parseYearsRequirement, yearsOfExperience } from "./experience-years";
import { emptyCV } from "@/types/cv";

const cv = (exps: { title: string; bullets?: string[]; start: string; end?: string; present?: boolean }[]) => ({
  ...emptyCV,
  experience: exps.map((e, i) => ({
    id: `e${i}`, title: e.title, company: "X", location: "", startDate: e.start,
    endDate: e.end || "", isPresent: !!e.present, bullets: e.bullets || [],
  })),
});

describe("parseYearsRequirement", () => {
  it("parses Swedish and English forms", () => {
    expect(parseYearsRequirement("Minst 5 års erfarenhet av försäljningsledning")).toEqual({ years: 5, subject: "försäljningsledning" });
    expect(parseYearsRequirement("8+ years of commercial leadership experience")?.years).toBe(8);
  });
  it("returns null without a number", () => {
    expect(parseYearsRequirement("Erfarenhet av försäljning")).toBeNull();
  });
});

describe("yearsOfExperience", () => {
  const now = new Date("2026-08-01");
  it("sums matching roles and merges overlaps", () => {
    const c = cv([
      { title: "Head of Sales", start: "2020-01", present: true },
      { title: "Sales Manager", start: "2019-01", end: "2021-01" },
    ]);
    expect(yearsOfExperience(c, "sales", now)).toBe(7.5);
  });
  it("ignores roles that never mention the subject", () => {
    const c = cv([
      { title: "Business Analyst", start: "2013-01", end: "2016-01" },
      { title: "Head of Sales", start: "2020-01", present: true },
    ]);
    expect(yearsOfExperience(c, "sales", now)).toBe(6.5);
  });
  it("matches via bullets, not just the title", () => {
    const c = cv([{ title: "Consultant", bullets: ["Ledde försäljningsledning för tre kunder"], start: "2016-03", end: "2019-12" }]);
    expect(yearsOfExperience(c, "försäljningsledning", now)).toBeGreaterThan(3);
  });
  it("empty subject counts the whole merged career", () => {
    const c = cv([
      { title: "A", start: "2020-01", present: true },
      { title: "B", start: "2013-08", end: "2016-02" },
    ]);
    expect(yearsOfExperience(c, "", now)).toBe(9);
  });
});
