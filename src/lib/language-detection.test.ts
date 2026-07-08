import { describe, it, expect } from "vitest";
import { detectDominantLanguage } from "./language-detection";
import { emptyCV, CVContent } from "@/types/cv";

const withProfile = (profile: string): CVContent => ({ ...emptyCV, profile });

describe("detectDominantLanguage", () => {
  it("detects a Swedish CV as sv", () => {
    const cv = withProfile(
      "Erfaren ledare som har ansvarat för och drivit utveckling med starka resultat inom organisationen samt genom flera projekt."
    );
    expect(detectDominantLanguage(cv)).toBe("sv");
  });

  it("detects an English CV as en", () => {
    const cv = withProfile(
      "Experienced leader who has driven development and delivered strong results within the organization through several projects."
    );
    expect(detectDominantLanguage(cv)).toBe("en");
  });

  it("falls back to en when there is no signal", () => {
    expect(detectDominantLanguage(emptyCV)).toBe("en");
  });

  it("uses the dominant language across sections, not one stray word", () => {
    const cv: CVContent = {
      ...emptyCV,
      profile:
        "Kommersiell ledare som har byggt och drivit tillväxt för bolaget med fokus på lönsamhet inom hela organisationen.",
      experience: [
        {
          id: "exp-1",
          title: "Head of Commercial",
          company: "Acme",
          location: "Stockholm",
          startDate: "2020-01",
          endDate: "",
          isPresent: true,
          bullets: [
            "Ledde och ansvarade för en portfölj med starka resultat och ökade intäkterna genom nya affärer.",
          ],
        },
      ],
    };
    expect(detectDominantLanguage(cv)).toBe("sv");
  });
});
