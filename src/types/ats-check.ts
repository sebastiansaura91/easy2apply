/** Types for the focused ATS Check system */

export interface AtsBlocker {
  title: string;
  why_it_matters: string;
  evidence: string;
  fix: string;
}

export interface AtsIssue {
  category: "parse" | "relevance" | "evidence" | "readability";
  severity: "high" | "medium" | "low";
  problem: string;
  evidence: string;
  fix: string;
  example_rewrite?: string;
}

export interface KeywordInsertion {
  keyword: string;
  where: string;
  safe_phrase: string;
}

export interface KeywordGap {
  must_have_missing: string[];
  nice_to_have_missing: string[];
  suggested_insertions: KeywordInsertion[];
}

export interface AtsCheckResult {
  ats_score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  summary: string;
  subscores: {
    parse: number;
    relevance: number;
    evidence: number;
    readability: number;
  };
  blockers: AtsBlocker[];
  top_issues: AtsIssue[];
  keyword_gap: KeywordGap;
  next_actions: string[];
}
