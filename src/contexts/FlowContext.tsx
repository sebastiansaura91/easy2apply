import React, { createContext, useContext, useState } from "react";
import { CVContent } from "@/types/cv";
import { AtsCheckResult } from "@/types/ats-check";

export interface JobAnalysis {
  job_title: string;
  company_name: string;
  seniority_level: string;
  key_requirements: string[];
  nice_to_have: string[];
  core_responsibilities: string[];
  key_phrases: string[];
  industry: string;
  detected_language?: string;
}

interface FlowState {
  jobPostingText: string;
  jobAnalysis: JobAnalysis | null;
  parsedCV: CVContent | null;
  resumeId: string | null;
  /** The ats-check result from the wizard, carried into the editor's insights panel. */
  analysis: AtsCheckResult | null;
}

interface FlowContextType extends FlowState {
  setJobPostingText: (text: string) => void;
  setJobAnalysis: (analysis: JobAnalysis) => void;
  setParsedCV: (cv: CVContent) => void;
  setResumeId: (id: string | null) => void;
  setAnalysis: (analysis: AtsCheckResult | null) => void;
  reset: () => void;
}

const initial: FlowState = { jobPostingText: "", jobAnalysis: null, parsedCV: null, resumeId: null, analysis: null };

const FlowContext = createContext<FlowContextType | undefined>(undefined);

export const FlowProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [s, setS] = useState<FlowState>(initial);
  return (
    <FlowContext.Provider value={{
      ...s,
      setJobPostingText: (jobPostingText) => setS(p => ({ ...p, jobPostingText })),
      setJobAnalysis: (jobAnalysis) => setS(p => ({ ...p, jobAnalysis })),
      setParsedCV: (parsedCV) => setS(p => ({ ...p, parsedCV })),
      setResumeId: (resumeId) => setS(p => ({ ...p, resumeId })),
      setAnalysis: (analysis) => setS(p => ({ ...p, analysis })),
      reset: () => setS(initial),
    }}>
      {children}
    </FlowContext.Provider>
  );
};

export const useFlow = () => {
  const ctx = useContext(FlowContext);
  if (!ctx) throw new Error("useFlow must be used within FlowProvider");
  return ctx;
};
