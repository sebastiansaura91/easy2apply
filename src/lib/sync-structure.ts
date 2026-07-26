import { CVContent, ExperienceItem } from "@/types/cv";

/**
 * Structural facts vs. tailoring.
 *
 * A structural fault (a wrong date, an overlapping role, a fixed company name, a missing
 * certification) is true regardless of the job you're applying for — so a fix belongs on
 * every CV, permanently. Tailoring (the profile narrative, bullet wording, skill emphasis)
 * is per-application and must NOT be overwritten.
 *
 * syncStructure copies the factual scaffold from `source` into `target` while keeping the
 * target's tailored narrative. Experience rows are matched by id, so reordered or
 * application-only roles are preserved.
 */
export function syncStructure(source: CVContent, target: CVContent): CVContent {
  const srcById = new Map((source.experience ?? []).map((e) => [e.id, e]));

  const experience: ExperienceItem[] = (target.experience ?? []).map((te) => {
    const se = srcById.get(te.id);
    if (!se) return te; // role exists only on the target — leave it alone
    return {
      ...te,
      // Structural facts from source:
      title: se.title,
      company: se.company,
      location: se.location,
      startDate: se.startDate,
      endDate: se.endDate,
      isPresent: se.isPresent,
      pnlSize: se.pnlSize,
      headcount: se.headcount,
      revenueImpact: se.revenueImpact,
      roleScope: se.roleScope,
      // Tailoring kept from target:
      bullets: te.bullets,
      bulletStyle: te.bulletStyle,
    };
  });

  return {
    ...target,
    // Structural facts propagate:
    contact: source.contact,
    education: source.education,
    certifications: source.certifications,
    languages: source.languages,
    experience,
    // Tailoring stays on the target: profile, skills, projects, other, sections, __meta.
  };
}
