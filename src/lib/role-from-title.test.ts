import { describe, it, expect } from "vitest";
import { deriveRoleFromTitle } from "./role-from-title";
import { CUSTOM_ROLE } from "@/components/role/RolePicker";
import { getAllRoles } from "./role-advice";

describe("deriveRoleFromTitle", () => {
  it("returns null without a title", () => {
    expect(deriveRoleFromTitle("")).toBeNull();
    expect(deriveRoleFromTitle(undefined)).toBeNull();
  });

  it("matches a catalog role embedded in a longer ad title", () => {
    // Sanity: the catalog contains a "Head of Commercial"-style role.
    const labels = getAllRoles("en").flatMap(g => g.roles.map(r => r.label.toLowerCase()));
    expect(labels.some(l => l.includes("head of commercial"))).toBe(true);

    const d = deriveRoleFromTitle("Head of Commercial Offering, Nordics");
    expect(d).not.toBeNull();
    expect(d!.roleId).not.toBe(CUSTOM_ROLE);
  });

  it("falls back to a custom role carrying the ad title", () => {
    const d = deriveRoleFromTitle("Intergalactic Snack Strategist");
    expect(d!.roleId).toBe(CUSTOM_ROLE);
    expect(d!.customLabel).toBe("Intergalactic Snack Strategist");
  });
});
