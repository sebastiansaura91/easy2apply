import { describe, it, expect } from "vitest";
import { resolveCompetence, buildEvidenceLookup, CompetenceRegistry } from "./competence-registry";

const reg: CompetenceRegistry = {
  version: 1,
  updatedAt: "2026-08-08",
  competences: [
    { id: "pricing", name_sv: "Pris & paketering", name_en: "Pricing & packaging", aliases: ["prissättning", "commercial pricing", "pricing strategy"] },
    { id: "transformation", name_sv: "Transformation", name_en: "Transformation", aliases: ["förändringsledning", "change management"] },
  ],
};

describe("resolveCompetence", () => {
  it("matches exact names and aliases in both languages", () => {
    expect(resolveCompetence(reg, "Pris & paketering")?.id).toBe("pricing");
    expect(resolveCompetence(reg, "PRICING STRATEGY")?.id).toBe("pricing");
    expect(resolveCompetence(reg, "change management")?.id).toBe("transformation");
  });

  it("matches by containment for longer names", () => {
    expect(resolveCompetence(reg, "Commercial pricing strategy")?.id).toBe("pricing");
    expect(resolveCompetence(reg, "transformationsledning")?.id).toBe("transformation");
  });

  it("returns null for unknown and too-short names", () => {
    expect(resolveCompetence(reg, "Produktledning")).toBeNull();
    expect(resolveCompetence(reg, "P&L")).toBeNull();
    expect(resolveCompetence(null, "pricing")).toBeNull();
  });
});

describe("buildEvidenceLookup", () => {
  const rows = [
    { title: "Ansökan Acme", meta: { verifiedEvidence: [{ keyword: "prissättning", answer: "Jag satte priserna själv", at: "2026-08-06" }] } },
    { title: "Ansökan Beta", meta: { verifiedEvidence: [{ keyword: "Produktledning", answer: "Ledde produktrådet", at: "2026-08-07" }] } },
    { title: "Register", meta: { isRegistryRow: true, verifiedEvidence: [{ keyword: "prissättning", answer: "skall ignoreras", at: "2026-08-07" }] } },
  ];

  it("finds evidence via any name for the same competence, skipping the registry row", () => {
    const lookup = buildEvidenceLookup(rows as any, reg);
    const hits = lookup("Pricing & packaging");
    expect(hits).toHaveLength(1);
    expect(hits[0].answer).toBe("Jag satte priserna själv");
    expect(hits[0].cvTitle).toBe("Ansökan Acme");
  });

  it("groups unresolved keywords under their own name", () => {
    const lookup = buildEvidenceLookup(rows as any, reg);
    expect(lookup("produktledning")).toHaveLength(1);
    expect(lookup("okänt tema")).toHaveLength(0);
  });
});
