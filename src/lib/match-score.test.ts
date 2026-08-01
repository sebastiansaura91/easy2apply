import { describe, it, expect } from "vitest";
import { computeMatchScore, biggestGap } from "./match-score";
import { CompetenceTheme } from "@/types/ats-check";

const th = (importance: "must" | "nice", rating: number, theme = "T"): CompetenceTheme => ({
  theme, importance, rating, evidence: "partial", evidence_note: "",
  supporting_terms_present: [], supporting_terms_missing: [],
});

describe("computeMatchScore", () => {
  it("returns null with no rated themes", () => {
    expect(computeMatchScore([])).toBeNull();
    expect(computeMatchScore(undefined)).toBeNull();
  });
  it("weights must-themes double", () => {
    // must@5 (w2) + nice@1 (w1): (10+1)/(15) = 73
    expect(computeMatchScore([th("must", 5), th("nice", 1)])).toBe(73);
    // reversed: must@1 + nice@5: (2+5)/15 = 47
    expect(computeMatchScore([th("must", 1), th("nice", 5)])).toBe(47);
  });
  it("full marks = 100, floor = 20", () => {
    expect(computeMatchScore([th("must", 5), th("nice", 5)])).toBe(100);
    expect(computeMatchScore([th("must", 1), th("nice", 1)])).toBe(20);
  });
  it("moves granularly with a single rating step", () => {
    const base = computeMatchScore([th("must", 3), th("must", 3), th("nice", 3)])!;
    const bumped = computeMatchScore([th("must", 4), th("must", 3), th("nice", 3)])!;
    expect(bumped).toBeGreaterThan(base);
    expect(bumped - base).toBeLessThanOrEqual(10);
  });
});

describe("biggestGap", () => {
  it("prefers the weakest must-theme over a weaker nice-theme", () => {
    const gap = biggestGap([th("nice", 1, "Nice"), th("must", 2, "MustWeak"), th("must", 4, "MustStrong")]);
    expect(gap?.theme).toBe("MustWeak");
  });
  it("returns null when everything is a 5", () => {
    expect(biggestGap([th("must", 5), th("nice", 5)])).toBeNull();
  });
});
