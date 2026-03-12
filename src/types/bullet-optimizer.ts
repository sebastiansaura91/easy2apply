export interface BulletSuggestion {
  type: "stronger_verb_start" | "add_how" | "add_outcome" | "split" | "keyword_alignment" | "language_fix";
  why: string;
  suggested_rewrite: string;
  needs_user_input: string[];
  estimated_gain: {
    bullet_score: string;
    ats_score: string;
  };
}

export interface BulletAnalysis {
  id: string;
  original: string;
  detected_language: "sv" | "en" | "mixed";
  bullet_score: number;
  ats_risk_level: "low" | "medium" | "high";
  issues: string[];
  suggestions: BulletSuggestion[];
}

export interface BulletOptimizerResult {
  overall_potential_gain: string;
  bullets: BulletAnalysis[];
}
