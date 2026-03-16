import React, { createContext, useContext, useState } from "react";
import { CVContent } from "@/types/cv";

export type UserGoal = "apply" | "improve" | "create" | "explore";

export interface JobAnalysis {
  job_title: string;
  company_name: string;
  seniority_level: string;
  key_requirements: string[];
  nice_to_have: string[];
  core_responsibilities: string[];
  key_phrases: string[];
  industry: string;
}

interface FlowState {
  goal: UserGoal | null;
  jobPostingText: string;
  jobAnalysis: JobAnalysis | null;
  parsedCV: CVContent | null;
  resumeId: string | null;
}

interface FlowContextType extends FlowState {
  setGoal: (goal: UserGoal) => void;
  setJobPostingText: (text: string) => void;
  setJobAnalysis: (analysis: JobAnalysis) => void;
  setParsedCV: (cv: CVContent) => void;
  setResumeId: (id: string) => void;
  reset: () => void;
}

const initial: FlowState = { goal: null, jobPostingText: "", jobAnalysis: null, parsedCV: null, resumeId: null };

const FlowContext = createContext<FlowContextType | undefined>(undefined);

export const FlowProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [s, setS] = useState<FlowState>(initial);
  return (
    <FlowContext.Provider value={{
      ...s,
      setGoal: (goal) => setS(p => ({ ...p, goal })),
      setJobPostingText: (jobPostingText) => setS(p => ({ ...p, jobPostingText })),
      setJobAnalysis: (jobAnalysis) => setS(p => ({ ...p, jobAnalysis })),
      setParsedCV: (parsedCV) => setS(p => ({ ...p, parsedCV })),
      setResumeId: (resumeId) => setS(p => ({ ...p, resumeId })),
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
