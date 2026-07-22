import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, Check, ArrowUp, Minus, ArrowDown, AlertTriangle, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useFlow } from "@/contexts/FlowContext";
import { CVContent } from "@/types/cv";
import { RoleFitResult, EmphasisAction } from "@/types/role-fit";
import { getRoleAdvice, roleLabel } from "@/lib/role-advice";

interface Props {
  cv: CVContent;
  cvLanguage: "sv" | "en";
  /** Apply a truthful reframe: replace `original` bullet text with `suggested` in that experience. */
  onApplyReframe: (experienceId: string, original: string, suggested: string) => void;
}

const actionMeta: Record<EmphasisAction, { icon: JSX.Element; cls: string }> = {
  lead: { icon: <ArrowUp className="h-3 w-3" />, cls: "text-green-600 border-green-200" },
  keep: { icon: <Minus className="h-3 w-3" />, cls: "text-muted-foreground" },
  mute: { icon: <ArrowDown className="h-3 w-3" />, cls: "text-amber-600 border-amber-200" },
};

/**
 * Runs the role-fit analysis for the CV's target role (optionally sharpened by a pasted
 * job posting) and renders suggestion-only output. The user applies each reframe manually.
 */
export function RoleFitPanel({ cv, cvLanguage, onApplyReframe }: Props) {
  const isSv = cvLanguage === "sv";
  const { toast } = useToast();
  const flow = useFlow();
  // Prefill the posting if one was pasted when the application was created ("Rikta CV").
  const [jobText, setJobText] = useState(flow.jobPostingText || cv.__meta?.jobPostingText || "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RoleFitResult | null>(null);
  const [jobAnalysis, setJobAnalysis] = useState<any | null>(null);
  const [applied, setApplied] = useState<Set<number>>(new Set());

  const roleId = cv.__meta?.targetRole;
  const label = roleLabel(roleId, cv.__meta?.targetRoleLabel, cvLanguage);

  const run = async () => {
    setLoading(true);
    setResult(null);
    setJobAnalysis(null);
    setApplied(new Set());
    const advice = getRoleAdvice(roleId);
    const role = advice
      ? {
          label: advice.label[cvLanguage],
          focus: advice.focus[cvLanguage],
          emphasize: advice.emphasize[cvLanguage],
          deemphasize: advice.deemphasize[cvLanguage],
          keywords: advice.keywords,
          metrics: advice.metrics[cvLanguage],
        }
      : { label };
    try {
      // Step 1 (only if a posting was pasted): break it down with the existing analyzer so
      // the user SEES the job's requirements and the fit is driven by structured data.
      let ja: any = null;
      if (jobText.trim()) {
        const { data: jaData, error: jaErr } = await supabase.functions.invoke("analyze-job-posting", {
          body: { job_posting_text: jobText.trim() },
        });
        if (jaErr) throw jaErr;
        if ((jaData as any)?.error) throw new Error((jaData as any).error);
        ja = jaData;
        setJobAnalysis(ja);
      }

      // Step 2: role-fit, driven by the structured posting breakdown when present.
      const { data, error } = await supabase.functions.invoke("analyze-role-fit", {
        body: {
          resume_content_json: cv,
          role,
          job_posting_text: jobText.trim() || undefined,
          job_analysis: ja || undefined,
          system_language: cvLanguage,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data as RoleFitResult);
    } catch (err: any) {
      toast({ title: isSv ? "Analysen misslyckades" : "Analysis failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = (s: number) => (s >= 75 ? "text-green-600" : s >= 50 ? "text-amber-600" : "text-red-600");

  return (
    <div className="p-4 space-y-4">
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">
          {isSv ? "Frivilligt: klistra in en specifik jobbannons för att skärpa analysen." : "Optional: paste a specific job posting to sharpen the analysis."}
        </p>
        <Textarea
          value={jobText}
          onChange={(e) => setJobText(e.target.value)}
          placeholder={isSv ? "Klistra in jobbannonsen här (valfritt)…" : "Paste the job posting here (optional)…"}
          className="min-h-[80px] text-sm"
        />
      </div>
      <Button onClick={run} disabled={loading} className="w-full">
        {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
        {isSv ? `Analysera fit mot ${label}` : `Analyse fit for ${label}`}
      </Button>

      {jobAnalysis && (
        <div className="rounded-lg border border-border p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {isSv ? "Vad jobbet kräver" : "What the job requires"}
          </p>
          <p className="text-sm font-medium">
            {jobAnalysis.job_title}{jobAnalysis.company_name ? ` · ${jobAnalysis.company_name}` : ""}
            {jobAnalysis.seniority_level ? <span className="text-muted-foreground font-normal"> — {jobAnalysis.seniority_level}</span> : null}
          </p>
          {jobAnalysis.key_requirements?.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground">{isSv ? "Måste-krav" : "Must-have"}</p>
              <ul className="text-sm text-muted-foreground">
                {jobAnalysis.key_requirements.slice(0, 8).map((r: string, i: number) => <li key={i}>• {r}</li>)}
              </ul>
            </div>
          )}
          {jobAnalysis.key_phrases?.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {jobAnalysis.key_phrases.slice(0, 8).map((k: string, i: number) => (
                <Badge key={i} variant="outline" className="text-[11px] font-normal">{k}</Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="space-y-5 pt-1">
          {/* Score + summary */}
          <div className="flex items-start gap-3 rounded-lg border border-border p-3">
            <div className={`text-3xl font-bold ${scoreColor(result.fit_score)}`}>{result.fit_score}</div>
            <div className="text-sm">
              <p className="font-medium">{isSv ? "Fit-score" : "Fit score"}</p>
              <p className="text-muted-foreground leading-snug">{result.summary}</p>
            </div>
          </div>

          {/* Keyword coverage */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              {isSv ? "Nyckelordstäckning" : "Keyword coverage"}
            </p>
            <div className="flex flex-wrap gap-1">
              {result.keyword_coverage.covered.map((k, i) => (
                <Badge key={`c${i}`} variant="outline" className="text-[11px] text-green-600 border-green-200 gap-0.5">
                  <Check className="h-2.5 w-2.5" />{k}
                </Badge>
              ))}
              {result.keyword_coverage.missing.map((k, i) => (
                <Badge key={`m${i}`} variant="outline" className="text-[11px] text-amber-600 border-amber-200 gap-0.5">
                  <AlertTriangle className="h-2.5 w-2.5" />{k}
                </Badge>
              ))}
            </div>
          </div>

          {/* Emphasis */}
          {result.experience_emphasis.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                {isSv ? "Betoning per erfarenhet" : "Emphasis per experience"}
              </p>
              <div className="space-y-1.5">
                {result.experience_emphasis.map((e, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <Badge variant="outline" className={`text-[10px] gap-0.5 flex-shrink-0 ${actionMeta[e.action].cls}`}>
                      {actionMeta[e.action].icon}
                      {isSv
                        ? { lead: "Lyft", keep: "Behåll", mute: "Tona ner" }[e.action]
                        : { lead: "Lead", keep: "Keep", mute: "Mute" }[e.action]}
                    </Badge>
                    <span><span className="font-medium">{e.title}</span> — <span className="text-muted-foreground">{e.reason}</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reframes */}
          {result.reframes.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                {isSv ? "Förslag på omformuleringar" : "Suggested reframes"}
              </p>
              <div className="space-y-2">
                {result.reframes.map((r, i) => (
                  <Card key={i}>
                    <CardContent className="p-3 space-y-2">
                      <p className="text-xs text-muted-foreground line-through">{r.original}</p>
                      <p className="text-sm">{r.suggested}</p>
                      <p className="text-[11px] text-muted-foreground italic flex items-start gap-1">
                        <Target className="h-3 w-3 mt-0.5 flex-shrink-0" />{r.reason}
                      </p>
                      <Button
                        size="sm"
                        variant={applied.has(i) ? "secondary" : "outline"}
                        className="h-9 text-xs"
                        disabled={applied.has(i)}
                        onClick={() => {
                          onApplyReframe(r.experience_id, r.original, r.suggested);
                          setApplied((prev) => new Set(prev).add(i));
                          toast({ title: isSv ? "Använd" : "Applied" });
                        }}
                      >
                        <Check className="h-3 w-3 mr-1" />
                        {applied.has(i) ? (isSv ? "Använd" : "Applied") : (isSv ? "Använd" : "Apply")}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Gaps */}
          {result.gaps.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                {isSv ? "Ärliga gap" : "Honest gaps"}
              </p>
              <div className="space-y-2">
                {result.gaps.map((g, i) => (
                  <div key={i} className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 p-2.5 text-sm">
                    <p className="font-medium text-amber-700 dark:text-amber-400">{g.requirement}</p>
                    <p className="text-muted-foreground text-xs mt-0.5">{g.why}</p>
                    <p className="text-xs mt-1">→ {g.suggestion}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
