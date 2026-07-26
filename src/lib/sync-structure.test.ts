import { describe, it, expect } from "vitest";
import { syncStructure } from "./sync-structure";
import { emptyCV, CVContent } from "@/types/cv";

const exp = (over: Partial<CVContent["experience"][number]>) => ({
  id: "e1", title: "", company: "", location: "", startDate: "", endDate: "", isPresent: false, bullets: [], ...over,
});

describe("syncStructure", () => {
  it("propagates facts but keeps the target's tailored bullets + profile + skills", () => {
    const source: CVContent = {
      ...emptyCV,
      contact: { ...emptyCV.contact, email: "fixed@x.com" },
      profile: "SOURCE profile",
      skills: ["source-skill"],
      experience: [exp({ id: "e1", company: "Hemfrid", startDate: "2021-01", endDate: "2023-06", bullets: ["source bullet"] })],
    };
    const target: CVContent = {
      ...emptyCV,
      contact: { ...emptyCV.contact, email: "old@x.com" },
      profile: "TAILORED profile",
      skills: ["tailored-skill"],
      experience: [exp({ id: "e1", company: "Hemfird typo", startDate: "2021-01", endDate: "2099-01", bullets: ["tailored bullet"] })],
    };
    const out = syncStructure(source, target);
    // facts synced:
    expect(out.contact.email).toBe("fixed@x.com");
    expect(out.experience[0].company).toBe("Hemfrid");
    expect(out.experience[0].endDate).toBe("2023-06");
    // tailoring kept:
    expect(out.profile).toBe("TAILORED profile");
    expect(out.skills).toEqual(["tailored-skill"]);
    expect(out.experience[0].bullets).toEqual(["tailored bullet"]);
  });

  it("leaves a target-only experience row untouched", () => {
    const source: CVContent = { ...emptyCV, experience: [] };
    const target: CVContent = { ...emptyCV, experience: [exp({ id: "only-here", company: "Acme", bullets: ["b"] })] };
    const out = syncStructure(source, target);
    expect(out.experience[0].company).toBe("Acme");
    expect(out.experience[0].bullets).toEqual(["b"]);
  });
});
