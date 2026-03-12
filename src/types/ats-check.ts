/** Types for the Enterprise ATS Check system */

export interface AtsProfile {
  name: "EnterpriseStrict" | "ModernSaaS" | "SMBBasic";
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  subscores: {
    parse: number;
    relevance: number;
    evidence: number;
    readability: number;
  };
  blockers: AtsBlocker[];
  issues: AtsIssue[];
}

export interface AtsBlocker {
  id: string;
  title: string;
  why_it_matters: string;
  evidence: string;
  fix: string;
  fix_action?: string;
}

export interface AtsIssue {
  severity: "high" | "medium" | "low";
  category: "parse_safety" | "dates" | "headings" | "contact" | "keywords" | "evidence" | "readability";
  title: string;
  evidence: string;
  recommendation: string;
  example_rewrite?: string;
  fix_action?: string;
}

export interface KeywordItem {
  term: string;
  depth: number;
  coverage: "missing" | "weak" | "ok" | "strong";
  evidence: string[];
}

export interface KeywordReport {
  mode: "job_posting" | "baseline" | "none";
  taxonomy: {
    must_have: KeywordItem[];
    nice_to_have: KeywordItem[];
    domain_terms: KeywordItem[];
    seniority_cues: KeywordItem[];
  };
  missing_must_have: string[];
  missing_nice_to_have: string[];
  overused_terms: string[];
  suggested_insertion_points: {
    term: string;
    where: string;
    safe_phrase: string;
  }[];
}

export interface SectionHealth {
  section: string;
  status: "ok" | "warn" | "fail";
  notes: string;
}

export interface AtsCheckResult {
  overall: {
    ats_score: number;
    grade: "A" | "B" | "C" | "D" | "F";
    summary: string;
  };
  profiles: AtsProfile[];
  keyword_report: KeywordReport;
  section_health: SectionHealth[];
  next_actions: string[];
}
