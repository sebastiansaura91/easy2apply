/** Structured result of the analyze-role-fit edge function. Suggestions only — nothing
 *  is applied to the CV until the user explicitly accepts it. */

export type EmphasisAction = "lead" | "keep" | "mute";

export interface KeywordCoverage {
  covered: string[];
  missing: string[];
}

export interface ExperienceEmphasis {
  experience_id: string;
  title: string;
  action: EmphasisAction;
  reason: string;
}

export interface BulletReframe {
  experience_id: string;
  /** Exact existing bullet text, used to locate the bullet when applying. */
  original: string;
  suggested: string;
  reason: string;
}

export interface RoleGap {
  requirement: string;
  why: string;
  suggestion: string;
}

export interface RoleFitResult {
  fit_score: number;
  summary: string;
  keyword_coverage: KeywordCoverage;
  experience_emphasis: ExperienceEmphasis[];
  reframes: BulletReframe[];
  gaps: RoleGap[];
}
