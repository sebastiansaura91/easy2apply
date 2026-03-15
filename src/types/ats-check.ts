/** Types for the recruiter-grade ATS Check system */

export interface FirstScanIssue {
  title: string;
  why_it_matters: string;
  fix: string;
}

export interface ScanabilityItem {
  dimension: "single_column_flow" | "contact_info" | "plain_text_layout" | "job_language_match" | "clean_vs_cluttered";
  status: "pass" | "warning" | "fail";
  why_it_matters: string;
  recommendation: string;
}

export interface ParseCheckItem {
  dimension: string;
  status: "pass" | "warning" | "fail";
  why_it_matters: string;
  recommendation: string;
}

export interface LanguageReplacement {
  from: string;
  to: string;
  where: string;
}

export interface JobLanguageMatch {
  missing_phrases: string[];
  generic_phrases_to_replace: string[];
  suggested_replacements: LanguageReplacement[];
}

export interface BulletSuggestionV2 {
  type: "decision_first" | "keyword_alignment" | "shorter" | "clearer" | "language_match";
  why: string;
  rewrite: string;
  estimated_gain: string;
}

export interface BulletFeedback {
  bullet_id: string;
  score: number;
  issues: string[];
  recruiter_comment: string;
  suggestions: BulletSuggestionV2[];
}

export interface AtsCheckResult {
  overall_score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  summary: string;
  subscores: {
    parse: number;
    scanability: number;
    relevance: number;
    evidence: number;
  };
  first_scan_issues: FirstScanIssue[];
  scanability_check: ScanabilityItem[];
  parse_check: ParseCheckItem[];
  job_language_match: JobLanguageMatch;
  bullet_feedback: BulletFeedback[];
  next_actions: string[];
}
