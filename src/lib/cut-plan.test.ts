import { describe, expect, it } from "vitest";
import { cutPlan, applyCutPlan } from "./cut-plan";
import { CVContent, CVMeta, emptyCV } from "@/types/cv";

const demand: NonNullable<CVMeta["demandProfile"]> = {
  competence_themes: [
    { theme: "Pricing & Packaging Strategy", importance: "must", supporting_terms: ["prissättning", "paketering"] },
    { theme: "Sales enablement", importance: "must", supporting_terms: ["säljstöd", "sales enablement"] },
    { theme: "Market research", importance: "nice", supporting_terms: ["marknadsanalys"] },
  ],
  tools_and_systems: ["Salesforce"],
};

const exp = (id: string, title: string, bullets: string[]) => ({
  id, title, company: "Bolag AB", location: "", startDate: "2018-01", endDate: "", isPresent: false, bullets,
});

// ~40 long bullets across four roles pushes the estimate well past two pages.
const filler = (n: number, text: string) => Array.from({ length: n }, (_, i) => `${text} nummer ${i + 1}, `.repeat(4));

const bigCV: CVContent = {
  ...emptyCV,
  profile: "Kommersiell ledare med fokus på prissättning.",
  experience: [
    exp("a", "Head of Commercial", [
      "Ansvarade för prissättning och paketering av hela portföljen med tydligt resultat",
      "Byggde säljstöd och sales enablement för 40 säljare i tre länder",
      ...filler(8, "Deltog i interna möten och arbetsgrupper om administration"),
      "Drev marknadsanalys och prissättning för ny produktlinje med stor framgång",
    ]),
    exp("b", "Commercial Manager", ["Ledde omförhandling av avtal", ...filler(9, "Höll utbildningar om internt intranät")]),
    exp("c", "Projektledare", [...filler(10, "Koordinerade veckomöten och statusrapporter")]),
    exp("d", "Konsult", [...filler(10, "Dokumenterade processer i wordmallar")]),
  ],
};

describe("cutPlan (Bantningsplanen)", () => {
  it("returns null without a demand profile or when already inside budget", () => {
    expect(cutPlan(bigCV, undefined)).toBeNull();
    expect(cutPlan({ ...emptyCV, experience: [exp("a", "Roll", ["kort punkt"])] }, demand)).toBeNull();
  });

  it("cuts zero-hit bullets from the oldest roles first and never the protected top", () => {
    const plan = cutPlan(bigCV, demand)!;
    expect(plan).not.toBeNull();
    // Protected: first two bullets of the two latest roles.
    expect(plan.items.some(i => i.expIndex <= 1 && i.bulletIdx < 2)).toBe(false);
    // Theme-carrying bullets are never in the cut list while zero-hit ones remain.
    expect(plan.items.every(i => !/prissättning|säljstöd|marknadsanalys/i.test(i.bullet))).toBe(true);
    // Oldest roles go first.
    expect(plan.items[0].expIndex).toBeGreaterThanOrEqual(2);
    expect(plan.linesSaved).toBeGreaterThan(0);
    // The fixture is deliberately huge; the capped plan must still move the estimate
    // toward the budget, never away from it.
    expect(plan.pagesAfter).toBeLessThanOrEqual(plan.pagesNow);
  });

  it("surfaces buried gems: must-theme bullets below the fold of recent roles", () => {
    const plan = cutPlan(bigCV, demand)!;
    expect(plan.gems.some(g => /marknadsanalys och prissättning/.test(g.bullet))).toBe(true);
  });

  it("applyCutPlan drops exactly the planned bullets and refuses stale plans", () => {
    const plan = cutPlan(bigCV, demand)!;
    const updates = applyCutPlan(bigCV, plan.items);
    const dropped = plan.items.filter(i => updates.some(u => u.expIndex === i.expIndex));
    expect(dropped.length).toBe(plan.items.length);
    for (const u of updates) {
      const before = bigCV.experience[u.expIndex].bullets.length;
      const planned = plan.items.filter(i => i.expIndex === u.expIndex).length;
      expect(u.bullets.length).toBe(before - planned);
    }
    // Stale: mutate a planned bullet — that experience must be skipped.
    const mutated = { ...bigCV, experience: bigCV.experience.map((e, i) => i === plan.items[0].expIndex ? { ...e, bullets: e.bullets.map((b, j) => j === plan.items[0].bulletIdx ? "ändrad" : b) } : e) };
    expect(applyCutPlan(mutated, plan.items).some(u => u.expIndex === plan.items[0].expIndex)).toBe(false);
  });
});
