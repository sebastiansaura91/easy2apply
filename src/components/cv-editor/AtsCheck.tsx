import { useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Target,
  FileText,
  Eye,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertOctagon,
  Zap,
  Search,
  ArrowRight,
  BarChart3,
  XCircle,
} from "lucide-react";
import { CVContent } from "@/types/cv";
import { AtsCheckResult, AtsProfile, AtsBlocker, AtsIssue, KeywordItem } from "@/types/ats-check";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

// Legacy quick-check (keep for backward compat)
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

function gradeBackground(grade: string) {
  switch (grade) {
    case "A": return "bg-green-500/10 border-green-500/30";
    case "B": return "bg-blue-500/10 border-blue-500/30";
    case "C": return "bg-yellow-500/10 border-yellow-500/30";
    case "D": return "bg-orange-500/10 border-orange-500/30";
    case "F": return "bg-destructive/10 border-destructive/30";
    default: return "bg-muted border-border";
  }
}

function severityColor(severity: string) {
  switch (severity) {
    case "high": return "text-destructive";
    case "medium": return "text-yellow-600 dark:text-yellow-400";
    case "low": return "text-muted-foreground";
    default: return "text-muted-foreground";
  }
}

function coverageBadge(coverage: string) {
  switch (coverage) {
    case "strong": return <Badge variant="default" className="text-[10px] h-5 bg-green-600">Stark</Badge>;
    case "ok": return <Badge variant="secondary" className="text-[10px] h-5">OK</Badge>;
    case "weak": return <Badge variant="outline" className="text-[10px] h-5 border-yellow-500 text-yellow-600">Svag</Badge>;
    case "missing": return <Badge variant="destructive" className="text-[10px] h-5">Saknas</Badge>;
    default: return null;
  }
}

function statusIcon(status: string) {
  switch (status) {
    case "ok": return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case "warn": return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
    case "fail": return <XCircle className="h-4 w-4 text-destructive" />;
    default: return null;
  }
}

function ScoreRing({ score, grade, size = "lg" }: { score: number; grade: string; size?: "sm" | "lg" }) {
  const radius = size === "lg" ? 54 : 28;
  const stroke = size === "lg" ? 8 : 5;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const dim = (radius + stroke) * 2;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={dim} height={dim} className="-rotate-90">
        <circle cx={radius + stroke} cy={radius + stroke} r={radius} fill="none"
          stroke="hsl(var(--muted))" strokeWidth={stroke} />
        <circle cx={radius + stroke} cy={radius + stroke} r={radius} fill="none"
          stroke={score >= 85 ? "hsl(142, 71%, 45%)" : score >= 70 ? "hsl(217, 91%, 60%)" : score >= 55 ? "hsl(48, 96%, 53%)" : score >= 40 ? "hsl(25, 95%, 53%)" : "hsl(var(--destructive))"}
          strokeWidth={stroke} strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" className="transition-all duration-1000" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-bold ${size === "lg" ? "text-2xl" : "text-sm"} ${gradeColor(grade)}`}>{score}</span>
        {size === "lg" && <span className={`text-xs font-semibold ${gradeColor(grade)}`}>{grade}</span>}
      </div>
    </div>
  );
}

function ProfileCard({ profile }: { profile: AtsProfile }) {
  const [open, setOpen] = useState(false);
  const profileLabels: Record<string, string> = {
    EnterpriseStrict: "Enterprise (Workday/Taleo)",
    ModernSaaS: "Modern SaaS (Greenhouse/Lever)",
    SMBBasic: "SMB Basic",
  };

  return (
    <Card className={`border ${gradeBackground(profile.grade)}`}>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ScoreRing score={profile.score} grade={profile.grade} size="sm" />
            <div>
              <p className="text-sm font-semibold">{profileLabels[profile.name] || profile.name}</p>
              <p className={`text-xs font-medium ${gradeColor(profile.grade)}`}>Betyg {profile.grade}</p>
            </div>
          </div>
          {profile.blockers.length > 0 && (
            <Badge variant="destructive" className="text-[10px] h-5 gap-1">
              <AlertOctagon className="h-3 w-3" />
              {profile.blockers.length} blockers
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2">
        {/* Subscores */}
        <div className="grid grid-cols-4 gap-1.5 text-[10px]">
          {([
            ["Parse", profile.subscores.parse, 40],
            ["Relevans", profile.subscores.relevance, 30],
            ["Evidens", profile.subscores.evidence, 20],
            ["Läsbarhet", profile.subscores.readability, 10],
          ] as [string, number, number][]).map(([label, val, max]) => (
            <div key={label} className="text-center">
              <p className="text-muted-foreground mb-0.5">{label}</p>
              <Progress value={(val / max) * 100} className="h-1.5" />
              <p className="font-medium mt-0.5">{val}/{max}</p>
            </div>
          ))}
        </div>

        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full h-7 text-xs gap-1">
              {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {profile.blockers.length + profile.issues.length} findings
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1.5 mt-1">
            {profile.blockers.map((b) => (
              <div key={b.id} className="rounded border border-destructive/30 bg-destructive/5 p-2 space-y-1">
                <div className="flex items-start gap-1.5">
                  <AlertOctagon className="h-3.5 w-3.5 text-destructive mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-destructive">{b.title}</p>
                    <p className="text-[10px] text-muted-foreground">{b.why_it_matters}</p>
                    <p className="text-[10px] italic mt-0.5">Evidence: {b.evidence}</p>
                    <p className="text-[10px] font-medium mt-1">→ {b.fix}</p>
                  </div>
                </div>
              </div>
            ))}
            {profile.issues.map((issue, i) => (
              <div key={i} className="rounded border border-border p-2 space-y-0.5">
                <div className="flex items-start gap-1.5">
                  <AlertTriangle className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${severityColor(issue.severity)}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium">{issue.title}</p>
                      <Badge variant="outline" className="text-[9px] h-4">{issue.category}</Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{issue.evidence}</p>
                    <p className="text-[10px] mt-0.5">→ {issue.recommendation}</p>
                    {issue.example_rewrite && (
                      <p className="text-[10px] italic text-primary mt-0.5">Ex: "{issue.example_rewrite}"</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

interface AtsCheckPanelProps {
  cv: CVContent;
  t: (k: any) => string;
  cvLanguage?: "sv" | "en";
  jobPostingText?: string;
}

export function AtsCheckPanel({ cv, t, cvLanguage, jobPostingText }: AtsCheckPanelProps) {
  const [result, setResult] = useState<AtsCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [jobText, setJobText] = useState(jobPostingText || "");
  const [activeTab, setActiveTab] = useState("overview");
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
      setActiveTab("overview");
    } catch (err: any) {
      toast({ title: "ATS-kontroll misslyckades", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Not yet run
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

        {/* Job posting input */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Jobbannons (valfritt)</p>
          <Textarea
            rows={4}
            value={jobText}
            onChange={(e) => setJobText(e.target.value)}
            placeholder="Klistra in jobbannons för keyword-matchning..."
            className="text-xs"
          />
        </div>

        <Button onClick={runCheck} disabled={loading} className="w-full gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {loading ? "Analyserar CV..." : "Kör Enterprise ATS-kontroll"}
        </Button>
      </div>
    );
  }

  // Results view
  const allBlockers = result.profiles.flatMap((p) => p.blockers);
  const uniqueBlockers = allBlockers.filter((b, i, arr) => arr.findIndex((x) => x.id === b.id) === i);

  return (
    <div className="space-y-4">
      {/* Overall Score */}
      <div className="flex items-center gap-4">
        <ScoreRing score={result.overall.ats_score} grade={result.overall.grade} size="lg" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Overall ATS Score</p>
          <p className="text-xs text-muted-foreground mt-0.5">{result.overall.summary}</p>
          {uniqueBlockers.length > 0 && (
            <Badge variant="destructive" className="text-[10px] h-5 gap-1 mt-1.5">
              <AlertOctagon className="h-3 w-3" />
              {uniqueBlockers.length} blockers
            </Badge>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-4 h-8">
          <TabsTrigger value="overview" className="text-[10px] gap-1 px-1"><BarChart3 className="h-3 w-3" />Profiler</TabsTrigger>
          <TabsTrigger value="keywords" className="text-[10px] gap-1 px-1"><Search className="h-3 w-3" />Keywords</TabsTrigger>
          <TabsTrigger value="health" className="text-[10px] gap-1 px-1"><FileText className="h-3 w-3" />Sektioner</TabsTrigger>
          <TabsTrigger value="actions" className="text-[10px] gap-1 px-1"><Zap className="h-3 w-3" />Åtgärder</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-3 mt-3">
          {result.profiles.map((profile) => (
            <ProfileCard key={profile.name} profile={profile} />
          ))}
        </TabsContent>

        <TabsContent value="keywords" className="space-y-3 mt-3">
          <KeywordReportView report={result.keyword_report} />
        </TabsContent>

        <TabsContent value="health" className="space-y-2 mt-3">
          {result.section_health.map((sh) => (
            <div key={sh.section} className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border">
              {statusIcon(sh.status)}
              <div className="min-w-0">
                <p className="text-xs font-medium">{sh.section}</p>
                <p className="text-[10px] text-muted-foreground">{sh.notes}</p>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="actions" className="space-y-2 mt-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Top {result.next_actions.length} prioriterade åtgärder
          </p>
          {result.next_actions.map((action, i) => (
            <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border">
              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-[10px] font-bold text-primary">{i + 1}</span>
              </div>
              <p className="text-xs">{action}</p>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      {/* Re-run */}
      <div className="pt-2 border-t border-border space-y-2">
        <Textarea
          rows={3}
          value={jobText}
          onChange={(e) => setJobText(e.target.value)}
          placeholder="Klistra in jobbannons..."
          className="text-xs"
        />
        <Button onClick={runCheck} disabled={loading} variant="outline" size="sm" className="w-full gap-1.5">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          {loading ? "Analyserar..." : "Kör om ATS-kontroll"}
        </Button>
      </div>
    </div>
  );
}

function KeywordReportView({ report }: { report: AtsCheckResult["keyword_report"] }) {
  const [openSection, setOpenSection] = useState<string | null>("must_have");

  if (report.mode === "none") {
    return <p className="text-xs text-muted-foreground">Ingen keyword-analys tillgänglig.</p>;
  }

  const sections: { key: string; label: string; items: KeywordItem[] }[] = [
    { key: "must_have", label: "Must-have", items: report.taxonomy.must_have },
    { key: "nice_to_have", label: "Nice-to-have", items: report.taxonomy.nice_to_have },
    { key: "domain_terms", label: "Domäntermer", items: report.taxonomy.domain_terms },
    { key: "seniority_cues", label: "Senioritetssignaler", items: report.taxonomy.seniority_cues },
  ];

  return (
    <div className="space-y-3">
      <Badge variant={report.mode === "job_posting" ? "default" : "secondary"} className="text-[10px]">
        {report.mode === "job_posting" ? "Matchad mot jobbannons" : "Baseline-analys"}
      </Badge>

      {/* Missing keywords */}
      {report.missing_must_have.length > 0 && (
        <div className="rounded border border-destructive/30 bg-destructive/5 p-2.5 space-y-1">
          <p className="text-[10px] font-semibold text-destructive flex items-center gap-1">
            <AlertOctagon className="h-3 w-3" /> Saknade must-have keywords
          </p>
          <div className="flex flex-wrap gap-1">
            {report.missing_must_have.map((term) => (
              <Badge key={term} variant="destructive" className="text-[10px] h-5">{term}</Badge>
            ))}
          </div>
        </div>
      )}

      {report.overused_terms.length > 0 && (
        <div className="rounded border border-yellow-500/30 bg-yellow-500/5 p-2.5 space-y-1">
          <p className="text-[10px] font-semibold text-yellow-600 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Överanvända termer
          </p>
          <div className="flex flex-wrap gap-1">
            {report.overused_terms.map((term) => (
              <Badge key={term} variant="outline" className="text-[10px] h-5 border-yellow-500">{term}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Taxonomy sections */}
      {sections.map(({ key, label, items }) => items.length > 0 && (
        <Collapsible key={key} open={openSection === key} onOpenChange={(o) => setOpenSection(o ? key : null)}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between h-7 text-xs">
              <span>{label} ({items.length})</span>
              {openSection === key ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1 mt-1">
            {items.map((item) => (
              <div key={item.term} className="flex items-center gap-2 px-2 py-1 rounded border border-border">
                <span className="text-xs font-medium flex-1">{item.term}</span>
                <Badge variant="outline" className="text-[9px] h-4">D{item.depth}</Badge>
                {coverageBadge(item.coverage)}
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      ))}

      {/* Suggested insertions */}
      {report.suggested_insertion_points.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Föreslagna insättningspunkter</p>
          {report.suggested_insertion_points.map((sp, i) => (
            <div key={i} className="rounded border border-primary/20 bg-primary/5 p-2 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <Target className="h-3 w-3 text-primary flex-shrink-0" />
                <span className="text-[10px] font-medium">{sp.term}</span>
                <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">{sp.where}</span>
              </div>
              <p className="text-[10px] italic pl-4">{sp.safe_phrase}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
