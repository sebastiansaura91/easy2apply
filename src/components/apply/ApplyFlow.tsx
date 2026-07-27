import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowRight, Target, Sparkles, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/i18n/LanguageContext";
import { useFlow } from "@/contexts/FlowContext";
import { RolePicker, CUSTOM_ROLE } from "@/components/role/RolePicker";
import { roleLabel, getRoleAdvice } from "@/lib/role-advice";
import { getResumeMeta } from "@/lib/resume-grouping";
import { CVMeta } from "@/types/cv";
import { AtsCheckResult } from "@/types/ats-check";

export interface ApplyTemplate {
  id: string;
  title: string;
  language: string;
  content_json?: { __meta?: CVMeta } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: ApplyTemplate[];
  userId: string | undefined;
  onCreated?: () => void;
  initialRoleId?: string;
}

type Report =
  | { kind: "job"; ats: AtsCheckResult; jobTitle?: string; company?: string }
  | { kind: "role" }
  | null;

/**
 * Guided "Apply for a new position" journey:
 * role → auto-matched template → optional job ad → report → create tailored copy → editor.
 * Reuses analyze-job-posting/ats-check (ad path) and role-advice (no-ad path). The deep
 * role-fit runs in the editor's Improve panel afterward.
 */
export function ApplyFlow({ open, onOpenChange, templates, userId, onCreated, initialRoleId }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { language } = useLanguage();
  const flow = useFlow();
  const isSv = language === "sv";

  const [step, setStep] = useState<"input" | "report">("input");
  const [roleId, setRoleId] = useState<string>(initialRoleId || "");
  const [customLabel, setCustomLabel] = useState("");
  const [jobText, setJobText] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report>(null);
  const [base, setBase] = useState<ApplyTemplate | null>(null);

  const isCustom = roleId === CUSTOM_ROLE;
  const label = isCustom ? (customLabel.trim() || (isSv ? "Egen roll" : "Custom role")) : roleLabel(roleId, null, language);

  const reset = () => { setStep("input"); setJobText(""); setReport(null); setBase(null); setBusy(false); };
  const close = (o: boolean) => { if (!o) reset(); onOpenChange(o); };

  // Pick the template whose role matches; else the most recent; else none (→ create first).
  const resolveBase = (): ApplyTemplate | null => {
    const matched = templates.find((t) => {
      const m = getResumeMeta(t);
      if (isCustom) return !!m.targetRoleLabel && m.targetRoleLabel.toLowerCase() === customLabel.trim().toLowerCase();
      return !!roleId && m.targetRole === roleId;
    });
    return matched ?? templates[0] ?? null;
  };

  const runReport = async () => {
    if (!roleId) { toast({ title: isSv ? "Välj en roll" : "Choose a role", variant: "destructive" }); return; }
    if (isCustom && !customLabel.trim()) { toast({ title: isSv ? "Ange rolltitel" : "Enter a role title", variant: "destructive" }); return; }

    const b = resolveBase();
    if (!b) {
      // No templates yet — go create the first one, seeded with this role intent.
      onOpenChange(false);
      navigate("/wizard/create");
      return;
    }
    setBase(b);
    setBusy(true);
    try {
      const { data: full } = await supabase.from("resumes").select("content_json").eq("id", b.id).single();
      const cv = (full?.content_json as any) || {};

      if (jobText.trim()) {
        // Ad path: parse the ad (for a clean job title) + score the match.
        let ja: any = null;
        try {
          const { data } = await supabase.functions.invoke("analyze-job-posting", { body: { job_posting_text: jobText.trim() } });
          if (!(data as any)?.error) ja = data;
        } catch { /* non-fatal: still show the ATS match */ }
        const { data, error } = await supabase.functions.invoke("ats-check", {
          body: { resume_content_json: cv, job_posting_text: jobText.trim(), locale: b.language || language },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        setReport({ kind: "job", ats: data as AtsCheckResult, jobTitle: ja?.job_title, company: ja?.company_name });
      } else {
        // No-ad path: check against the role's normal requirements (static role advice).
        setReport({ kind: "role" });
      }
      setStep("report");
    } catch (e: any) {
      toast({ title: isSv ? "Analysen misslyckades" : "Analysis failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const createAndOpen = async () => {
    if (!userId || !base) return;
    setBusy(true);
    try {
      const { data: full } = await supabase.from("resumes").select("content_json").eq("id", base.id).single();
      const cv = (full?.content_json as any) || {};
      const id = uuidv4();
      const jobTitle = report?.kind === "job" ? report.jobTitle : undefined;
      const title = jobTitle ? `${label} — ${jobTitle}` : `${label} — ${isSv ? "ansökan" : "application"}`;
      const content = {
        ...cv,
        __meta: {
          ...(cv.__meta || {}),
          isTemplate: false,
          isBaseProfile: false,
          createdFrom: base.id,
          targetRole: isCustom ? undefined : roleId,
          targetRoleLabel: isCustom ? customLabel.trim() : undefined,
          tailoredForJob: report?.kind === "job" ? report.jobTitle : undefined,
          tailoredForCompany: report?.kind === "job" ? report.company : undefined,
          jobPostingText: jobText.trim() || undefined,
          lastAtsScore: report?.kind === "job"
            ? { score: Math.round(report.ats.overall_score), grade: report.ats.grade, at: new Date().toISOString(), subscores: report.ats.subscores }
            : undefined,
        },
      };
      const { error } = await supabase.from("resumes").insert({
        id, user_id: userId, title, language: base.language, template_id: "default", content_json: content,
      });
      if (error) throw error;
      // Seed the editor so the Improve panel opens pre-run against this ad/role.
      flow.setResumeId(id);
      flow.setJobPostingText(jobText.trim());
      flow.setAnalysis(report?.kind === "job" ? report.ats : null);
      onCreated?.();
      onOpenChange(false);
      reset();
      navigate(`/editor/${id}`);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setBusy(false);
    }
  };

  const advice = getRoleAdvice(roleId);
  const weakBullets = report?.kind === "job" ? report.ats.bullet_feedback.filter((b) => b.score < 6).length : 0;
  const missing = report?.kind === "job" ? report.ats.job_language_match.missing_phrases.slice(0, 8) : [];
  const scoreColor = (s: number) => (s >= 75 ? "text-green-600" : s >= 50 ? "text-amber-600" : "text-destructive");

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        {step === "input" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                {isSv ? "Sök en ny tjänst" : "Apply for a new position"}
              </DialogTitle>
              <DialogDescription>
                {isSv ? "Välj roll. Klistra in annonsen om du har en — annars kollar vi mot rollens normala krav." : "Pick the role. Paste the ad if you have one — otherwise we check against the role's normal requirements."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-1">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{isSv ? "Vilken roll söker du?" : "What role are you applying for?"}</label>
                <RolePicker value={roleId} onChange={setRoleId} selectedLabel={roleId ? label : ""} onCustomLabel={(l) => setCustomLabel(l)} />
                {isCustom && (
                  <Input autoFocus value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder={isSv ? "t.ex. Commercial Excellence" : "e.g. Commercial Excellence"} />
                )}
                <p className="text-xs text-muted-foreground">
                  {isSv ? "Välj en bred roll — den exakta titeln tas från annonsen, så en mall räcker för många jobb." : "Pick a broad role — the exact title comes from the ad, so one template covers many jobs."}
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{isSv ? "Jobbannons" : "Job ad"} <span className="font-normal text-muted-foreground">({isSv ? "valfritt" : "optional"})</span></label>
                <Textarea value={jobText} onChange={(e) => setJobText(e.target.value)} placeholder={isSv ? "Klistra in annonsen…" : "Paste the ad…"} className="min-h-[110px] text-sm" />
              </div>
            </div>

            <DialogFooter>
              <Button size="lg" className="w-full text-base" onClick={runReport} disabled={busy || !roleId}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                {busy ? (isSv ? "Analyserar…" : "Analyzing…") : (isSv ? "Fortsätt" : "Continue")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                {label}
              </DialogTitle>
              <DialogDescription>
                {report?.kind === "job"
                  ? (isSv ? "Så väl matchar din mall den här annonsen." : "How well your template matches this ad.")
                  : (isSv ? "Vad den här rollen normalt kräver." : "What this role normally expects.")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-1">
              {base && (
                <div className="rounded-md border border-border bg-accent/40 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{isSv ? "Vi utgår från din mall: " : "Working from your template: "}</span>
                  <span className="font-medium">{base.title}</span>
                </div>
              )}
              {report?.kind === "job" ? (
                <>
                  <div className="flex items-baseline gap-3">
                    <span className={`font-serif text-4xl font-semibold ${scoreColor(report.ats.overall_score)}`}>{Math.round(report.ats.overall_score)}</span>
                    <span className="text-sm text-muted-foreground">/ 100 {isSv ? "matchning" : "match"} · {isSv ? "betyg" : "grade"} {report.ats.grade}</span>
                  </div>
                  {missing.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{isSv ? "Saknade nyckelord" : "Missing keywords"}</p>
                      <div className="flex flex-wrap gap-1.5">{missing.map((p) => <Badge key={p} variant="destructive" className="text-[10px]">{p}</Badge>)}</div>
                    </div>
                  )}
                  {weakBullets > 0 && (
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5 text-warning" />{weakBullets} {isSv ? "punkter att skärpa" : "bullets to sharpen"}</p>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  {advice ? (
                    <>
                      <p className="text-sm">{advice.focus[isSv ? "sv" : "en"]}</p>
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{isSv ? "Lyft fram" : "Lead with"}</p>
                        <div className="flex flex-wrap gap-1.5">{advice.emphasize[isSv ? "sv" : "en"].slice(0, 6).map((e) => <Badge key={e} variant="secondary" className="text-[10px]">{e}</Badge>)}</div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">{isSv ? "Vi öppnar editorn med rollfit redo så du kan vinkla CV:t." : "We'll open the editor with role fit ready so you can angle the CV."}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{isSv ? "Djupare rollfit körs i editorn." : "Deeper role fit runs in the editor."}</p>
                </div>
              )}
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button size="lg" className="w-full text-base" onClick={createAndOpen} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                {isSv ? "Skapa & öppna i editorn" : "Create & open in editor"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setStep("input")} disabled={busy}>{isSv ? "Tillbaka" : "Back"}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
