import { useMemo, useState } from "react";
import { CVContent } from "@/types/cv";
import { AtsCheckResult, FirstScanIssue } from "@/types/ats-check";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { runAtsCheck } from "@/components/cv-editor/AtsCheck";
import { detectCvLanguages } from "@/lib/language-detection";
import { findCvIssues, analyzeAllBullets, CvIssue } from "@/lib/cv-quality";
import { FixIssueWizard } from "@/components/cv-editor/FixIssueWizard";
import {
  CheckCircle2, AlertTriangle, AlertOctagon, Loader2, ChevronDown, ChevronRight,
  Languages, Target, Eye, Zap, ArrowRight, Sparkles, Wrench,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  cv: CVContent;
  cvLanguage: "sv" | "en";
  t: (k: any) => string;
  jobPostingText?: string;
  onApplyBullet?: (bulletPath: string, newText: string) => void;
  onNavigateToSection?: (sectionType: string) => void;
  onUpdateProfile?: (text: string) => void;
  onUpdateExperienceBullets?: (expIdx: number, bullets: string[]) => void;
  onUpdateSkills?: (skills: string[]) => void;
}

function severityIcon(severity: CvIssue["severity"]) {
  switch (severity) {
    case "error": return <AlertOctagon className="h-4 w-4 text-destructive flex-shrink-0" />;
    case "warning": return <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />;
    case "tip": return <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />;
  }
}

function severityBorder(severity: CvIssue["severity"]) {
  switch (severity) {
    case "error": return "border-destructive/30 bg-destructive/5";
    case "warning": return "border-warning/30 bg-warning/5";
    case "tip": return "border-primary/20 bg-primary/5";
  }
}

export function InsightsPanel({
  cv, cvLanguage, t, jobPostingText, onApplyBullet, onNavigateToSection,
  onUpdateProfile, onUpdateExperienceBullets, onUpdateSkills,
}: Props) {
  const { toast } = useToast();
  const [deepResult, setDeepResult] = useState<AtsCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [jobText, setJobText] = useState(jobPostingText || "");
  const [showJob, setShowJob] = useState(false);
  const [bulletsOpen, setBulletsOpen] = useState(false);
  const [fixingIssue, setFixingIssue] = useState<FirstScanIssue | null>(null);
  const isSv = cvLanguage === "sv";

  // ── Real-time issues (client-side, instant) ──
  const issues = useMemo(() => findCvIssues(cv, cvLanguage), [cv, cvLanguage]);
  const errorCount = issues.filter(i => i.severity === "error").length;
  const warningCount = issues.filter(i => i.severity === "warning").length;

  // Bullet quality
  const bulletAnalysis = useMemo(() => analyzeAllBullets(cv, cvLanguage), [cv, cvLanguage]);
  const weakBullets = bulletAnalysis.filter(b => b.score === "weak").length;
  const goodBullets = bulletAnalysis.filter(b => b.score === "good").length;
  const totalBullets = bulletAnalysis.length;

  // Language check
  const langCheck = useMemo(() => detectCvLanguages(cv, cvLanguage), [cv, cvLanguage]);
  const mismatchSections = langCheck.detected_sections.filter(s => s.language !== "unknown" && s.language !== cvLanguage && s.confidence > 0.5);

  // Overall health
  const healthScore = useMemo(() => {
    let score = 100;
    score -= errorCount * 15;
    score -= warningCount * 5;
    score -= weakBullets * 3;
    score -= mismatchSections.length * 5;
    return Math.max(0, Math.min(100, score));
  }, [errorCount, warningCount, weakBullets, mismatchSections.length]);

  const healthColor = healthScore >= 80 ? "text-green-600" : healthScore >= 60 ? "text-warning" : "text-destructive";
  const healthLabel = healthScore >= 80 ? (isSv ? "Bra grund" : "Good foundation") : healthScore >= 60 ? (isSv ? "Behöver justeringar" : "Needs adjustments") : (isSv ? "Kräver uppmärksamhet" : "Needs attention");

  const runDeep = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ats-check", {
        body: { resume_content_json: cv, job_posting_text: jobText.trim() || undefined, locale: cvLanguage },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setDeepResult(data as AtsCheckResult);
    } catch (e: any) {
      toast({ title: "Analysis failed", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const scoreColor = (s: number) => s >= 80 ? "text-green-600" : s >= 60 ? "text-warning" : "text-destructive";

  const canFix = !!onUpdateProfile && !!onUpdateExperienceBullets && !!onUpdateSkills;

  // ── Fix issue wizard overlay ──
  if (fixingIssue && canFix) {
    return (
      <div className="p-4">
        <FixIssueWizard
          issue={fixingIssue}
          cv={cv}
          cvLanguage={cvLanguage}
          jobPostingText={jobText || jobPostingText}
          onApplyToProfile={onUpdateProfile}
          onApplyToExperience={onUpdateExperienceBullets}
          onApplyToSkills={onUpdateSkills}
          onClose={() => setFixingIssue(null)}
          onNavigateToSection={onNavigateToSection}
        />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* ── Health overview ── */}
      <div className="text-center pb-3 border-b border-border">
        <div className={`text-3xl font-bold font-['Space_Grotesk'] ${healthColor}`}>{healthScore}</div>
        <p className={`text-xs font-semibold ${healthColor}`}>{healthLabel}</p>
        <div className="flex justify-center gap-3 mt-2">
          {errorCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-destructive">
              <AlertOctagon className="h-3 w-3" /> {errorCount} {isSv ? "kritiska" : "critical"}
            </span>
          )}
          {warningCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-warning">
              <AlertTriangle className="h-3 w-3" /> {warningCount} {isSv ? "varningar" : "warnings"}
            </span>
          )}
          {errorCount === 0 && warningCount === 0 && (
            <span className="flex items-center gap-1 text-[10px] text-green-600">
              <CheckCircle2 className="h-3 w-3" /> {isSv ? "Inga problem hittade" : "No issues found"}
            </span>
          )}
        </div>
      </div>

      {/* ── Actionable issues list ── */}
      {issues.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {isSv ? "Vad du bör åtgärda" : "What to fix"}
          </p>
          {issues.map(issue => (
            <button
              key={issue.id}
              className={`w-full text-left rounded-lg border p-3 space-y-1 transition-colors hover:shadow-sm ${severityBorder(issue.severity)}`}
              onClick={() => onNavigateToSection?.(issue.section)}
            >
              <div className="flex items-start gap-2">
                {severityIcon(issue.severity)}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">{issue.title}</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">{issue.description}</p>
                  <p className="text-[10px] font-medium text-primary mt-1 flex items-center gap-1">
                    <ArrowRight className="h-2.5 w-2.5" /> {issue.fix}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Bullet quality summary ── */}
      {totalBullets > 0 && (
        <Card><CardContent className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" /> {isSv ? "Punktkvalitet" : "Bullet quality"}
            </span>
            <span className="text-[10px] text-muted-foreground">{totalBullets} totalt</span>
          </div>
          <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-muted">
            {goodBullets > 0 && <div className="bg-green-500 transition-all" style={{ width: `${(goodBullets / totalBullets) * 100}%` }} />}
            {(totalBullets - goodBullets - weakBullets) > 0 && <div className="bg-yellow-400 transition-all" style={{ width: `${((totalBullets - goodBullets - weakBullets) / totalBullets) * 100}%` }} />}
            {weakBullets > 0 && <div className="bg-destructive transition-all" style={{ width: `${(weakBullets / totalBullets) * 100}%` }} />}
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[9px] text-green-600">● {goodBullets} {isSv ? "starka" : "strong"}</span>
            <span className="text-[9px] text-yellow-600">● {totalBullets - goodBullets - weakBullets} {isSv ? "okej" : "okay"}</span>
            <span className="text-[9px] text-destructive">● {weakBullets} {isSv ? "svaga" : "weak"}</span>
          </div>
        </CardContent></Card>
      )}

      {/* ── Language mismatch ── */}
      {mismatchSections.length > 0 && (
        <Card className={`${severityBorder("warning")}`}><CardContent className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Languages className="h-3.5 w-3.5 text-warning" />
            <span className="text-xs font-semibold">{isSv ? "Blandade språk" : "Mixed languages"}</span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            {isSv
              ? `${mismatchSections.length} sektion(er) verkar vara på fel språk: ${mismatchSections.map(s => s.section).join(", ")}`
              : `${mismatchSections.length} section(s) appear to be in the wrong language: ${mismatchSections.map(s => s.section).join(", ")}`}
          </p>
          <p className="text-[10px] font-medium text-primary mt-1">
            → {isSv ? "Använd 'Konvertera alla' i verktygsfältet" : "Use 'Convert all' in the toolbar"}
          </p>
        </CardContent></Card>
      )}

      {/* ── Job posting context ── */}
      <Collapsible open={showJob} onOpenChange={setShowJob}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-between h-7 text-xs">
            <span>{isSv ? "Jobbannons (för bättre analys)" : "Job posting (for better analysis)"}</span>
            {showJob ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <Textarea rows={4} value={jobText} onChange={e => setJobText(e.target.value)} placeholder={isSv ? "Klistra in jobbannons..." : "Paste a job posting..."} className="text-xs" />
        </CollapsibleContent>
      </Collapsible>

      {/* ── Deep analysis CTA ── */}
      <Button onClick={runDeep} disabled={loading} className="w-full text-xs h-9" variant={deepResult ? "outline" : "default"}>
        {loading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Eye className="h-3.5 w-3.5 mr-1.5" />}
        {loading
          ? (isSv ? "Analyserar..." : "Analyzing...")
          : deepResult
            ? (isSv ? "Kör djupanalys igen" : "Re-run deep analysis")
            : (isSv ? "Se hur ditt CV presterar" : "See how your CV performs")}
      </Button>

      {/* ── Deep results ── */}
      {deepResult && (
        <div className="space-y-3 pt-3 border-t border-border">
          <div className="text-center">
            <div className={`text-3xl font-bold font-['Space_Grotesk'] ${scoreColor(deepResult.overall_score)}`}>
              {Math.round(deepResult.overall_score)}
            </div>
            <div className={`text-xs font-semibold ${scoreColor(deepResult.overall_score)}`}>Grade {deepResult.grade}</div>
            <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{deepResult.summary}</p>
          </div>

          <div className="space-y-1.5">
            {([["Parse", deepResult.subscores.parse, 30], ["Scan", deepResult.subscores.scanability, 30], [isSv ? "Relevans" : "Relevance", deepResult.subscores.relevance, 25], [isSv ? "Evidens" : "Evidence", deepResult.subscores.evidence, 15]] as const).map(([l, v, m]) => (
              <div key={l} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-16">{l}</span>
                <Progress value={(v / m) * 100} className="h-1.5 flex-1" />
                <span className="text-[10px] font-semibold w-10 text-right">{v}/{m}</span>
              </div>
            ))}
          </div>

          {/* Top issues — NOW WITH FIX BUTTONS */}
          {deepResult.first_scan_issues.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3 text-warning" />
                {isSv ? "Vad en rekryterare märker" : "Top issues a recruiter would notice"}
              </p>
              {deepResult.first_scan_issues.map((issue, i) => (
                <div key={i} className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-2">
                  <p className="text-xs font-bold">{issue.title}</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">{issue.why_it_matters}</p>
                  <p className="text-[10px] font-medium text-primary flex items-center gap-1">
                    <ArrowRight className="h-2.5 w-2.5" /> {issue.fix}
                  </p>
                  {canFix && (
                    <Button
                      variant="default"
                      size="sm"
                      className="w-full h-7 text-[10px] gap-1.5 mt-1"
                      onClick={() => setFixingIssue(issue)}
                    >
                      <Wrench className="h-3 w-3" />
                      {isSv ? "Fixa detta" : "Fix this issue"}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Missing keywords */}
          {deepResult.job_language_match.missing_phrases.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {isSv ? "Saknade nyckelord" : "Missing keywords"}
              </p>
              <div className="flex flex-wrap gap-1">
                {deepResult.job_language_match.missing_phrases.map(p => (
                  <Badge key={p} variant="destructive" className="text-[9px] h-5">{p}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Bullet feedback */}
          {deepResult.bullet_feedback.length > 0 && (
            <Collapsible open={bulletsOpen} onOpenChange={setBulletsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between h-7 text-[10px]">
                  <span>{isSv ? "Punktfeedback" : "Bullet feedback"} ({deepResult.bullet_feedback.length})</span>
                  {bulletsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1.5 mt-1">
                {deepResult.bullet_feedback.map((b, i) => (
                  <div key={i} className="text-[10px] p-2 rounded border border-border">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Badge variant={b.score < 4 ? "destructive" : b.score < 7 ? "outline" : "secondary"} className="text-[8px] h-3.5">{b.score}/10</Badge>
                      <span className="text-muted-foreground truncate">{b.bullet_id}</span>
                    </div>
                    <p className="text-muted-foreground">{b.recruiter_comment}</p>
                    {b.suggestions.length > 0 && b.suggestions[0].rewrite && onApplyBullet && (
                      <Button variant="ghost" size="sm" className="h-5 text-[9px] mt-1 text-primary" onClick={() => onApplyBullet(b.bullet_id, b.suggestions[0].rewrite)}>
                        {isSv ? "Applicera förslag" : "Apply suggestion"}
                      </Button>
                    )}
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}
    </div>
  );
}
