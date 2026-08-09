import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { X } from "lucide-react";
import { InsightsPanel } from "@/components/editor/InsightsPanel";
import { CVContent } from "@/types/cv";
import { AtsCheckResult } from "@/types/ats-check";
import { RoleFitResult } from "@/types/role-fit";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cv: CVContent;
  cvLanguage: "sv" | "en";
  t: (k: string) => string;
  seededJob?: string;
  seededResult?: AtsCheckResult | null;
  onApplyReframe: (experienceId: string, original: string, suggested: string) => boolean;
  onNavigateToSection: (sectionType: string) => void;
  onUpdateProfile: (text: string) => void;
  onUpdateExperienceBullets: (expIdx: number, bullets: string[]) => void;
  onUpdateSkills: (skills: string[]) => void;
  onPersistScore?: (score: number, grade: string, subscores?: AtsCheckResult["subscores"]) => void;
  onPersistResult?: (hash: string, result: AtsCheckResult) => void;
  onPersistRoleFit?: (hash: string, result: RoleFitResult) => void;
  onUpdateMeta?: (patch: Partial<CVContent["__meta"] & object>) => void;
  onDownload?: () => void;
  /** Cross-CV evidence lookup — see InsightsPanel. */
  profileEvidence?: (name: string) => { keyword: string; answer: string }[];
  /** Snapshot hook for one-step undo — see InsightsPanel. */
  onSnapshot?: (label: string) => void;
  /**
   * Docked mode: rendered as a fixed right column beside the document instead of an
   * overlay sheet — you watch the CV change while you answer (the Grammarly pattern).
   */
  docked?: boolean;
}

/**
 * One improvement surface, no tabs: the guided queue is the panel (NN/g: tabs are for
 * parallel views, never sequential work — and reframes ARE the same work). Role advice
 * lives in the apply flow's role path, not here.
 */
export function TailorPanel({
  open, onOpenChange, cv, cvLanguage, t, seededJob, seededResult,
  onApplyReframe, onNavigateToSection, onUpdateProfile, onUpdateExperienceBullets, onUpdateSkills, onPersistScore, onPersistResult, onPersistRoleFit, onUpdateMeta, onDownload, profileEvidence, onSnapshot, docked,
}: Props) {
  const isSv = cvLanguage === "sv";

  const inner = (
    <InsightsPanel
      cv={cv}
      cvLanguage={cvLanguage}
      t={t}
      jobPostingText={seededJob}
      initialResult={seededResult}
      onNavigateToSection={onNavigateToSection}
      onUpdateProfile={onUpdateProfile}
      onUpdateExperienceBullets={onUpdateExperienceBullets}
      onUpdateSkills={onUpdateSkills}
      onPersistScore={onPersistScore}
      onPersistResult={onPersistResult}
      autoRun={open}
      onUpdateMeta={onUpdateMeta}
      onDownload={onDownload}
      profileEvidence={profileEvidence}
      onSnapshot={onSnapshot}
      onApplyReframe={onApplyReframe}
      onPersistRoleFit={onPersistRoleFit}
    />
  );

  if (docked) {
    if (!open) return null;
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{isSv ? "Förbättra CV:t" : "Improve this CV"}</h2>
          <button type="button" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title={isSv ? "Stäng panelen" : "Close panel"} onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto">{inner}</div>
      </div>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="p-4 pb-2">
          <SheetTitle>{isSv ? "Förbättra CV:t" : "Improve this CV"}</SheetTitle>
        </SheetHeader>
        {inner}
      </SheetContent>
    </Sheet>
  );
}
