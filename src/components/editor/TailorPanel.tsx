import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { InsightsPanel } from "@/components/editor/InsightsPanel";
import { RoleFitPanel } from "@/components/role/RoleFitPanel";
import { RoleAdvicePanel } from "@/components/role/RoleAdvicePanel";
import { CVContent } from "@/types/cv";
import { AtsCheckResult } from "@/types/ats-check";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cv: CVContent;
  cvLanguage: "sv" | "en";
  t: (k: string) => string;
  seededJob?: string;
  seededResult?: AtsCheckResult | null;
  onApplyReframe: (experienceId: string, original: string, suggested: string) => void;
  onNavigateToSection: (sectionType: string) => void;
  onUpdateProfile: (text: string) => void;
  onUpdateExperienceBullets: (expIdx: number, bullets: string[]) => void;
  onUpdateSkills: (skills: string[]) => void;
}

/**
 * One tailoring surface for the editor, replacing the three separate panels
 * (Insights / Role fit / Role advice). Role fit is the default when the CV is
 * angled at a role; ATS & words is always available; the role guide shows for
 * preset roles.
 */
export function TailorPanel({
  open, onOpenChange, cv, cvLanguage, t, seededJob, seededResult,
  onApplyReframe, onNavigateToSection, onUpdateProfile, onUpdateExperienceBullets, onUpdateSkills,
}: Props) {
  const isSv = cvLanguage === "sv";
  const hasRole = !!(cv.__meta?.targetRole || cv.__meta?.targetRoleLabel);
  const hasPresetRole = !!cv.__meta?.targetRole;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="p-4 pb-2">
          <SheetTitle>{isSv ? "Förbättra CV:t" : "Improve this CV"}</SheetTitle>
        </SheetHeader>
        <Tabs defaultValue={hasRole ? "fit" : "ats"} className="flex-1">
          <TabsList className="mx-4 grid grid-cols-3">
            <TabsTrigger value="fit" disabled={!hasRole}>{isSv ? "Rollfit" : "Role fit"}</TabsTrigger>
            <TabsTrigger value="ats">{isSv ? "ATS & ord" : "ATS & words"}</TabsTrigger>
            <TabsTrigger value="guide" disabled={!hasPresetRole}>{isSv ? "Rollguide" : "Role guide"}</TabsTrigger>
          </TabsList>

          <TabsContent value="fit" className="mt-0">
            {hasRole ? (
              <RoleFitPanel cv={cv} cvLanguage={cvLanguage} onApplyReframe={onApplyReframe} />
            ) : (
              <p className="p-4 text-sm text-muted-foreground">
                {isSv ? "Rikta CV:t mot en roll för att se rollfit." : "Tailor this CV to a role to see role fit."}
              </p>
            )}
          </TabsContent>

          <TabsContent value="ats" className="mt-0">
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
            />
          </TabsContent>

          <TabsContent value="guide" className="mt-0">
            {hasPresetRole ? (
              <div className="p-4">
                <RoleAdvicePanel roleId={cv.__meta?.targetRole} />
              </div>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">
                {isSv ? "Ingen färdig rollguide för egna roller." : "No preset guide for custom roles."}
              </p>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
