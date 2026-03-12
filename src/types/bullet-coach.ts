export type ProfileId =
  | "investment"
  | "pricing"
  | "crm_migration"
  | "ops_improvement"
  | "analytics_forecasting"
  | "product_delivery"
  | "partnerships"
  | "other";

export type Confidence = "high" | "medium" | "low";

export interface ProfileDetection {
  profile: ProfileId;
  confidence: Confidence;
  evidence: string;
}

export interface QuickProfile {
  id: ProfileId;
  label: { sv: string; en: string };
  keywords: string[];
  questions: { sv: string[]; en: string[] };
  allowed_verbs: { sv: string[]; en: string[] };
  recommended_metrics: string[];
  rewrite_templates: {
    sv: string[];
    en: string[];
  };
}

export type FactKey =
  | "decision_purpose"
  | "stakeholders"
  | "method_tool"
  | "scope"
  | "outcome_metric"
  | "seniority";

export interface VerifiedFact {
  key: FactKey;
  value: string;
  source: "user";
}

export interface CoachMessage {
  role: "assistant" | "user";
  content: string;
}

export interface CoachSuggestion {
  label: string;
  text: string;
  estimated_gain: string;
}

export interface BulletCoachState {
  bulletId: string;
  originalText: string;
  roleTitle?: string;
  company?: string;
  detectedProfile: ProfileDetection;
  messages: CoachMessage[];
  verifiedFacts: VerifiedFact[];
  suggestions: CoachSuggestion[];
  questionsAsked: number;
  loading: boolean;
}
