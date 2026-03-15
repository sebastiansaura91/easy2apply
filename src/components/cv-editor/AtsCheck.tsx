import { useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertOctagon,
  Zap,
  Target,
  ArrowRight,
  Eye,
  FileSearch,
  Languages,
  XCircle,
} from "lucide-react";
import { CVContent } from "@/types/cv";
import { AtsCheckResult, ScanabilityItem, ParseCheckItem, BulletFeedback } from "@/types/ats-check";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { BulletOptimizerPanel } from "./BulletOptimizer";

// Legacy quick-check for top bar badge
export function runAtsCheck(cv: CVContent, t: (k: any) => string) {
  const checks: { key: string; label: string; pass: boolean; message?: string }[] = [];
  const enabledSections = cv.sections.filter((s) => s.enabled).map((s) => s.type);
  const hasProfile = enabledSections.includes("profile") && cv.profile.length > 0;
  checks.push({ key: "headers", label: t("atsCheckHeaders"), pass: hasProfile });
  const dates = cv.experience.flatMap((e) => [e.startDate, e.endDate].filter(Boolean));
  const dateFormatOk = dates.every((d) => /^\d{4}-\d{2}$/.test(d));
  checks.push({ key: "dates", label: t("atsCheckDates"), pass: dates.length === 0 || dateFormatOk });
  const allText = JSON.stringify(cv);
  const hasSuspicious = /[\t]|(\|.*\|)/.test(allText);
  checks.push({ key: "chars", label: t("atsCheckChars"), pass: !hasSuspicious });
  const allBullets = cv.experience.flatMap((e) => e.bullets).concat(cv.projects.flatMap((p) => p.bullets));
  const longBullets = allBullets.filter((b) => b.length > 200);
  checks.push({ key: "bulletLength", label: t("atsCheckBulletLength"), pass: longBullets.length === 0, message: longBullets.length > 0 ? `${longBullets.length} bullets > 200 tecken` : undefined });
  const hasContact = cv.contact.name.length > 0 && cv.contact.email.length > 0;
  checks.push({ key: "contact", label: t("atsCheckContact"), pass: hasContact });
  return checks;
}

/* ── Helpers ── */

function gradeColor(grade: string) {
  switch (grade) {
    case "A": return "text-green-600 dark:text-green-400";
    case "B": return "text-blue-600 dark:text-blue-400";
    case "C": return "text-yellow-600 dark:text-yellow-400";
    case "D": return "text-orange-600 dark:text-orange-400";
    case "F": return "text-destructive";
    default: return "text-muted-foreground";
  }
}

function statusIcon(status: string) {
  switch (status) {
    case "pass": return <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />;
    case "warning": return <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />;
    case "fail": return <XCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />;
    default: return null;
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "pass": return <Badge variant="secondary" className="text-[9px] h-4 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0">Pass</Badge>;
    case "warning": return <Badge variant="outline" className="text-[9px] h-4 border-yellow-500 text-yellow-600">Warning</Badge>;
    case "fail": return <Badge variant="destructive" className="text-[9px] h-4">Fail</Badge>;
    default: return null;
  }
}

function dimensionLabel(dim: string): string {
  const labels: Record<string, string> = {
    single_column_flow: "Single-column flow",
    contact_info: "Contact info placement",
    plain_text_layout: "Plain-text layout",
    job_language_match: "Job ad language match",
    clean_vs_cluttered: "Clean vs cluttered",
  };
  return labels[dim] || dim;
}

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const radius = 54;
  const stroke = 8;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const dim = (radius + stroke) * 2;
  const color = score >= 90 ? "hsl(142,71%,45%)" : score >= 80 ? "hsl(217,91%,60%)" : score >= 70 ? "hsl(48,96%,53%)" : score >= 60 ? "hsl(25,95%,53%)" : "hsl(var(--destructive))";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={dim} height={dim} className="-rotate-90">
        <circle cx={radius + stroke} cy={radius + stroke} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
        <circle cx={radius + stroke} cy={radius + stroke} r={radius} fill="none" stroke={color}
          strokeWidth={stroke} strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" className="transition-all duration-1000" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-bold text-2xl ${gradeColor(grade)}`}>{Math.round(score)}</span>
        <span className={`text-xs font-semibold ${gradeColor(grade)}`}>{grade}</span>
      </div>
    </div>
  );
}

function scoreBadge(score: number) {
  const color = score >= 8 ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
    : score >= 5 ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
    : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${color}`}>{score}/10</span>;
}

function suggestionTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    decision_first: "Outcome first",
    keyword_alignment: "Keyword match",
    shorter: "Shorter",
    clearer: "Clearer",
    language_match: "Language match",
  };
  return labels[type] || type;
}

/* ── Main Panel ── */

interface AtsCheckPanelProps {
  cv: CVContent;
  t: (k: any) => string;
  cvLanguage?: "sv" | "en";
  jobPostingText?: string;
  onNavigateToSection?: (sectionType: string) => void;
  onApplyBullet?: (bulletPath: string, newText: string) => void;
}

export function AtsCheckPanel({ cv, t, cvLanguage, jobPostingText, onNavigateToSection, onApplyBullet }: AtsCheckPanelProps) {
  const [result, setResult] = useState<AtsCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [jobText, setJobText] = useState(jobPostingText || "");
  const [scanOpen, setScanOpen] = useState(true);
  const [parseOpen, setParseOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [bulletsOpen, setBulletsOpen] = useState(false);
  const { toast } = useToast();
  const isSv = cvLanguage !== "en";

  const runCheck = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ats-check", {
        body: {
          resume_content_json: cv,
          job_posting_text: jobText.trim() || undefined,
          locale: cvLanguage || "sv",
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data as AtsCheckResult);
    } catch (err: any) {
      toast({ title: isSv ? "ATS-kontroll misslyckades" : "ATS check failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Pre-run view ──
  if (!result) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{isSv ? "Snabbkontroll" : "Quick check"}</p>
          {runAtsCheck(cv, t).map((check) => (
            <div key={check.key} className="flex items-center gap-3 p-2.5 rounded-lg border border-border">
              {check.pass ? <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" /> : <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />}
              <div>
                <p className="text-xs font-medium">{check.label}</p>
                {check.message && <p className="text-[10px] text-muted-foreground">{check.message}</p>}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{isSv ? "Jobbannons (valfritt)" : "Job posting (optional)"}</p>
          <Textarea rows={4} value={jobText} onChange={(e) => setJobText(e.target.value)}
            placeholder={isSv ? "Klistra in jobbannons för bättre analys..." : "Paste job posting for better analysis..."} className="text-xs" />
        </div>

        <Button onClick={runCheck} disabled={loading} className="w-full gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {loading ? (isSv ? "Analyserar CV..." : "Analyzing CV...") : (isSv ? "Kör ATS + Rekryterarkontroll" : "Run ATS + Recruiter Check")}
        </Button>
      </div>
    );
  }

  // ── Results view ──
  const subscoreItems: [string, number, number][] = [
    ["Parse", result.subscores.parse, 30],
    [isSv ? "Skanning" : "Scan", result.subscores.scanability, 30],
    [isSv ? "Relevans" : "Relevance", result.subscores.relevance, 25],
    [isSv ? "Evidens" : "Evidence", result.subscores.evidence, 15],
  ];

  const hasLangMatch = result.job_language_match.missing_phrases.length > 0 ||
    result.job_language_match.generic_phrases_to_replace.length > 0 ||
    result.job_language_match.suggested_replacements.length > 0;

  return (
    <div className="space-y-4">
      {/* ── 1. Score + Summary ── */}
      <div className="flex items-center gap-4">
        <ScoreRing score={result.overall_score} grade={result.grade} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{isSv ? "ATS + Rekryterarscore" : "ATS + Recruiter Score"}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{result.summary}</p>
        </div>
      </div>

      {/* ── Subscores ── */}
      <div className="grid grid-cols-4 gap-2">
        {subscoreItems.map(([label, val, max]) => (
          <div key={label} className="text-center space-y-1">
            <p className="text-[10px] text-muted-foreground">{label}</p>
            <Progress value={(val / max) * 100} className="h-1.5" />
            <p className="text-xs font-semibold">{val}/{max}</p>
          </div>
        ))}
      </div>

      {/* ── 2. What a recruiter sees first ── */}
      {result.first_scan_issues.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5 text-primary" />
            {isSv ? "Vad en rekryterare ser först" : "What a recruiter sees first"}
          </p>
          {result.first_scan_issues.map((issue, i) => (
            <Card key={i} className="border-destructive/20 bg-destructive/5">
              <CardContent className="p-3 space-y-1">
                <p className="text-xs font-semibold text-destructive">{issue.title}</p>
                <p className="text-[10px] text-muted-foreground">{issue.why_it_matters}</p>
                <p className="text-[10px] font-medium">→ {issue.fix}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── 3. Recruiter Scan Check ── */}
      <Collapsible open={scanOpen} onOpenChange={setScanOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-between h-8 text-xs">
            <span className="flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5" />
              {isSv ? "Rekryterarskanningskontroll" : "Recruiter Scan Check"}
              <ScanSummaryBadge items={result.scanability_check} />
            </span>
            {scanOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-1.5 mt-2">
          {result.scanability_check.map((item, i) => (
            <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border">
              {statusIcon(item.status)}
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium">{dimensionLabel(item.dimension)}</p>
                  {statusBadge(item.status)}
                </div>
                <p className="text-[10px] text-muted-foreground">{item.why_it_matters}</p>
                {item.status !== "pass" && (
                  <p className="text-[10px] font-medium text-primary">→ {item.recommendation}</p>
                )}
              </div>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>

      {/* ── 4. ATS / Parse Check ── */}
      <Collapsible open={parseOpen} onOpenChange={setParseOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-between h-8 text-xs">
            <span className="flex items-center gap-1.5">
              <FileSearch className="h-3.5 w-3.5" />
              ATS / Parse Check
              <ScanSummaryBadge items={result.parse_check} />
            </span>
            {parseOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-1.5 mt-2">
          {result.parse_check.map((item, i) => (
            <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border">
              {statusIcon(item.status)}
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium">{item.dimension}</p>
                  {statusBadge(item.status)}
                </div>
                <p className="text-[10px] text-muted-foreground">{item.why_it_matters}</p>
                {item.status !== "pass" && (
                  <p className="text-[10px] font-medium text-primary">→ {item.recommendation}</p>
                )}
              </div>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>

      {/* ── 5. Job Ad Language Match ── */}
      {hasLangMatch && (
        <Collapsible open={langOpen} onOpenChange={setLangOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between h-8 text-xs">
              <span className="flex items-center gap-1.5">
                <Languages className="h-3.5 w-3.5" />
                {isSv ? "Språkmatchning mot jobbannonsen" : "Job Ad Language Match"}
              </span>
              {langOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 mt-2">
            {result.job_language_match.missing_phrases.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-destructive">{isSv ? "Saknade fraser från annonsen" : "Missing phrases from the ad"}</p>
                <div className="flex flex-wrap gap-1">
                  {result.job_language_match.missing_phrases.map((term) => (
                    <Badge key={term} variant="destructive" className="text-[10px] h-5">{term}</Badge>
                  ))}
                </div>
              </div>
            )}

            {result.job_language_match.generic_phrases_to_replace.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-yellow-600">{isSv ? "Generiska fraser att ersätta" : "Generic phrases to replace"}</p>
                <div className="flex flex-wrap gap-1">
                  {result.job_language_match.generic_phrases_to_replace.map((term) => (
                    <Badge key={term} variant="outline" className="text-[10px] h-5 border-yellow-500">{term}</Badge>
                  ))}
                </div>
              </div>
            )}

            {result.job_language_match.suggested_replacements.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{isSv ? "Föreslagna ersättningar" : "Suggested replacements"}</p>
                {result.job_language_match.suggested_replacements.map((r, i) => (
                  <div key={i} className="rounded border border-primary/20 bg-primary/5 p-2 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] line-through text-muted-foreground">{r.from}</span>
                      <ArrowRight className="h-2.5 w-2.5 text-primary" />
                      <span className="text-[10px] font-medium text-primary">{r.to}</span>
                    </div>
                    <p className="text-[9px] text-muted-foreground">{r.where}</p>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* ── 6. Bullet Feedback ── */}
      {result.bullet_feedback.length > 0 && (
        <Collapsible open={bulletsOpen} onOpenChange={setBulletsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between h-8 text-xs">
              <span className="flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5" />
                {isSv ? "Bullet-feedback" : "Bullet Feedback"} ({result.bullet_feedback.length})
              </span>
              {bulletsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 mt-2">
            {result.bullet_feedback.map((bf, i) => (
              <BulletFeedbackCard key={i} feedback={bf} onApply={onApplyBullet} />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* ── Next Actions ── */}
      {result.next_actions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            {isSv ? "Prioriterade åtgärder" : "Prioritized actions"}
          </p>
          {result.next_actions.map((action, i) => (
            <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border">
              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-[10px] font-bold text-primary">{i + 1}</span>
              </div>
              <p className="text-xs">{action}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Bullet Optimizer ── */}
      {onApplyBullet && (
        <div className="pt-2 border-t border-border">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-2">
            <Zap className="h-3.5 w-3.5" />
            {isSv ? "Punkt-optimerare" : "Bullet Optimizer"}
          </p>
          <BulletOptimizerPanel
            cv={cv}
            cvLanguage={cvLanguage || "sv"}
            jobPostingText={jobText}
            onApplyBullet={onApplyBullet}
          />
        </div>
      )}

      {/* ── Re-run ── */}
      <div className="pt-2 border-t border-border space-y-2">
        <Textarea rows={3} value={jobText} onChange={(e) => setJobText(e.target.value)}
          placeholder={isSv ? "Klistra in jobbannons..." : "Paste job posting..."} className="text-xs" />
        <Button onClick={runCheck} disabled={loading} variant="outline" size="sm" className="w-full gap-1.5">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          {loading ? (isSv ? "Analyserar..." : "Analyzing...") : (isSv ? "Kör om kontroll" : "Re-run check")}
        </Button>
      </div>
    </div>
  );
}

/* ── Scan Summary Badge ── */
function ScanSummaryBadge({ items }: { items: (ScanabilityItem | ParseCheckItem)[] }) {
  const fails = items.filter((i) => i.status === "fail").length;
  const warns = items.filter((i) => i.status === "warning").length;
  if (fails > 0) return <Badge variant="destructive" className="text-[9px] h-4">{fails} fail</Badge>;
  if (warns > 0) return <Badge variant="outline" className="text-[9px] h-4 border-yellow-500 text-yellow-600">{warns} warn</Badge>;
  return <Badge variant="secondary" className="text-[9px] h-4 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0">All pass</Badge>;
}

/* ── Bullet Feedback Card ── */
function BulletFeedbackCard({ feedback, onApply }: { feedback: BulletFeedback; onApply?: (bulletPath: string, newText: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full text-left p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors">
          <div className="flex items-center gap-2">
            {open ? <ChevronDown className="h-3 w-3 flex-shrink-0" /> : <ChevronRight className="h-3 w-3 flex-shrink-0" />}
            {scoreBadge(feedback.score)}
            <span className="text-[10px] text-muted-foreground flex-shrink-0">{feedback.bullet_id}</span>
          </div>
          <p className="text-[10px] italic text-muted-foreground mt-1">{feedback.recruiter_comment}</p>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-3 pr-1 pb-2 space-y-2 mt-1">
        {feedback.issues.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {feedback.issues.map((issue, i) => (
              <Badge key={i} variant="outline" className="text-[9px] h-4 border-destructive/40 text-destructive">
                {issue}
              </Badge>
            ))}
          </div>
        )}
        {feedback.suggestions.map((s, i) => (
          <Card key={i} className="border-primary/20 bg-primary/5">
            <CardContent className="p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[9px] h-4">{suggestionTypeLabel(s.type)}</Badge>
                  <span className="text-[9px] text-green-600 dark:text-green-400 font-medium">{s.estimated_gain}</span>
                </div>
                {onApply && (
                  <Button size="sm" variant="default" className="h-5 text-[10px] px-2" onClick={() => onApply(feedback.bullet_id, s.rewrite)}>
                    Apply
                  </Button>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">{s.why}</p>
              <div className="rounded bg-background border border-border p-2">
                <p className="text-xs italic text-foreground">{s.rewrite}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
