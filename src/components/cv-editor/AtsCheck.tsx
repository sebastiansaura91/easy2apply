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
} from "lucide-react";
import { CVContent } from "@/types/cv";
import { AtsCheckResult } from "@/types/ats-check";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";

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

function severityBadge(severity: string) {
  switch (severity) {
    case "high": return <Badge variant="destructive" className="text-[9px] h-4">Hög</Badge>;
    case "medium": return <Badge variant="outline" className="text-[9px] h-4 border-yellow-500 text-yellow-600">Medel</Badge>;
    case "low": return <Badge variant="secondary" className="text-[9px] h-4">Låg</Badge>;
    default: return null;
  }
}

function categoryLabel(cat: string) {
  switch (cat) {
    case "parse": return "Parse";
    case "relevance": return "Relevans";
    case "evidence": return "Evidens";
    case "readability": return "Läsbarhet";
    default: return cat;
  }
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

/* ── Main Panel ── */

interface AtsCheckPanelProps {
  cv: CVContent;
  t: (k: any) => string;
  cvLanguage?: "sv" | "en";
  jobPostingText?: string;
  onNavigateToSection?: (sectionType: string) => void;
}

export function AtsCheckPanel({ cv, t, cvLanguage, jobPostingText, onNavigateToSection }: AtsCheckPanelProps) {
  const [result, setResult] = useState<AtsCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [jobText, setJobText] = useState(jobPostingText || "");
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [keywordsOpen, setKeywordsOpen] = useState(false);
  const { toast } = useToast();

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
      toast({ title: "ATS-kontroll misslyckades", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Pre-run view ──
  if (!result) {
    return (
      <div className="space-y-4">
        {/* Legacy quick checks */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Snabbkontroll</p>
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
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Jobbannons (valfritt)</p>
          <Textarea rows={4} value={jobText} onChange={(e) => setJobText(e.target.value)}
            placeholder="Klistra in jobbannons för keyword-matchning..." className="text-xs" />
        </div>

        <Button onClick={runCheck} disabled={loading} className="w-full gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {loading ? "Analyserar CV..." : "Kör ATS-kontroll"}
        </Button>
      </div>
    );
  }

  // ── Results view ──
  const subscoreItems: [string, number, number][] = [
    ["Parse", result.subscores.parse, 40],
    ["Relevans", result.subscores.relevance, 30],
    ["Evidens", result.subscores.evidence, 20],
    ["Läsbarhet", result.subscores.readability, 10],
  ];

  const hasKeywordGap = result.keyword_gap.must_have_missing.length > 0 ||
    result.keyword_gap.nice_to_have_missing.length > 0 ||
    result.keyword_gap.suggested_insertions.length > 0;

  return (
    <div className="space-y-4">
      {/* ── Score + Summary ── */}
      <div className="flex items-center gap-4">
        <ScoreRing score={result.ats_score} grade={result.grade} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">ATS Score</p>
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

      {/* ── Blockers ── */}
      {result.blockers.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-destructive flex items-center gap-1.5">
            <AlertOctagon className="h-3.5 w-3.5" />
            {result.blockers.length} Blockers
          </p>
          {result.blockers.map((b, i) => (
            <Card key={i} className="border-destructive/30 bg-destructive/5">
              <CardContent className="p-3 space-y-1.5">
                <p className="text-xs font-semibold text-destructive">{b.title}</p>
                <p className="text-[10px] text-muted-foreground">{b.why_it_matters}</p>
                <p className="text-[10px] italic">Evidence: {b.evidence}</p>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-[10px] font-medium flex-1">→ {b.fix}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Top Issues ── */}
      {result.top_issues.length > 0 && (
        <Collapsible open={issuesOpen} onOpenChange={setIssuesOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between h-8 text-xs">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                {result.top_issues.length} Problem
              </span>
              {issuesOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 mt-2">
            {result.top_issues.map((issue, i) => (
              <Card key={i} className="border-border">
                <CardContent className="p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    {severityBadge(issue.severity)}
                    <Badge variant="outline" className="text-[9px] h-4">{categoryLabel(issue.category)}</Badge>
                  </div>
                  <p className="text-xs font-medium">{issue.problem}</p>
                  <p className="text-[10px] text-muted-foreground">{issue.evidence}</p>
                  <p className="text-[10px] font-medium">→ {issue.fix}</p>
                  {issue.example_rewrite && (
                    <p className="text-[10px] italic text-primary">Ex: "{issue.example_rewrite}"</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* ── Keyword Gap ── */}
      {hasKeywordGap && (
        <Collapsible open={keywordsOpen} onOpenChange={setKeywordsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between h-8 text-xs">
              <span className="flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5" />
                Keyword Gap
              </span>
              {keywordsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 mt-2">
            {result.keyword_gap.must_have_missing.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-destructive">Saknade must-have</p>
                <div className="flex flex-wrap gap-1">
                  {result.keyword_gap.must_have_missing.map((term) => (
                    <Badge key={term} variant="destructive" className="text-[10px] h-5">{term}</Badge>
                  ))}
                </div>
              </div>
            )}

            {result.keyword_gap.nice_to_have_missing.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-yellow-600">Saknade nice-to-have</p>
                <div className="flex flex-wrap gap-1">
                  {result.keyword_gap.nice_to_have_missing.map((term) => (
                    <Badge key={term} variant="outline" className="text-[10px] h-5 border-yellow-500">{term}</Badge>
                  ))}
                </div>
              </div>
            )}

            {result.keyword_gap.suggested_insertions.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Föreslagna insättningar</p>
                {result.keyword_gap.suggested_insertions.map((sp, i) => (
                  <div key={i} className="rounded border border-primary/20 bg-primary/5 p-2 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <Target className="h-3 w-3 text-primary flex-shrink-0" />
                      <span className="text-[10px] font-medium">{sp.keyword}</span>
                      <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">{sp.where}</span>
                    </div>
                    <p className="text-[10px] italic pl-4">{sp.safe_phrase}</p>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* ── Next Actions ── */}
      {result.next_actions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            Prioriterade åtgärder
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

      {/* ── Re-run ── */}
      <div className="pt-2 border-t border-border space-y-2">
        <Textarea rows={3} value={jobText} onChange={(e) => setJobText(e.target.value)}
          placeholder="Klistra in jobbannons..." className="text-xs" />
        <Button onClick={runCheck} disabled={loading} variant="outline" size="sm" className="w-full gap-1.5">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          {loading ? "Analyserar..." : "Kör om ATS-kontroll"}
        </Button>
      </div>
    </div>
  );
}
