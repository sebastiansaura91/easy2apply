import { describe, it, expect } from "vitest";
import { titleMatch } from "./title-match";
import { emptyCV } from "@/types/cv";

const cvWith = (titles: string[], targetRoleLabel?: string) => ({
  ...emptyCV,
  __meta: targetRoleLabel ? { targetRoleLabel } : undefined,
  experience: titles.map((title, i) => ({
    id: `e${i}`, title, company: "X", location: "", startDate: "2020-01", endDate: "", isPresent: i === 0,
    bullets: [],
  })),
});

describe("titleMatch", () => {
  it("finds an exact match regardless of case and punctuation", () => {
    const r = titleMatch("Head of Product", cvWith(["head of product"]));
    expect(r?.level).toBe("exact");
  });

  it("treats the target role label as a title candidate", () => {
    const r = titleMatch("Commercial Director", cvWith(["Business Analyst"], "Commercial Director"));
    expect(r?.level).toBe("exact");
    expect(r?.cvTitle).toBe("Commercial Director");
  });

  it("scores half-overlap as partial", () => {
    const r = titleMatch("Head of Commercial Offering", cvWith(["Head of Commercial Excellence"]));
    expect(r?.level).toBe("partial");
  });

  it("a shared level-word alone (Head of X vs Head of Y) is not a match", () => {
    const r = titleMatch("Head of Commercial Offering", cvWith(["Head of Sales"]));
    expect(r?.level).toBe("none");
  });

  it("returns none when nothing overlaps, pointing at the current title", () => {
    const r = titleMatch("Chief Financial Officer", cvWith(["Head of Product"]));
    expect(r?.level).toBe("none");
    expect(r?.cvTitle).toBe("Head of Product");
  });

  it("ignores stopwords in both languages", () => {
    const r = titleMatch("Chef för affärsutveckling", cvWith(["Affärsutveckling chef"]));
    expect(r?.level).toBe("exact");
  });

  it("returns null without a job title", () => {
    expect(titleMatch("", cvWith(["X"]))).toBeNull();
  });
});
