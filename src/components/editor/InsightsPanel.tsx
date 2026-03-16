import { useMemo, useState } from "react";
import { CVContent } from "@/types/cv";
import { AtsCheckResult } from "@/types/ats-check";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { runAtsCheck } from "@/components/cv-editor/AtsCheck";
import { detectCvLanguages } from "@/lib/language-detection";
import { CheckCircle2, AlertTriangle, ShieldCheck, Loader2, ChevronDown, ChevronRight, Languages, Target, Eye, FileSearch, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  cv: CVContent;
  cvLanguage: "sv" | "en";
  t: (k: any) => string;
  jobPostingText?: string;
  onApplyBullet?: (bulletPath: string, newText: string) => void;
}

export function InsightsPanel({ cv, cvLanguage, t, jobPostingText, onApplyBullet }: Props) {
  const { toast } = useToast();
  const [deepResult, setDeepResult] = useState<AtsCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [jobText, setJobText] = useState(jobPostingText || "");
  const [showJob, setShowJob] = useState(false);
  const [bulletsOpen, setBulletsOpen] = useState(false);

  // Quick checks (real-time, client-side)
  const quickChecks = useMemo(() => runAtsCheck(cv, t), [cv, t]);
  const passCount = quickChecks.filter(c => c.pass).length;

  // Language check (real-time)
  const langCheck = useMemo(() => detectCvLanguages(cv, cvLanguage), [cv, cvLanguage]);
  const mismatchSections = langCheck.detected_sections.filter(s => s.language !== "unknown" && s.language !== cvLanguage && s.confidence > 0.5);

  // Bullet stats
  const allBullets = useMemo(() => {
    const exp = cv.experience.flatMap(e => e.bullets.filter(b => b.trim()));
    const proj = cv.projects.flatMap(p => p.bullets.filter(b => b.trim()));
    return [...exp, ...proj];
  }, [cv]);
  const avgLen = allBullets.length > 0 ? Math.round(allBullets.reduce((a, b) => a + b.length, 0) / allBullets.length) : 0;

  // Section completeness
  const enabledCount = cv.sections.filter(s => s.enabled).length;
  const filledCount = cv.sections.filter(s => s.enabled).filter(s => {
    switch (s.type) {
      case "contact": return !!(cv.contact.name && cv.contact.email);
      case "profile": return cv.profile.length > 10;
      case "experience": return cv.experience.length > 0;
      case "education": return cv.education.length > 0;
      case "skills": return cv.skills.length > 0;
      default: return false;
    }
  }).length;

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

  const scoreColor = (s: number) => s >= 80 ? "text-green-600" : s >= 60 ? "text-yellow-600" : "text-destructive";

  return (
    <div className="p-4 space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <Zap className="h-3.5 w-3.5 text-primary" /> Live Insights
      </p>

      {/* CV Completeness */}
      <Card><CardContent className="p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium">Completeness</span>
          <span className="text-xs text-muted-foreground">{filledCount}/{enabledCount}</span>
        </div>
        <Progress value={(filledCount / Math.max(enabledCount, 1)) * 100} className="h-1.5" />
      </CardContent></Card>

      {/* Quick ATS Check */}
      <Card><CardContent className="p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Quick Check</span>
          <Badge variant={passCount === quickChecks.length ? "default" : "secondary"} className="text-[9px] h-4">
            {passCount}/{quickChecks.length}
          </Badge>
        </div>
        {quickChecks.map(c => (
          <div key={c.key} className="flex items-center gap-2">
            {c.pass ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <AlertTriangle className="h-3 w-3 text-warning" />}
            <span className="text-[10px] text-muted-foreground">{c.label}</span>
          </div>
        ))}
      </CardContent></Card>

      {/* Language Check */}
      {mismatchSections.length > 0 && (
        <Card className="border-warning/30"><CardContent className="p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Languages className="h-3.5 w-3.5 text-warning" />
            <span className="text-xs font-medium">Language mismatch</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {mismatchSections.length} section(s) may contain mixed languages: {mismatchSections.map(s => s.section).join(", ")}
          </p>
        </CardContent></Card>
      )}

      {/* Bullet Stats */}
      <Card><CardContent className="p-3">
        <span className="text-xs font-medium flex items-center gap-1.5 mb-1.5"><Target className="h-3.5 w-3.5" /> Bullets</span>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div>
            <p className="text-lg font-bold">{allBullets.length}</p>
            <p className="text-[10px] text-muted-foreground">Total</p>
          </div>
          <div>
            <p className="text-lg font-bold">{avgLen}</p>
            <p className="text-[10px] text-muted-foreground">Avg chars</p>
          </div>
        </div>
        {avgLen > 180 && <p className="text-[10px] text-warning mt-1">⚠ Average bullet is long. Aim for 90–180 chars.</p>}
      </CardContent></Card>

      {/* Job posting */}
      <Collapsible open={showJob} onOpenChange={setShowJob}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-between h-7 text-xs">
            <span>Job posting context</span>
            {showJob ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <Textarea rows={4} value={jobText} onChange={e => setJobText(e.target.value)} placeholder="Paste a job posting for job-specific feedback..." className="text-xs" />
        </CollapsibleContent>
      </Collapsible>

      {/* Deep Analysis */}
      <Button onClick={runDeep} disabled={loading} className="w-full text-xs h-9" variant={deepResult ? "outline" : "default"}>
        {loading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Eye className="h-3.5 w-3.5 mr-1.5" />}
        {loading ? "Analyzing..." : deepResult ? "Re-run deep analysis" : "Run deep analysis"}
      </Button>

      {/* Deep results */}
      {deepResult && (
        <div className="space-y-3 pt-2 border-t border-border">
          <div className="text-center">
            <div className={`text-3xl font-bold font-['Space_Grotesk'] ${scoreColor(deepResult.overall_score)}`}>
              {Math.round(deepResult.overall_score)}
            </div>
            <div className={`text-xs font-semibold ${scoreColor(deepResult.overall_score)}`}>Grade {deepResult.grade}</div>
            <p className="text-[10px] text-muted-foreground mt-1">{deepResult.summary}</p>
          </div>

          <div className="space-y-1">
            {([["Parse", deepResult.subscores.parse, 30], ["Scan", deepResult.subscores.scanability, 30], ["Relevance", deepResult.subscores.relevance, 25], ["Evidence", deepResult.subscores.evidence, 15]] as const).map(([l, v, m]) => (
              <div key={l} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-16">{l}</span>
                <Progress value={(v / m) * 100} className="h-1 flex-1" />
                <span className="text-[10px] font-semibold w-8 text-right">{v}/{m}</span>
              </div>
            ))}
          </div>

          {deepResult.first_scan_issues.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-warning">Top issues</p>
              {deepResult.first_scan_issues.map((issue, i) => (
                <div key={i} className="text-[10px] p-2 rounded border border-warning/20 bg-warning/5">
                  <p className="font-semibold">{issue.title}</p>
                  <p className="text-muted-foreground mt-0.5">→ {issue.fix}</p>
                </div>
              ))}
            </div>
          )}

          {deepResult.job_language_match.missing_phrases.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-destructive">Missing keywords</p>
              <div className="flex flex-wrap gap-1">
                {deepResult.job_language_match.missing_phrases.map(p => <Badge key={p} variant="destructive" className="text-[9px] h-4">{p}</Badge>)}
              </div>
            </div>
          )}

          {deepResult.bullet_feedback.length > 0 && (
            <Collapsible open={bulletsOpen} onOpenChange={setBulletsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between h-7 text-[10px]">
                  <span>Bullet feedback ({deepResult.bullet_feedback.length})</span>
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
                        Apply suggestion
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
