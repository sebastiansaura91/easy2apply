import { useState, useEffect } from "react";
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
import { cvScanSignature } from "@/lib/cv-signature";
import { deriveRoleFromTitle } from "@/lib/role-from-title";
import { REGISTRY_ROW_TITLE, buildStrengthLookup, buildEvidenceLookup } from "@/lib/competence-registry";
import { InsightsPanel } from "@/components/editor/InsightsPanel";
import { exportToPdf } from "@/lib/export-pdf";
import { runParseBackCheck } from "@/lib/parse-check";
import { cvHeadings } from "@/i18n/cvHeadings";
import { MatchScorecard } from "@/components/editor/MatchScorecard";
import { computeMatchScore } from "@/lib/match-score";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  /** Full-page mode: rendered as the /apply page instead of a modal dialog. */
  asPage?: boolean;
}

// Page-mode stand-ins for the dialog chrome (Radix Dialog components crash outside a Dialog root).
const PageHead = ({ children }: { children: React.ReactNode }) => <div className="mb-3 space-y-1.5">{children}</div>;
const PageTitle = ({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) => <h1 className={`text-2xl font-semibold tracking-tight ${className || ""}`} {...p} />;
const PageDesc = (p: React.HTMLAttributes<HTMLParagraphElement>) => <p className="text-sm text-muted-foreground" {...p} />;
const PageFoot = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={`mt-5 flex flex-col gap-2 ${className || ""}`} {...p} />;

type Report =
  | { kind: "job"; ats: AtsCheckResult; jobTitle?: string; company?: string; ja?: import("@/contexts/FlowContext").JobAnalysis }
  | { kind: "role" }
  | null;

/**
 * Guided "Apply for a new position" journey:
 * role → auto-matched template → optional job ad → report → create tailored copy → editor.
 * Reuses analyze-job-posting/ats-check (ad path) and role-advice (no-ad path). The deep
 * role-fit runs in the editor's Improve panel afterward.
 */
export function ApplyFlow({ open, onOpenChange, templates, userId, onCreated, initialRoleId, asPage }: Props) {
  const Head = asPage ? PageHead : DialogHeader;
  const Title = asPage ? PageTitle : DialogTitle;
  const Desc = asPage ? PageDesc : DialogDescription;
  const Foot = asPage ? PageFoot : DialogFooter;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { language } = useLanguage();
  const flow = useFlow();
  const isSv = language === "sv";

  const [step, setStep] = useState<"input" | "report" | "improve" | "done">("input");
  const [roleId, setRoleId] = useState<string>(initialRoleId || "");
  const [customLabel, setCustomLabel] = useState("");
  const [jobText, setJobText] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report>(null);
  const [base, setBase] = useState<ApplyTemplate | null>(null);
  // Company name for tracking — prefilled from the ad when detectable, always editable.
  const [company, setCompany] = useState("");
  // Secondary path: no ad → target a role directly.
  const [roleMode, setRoleMode] = useState(false);
  // The ad's themes matched against the WHOLE profile (all CVs + saved answers) —
  // coverage you have somewhere, even if the chosen template doesn't show it.
  const [mapCover, setMapCover] = useState<{ theme: string; status: "covered" | "partial" | "gap" }[] | null>(null);
  // Page mode carries the created CV through steps 3–4 (improve + done) in the flow.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [createdCv, setCreatedCv] = useState<any | null>(null);
  const [profileLookup, setProfileLookup] = useState<((n: string) => { keyword: string; answer: string }[]) | null>(null);

  const isCustom = roleId === CUSTOM_ROLE;
  const label = isCustom ? (customLabel.trim() || (isSv ? "Egen roll" : "Custom role")) : roleLabel(roleId, null, language);

  const reset = () => { setStep("input"); setJobText(""); setReport(null); setBase(null); setBusy(false); setCompany(""); setRoleMode(false); setMapCover(null); setCreatedId(null); setCreatedCv(null); };
  const close = (o: boolean) => { if (!o) reset(); onOpenChange(o); };

  // Pick the template whose role matches; else the most recent; else none (→ create first).
  const resolveBase = (rid: string, custom: string): ApplyTemplate | null => {
    const matched = templates.find((t) => {
      const m = getResumeMeta(t);
      if (rid === CUSTOM_ROLE) return !!m.targetRoleLabel && m.targetRoleLabel.toLowerCase() === custom.trim().toLowerCase();
      return !!rid && m.targetRole === rid;
    });
    return matched ?? templates[0] ?? null;
  };

  // Ad-first: paste the ad and everything else (role, template, company) is derived.
  const runReport = async (baseOverride?: ApplyTemplate) => {
    const hasAd = jobText.trim().length > 0;
    if (!hasAd) {
      // Role path (secondary): a role must be chosen.
      if (!roleId) { toast({ title: isSv ? "Välj en roll" : "Choose a role", variant: "destructive" }); return; }
      if (isCustom && !customLabel.trim()) { toast({ title: isSv ? "Ange rolltitel" : "Enter a role title", variant: "destructive" }); return; }
      const b = baseOverride ?? resolveBase(roleId, customLabel);
      if (!b) { onOpenChange(false); navigate("/wizard/create"); return; }
      setBase(b);
      setReport({ kind: "role" });
      setStep("report");
      return;
    }

    setBusy(true);
    try {
      // 1) Parse the ad → job title, company, demand profile. The canonical registry
      // rides along so every theme comes back tagged with a stable competence id.
      let ja: any = null;
      try {
        let registry: any = undefined;
        try {
          const { data: regRow } = await supabase.from("resumes").select("content_json").eq("title", REGISTRY_ROW_TITLE).maybeSingle();
          registry = (regRow?.content_json as any)?.__meta?.competenceRegistry || undefined;
        } catch { /* no registry yet — themes simply come back untagged */ }
        const { data } = await supabase.functions.invoke("analyze-job-posting", { body: { job_posting_text: jobText.trim(), registry } });
        if (!(data as any)?.error) ja = data;
      } catch { /* non-fatal: still show the ATS match */ }

      // 1b) Match the demand against the whole profile, before any CV exists.
      if (ja?.competence_themes?.length) {
        try {
          const { data: all } = await supabase.from("resumes").select("title, content_json");
          const rows = (all || []).map((r: any) => ({ title: r.title, meta: (r.content_json?.__meta || {}) }));
          const reg = rows.find((r: any) => r.meta.isRegistryRow)?.meta.competenceRegistry || null;
          const lookup = buildStrengthLookup(rows as any, reg);
          // Same fetch feeds the cross-CV evidence lookup for the improve step.
          setProfileLookup(() => buildEvidenceLookup(rows as any, reg));
          setMapCover(ja.competence_themes.map((t: any) => {
            const s = lookup(t.theme, t.canonical_id);
            const status = (s.best ?? 0) >= 4 || s.evidence > 0 ? "covered" as const : (s.best ?? 0) >= 2 ? "partial" as const : "gap" as const;
            return { theme: t.theme, status };
          }));
        } catch { setMapCover(null); }
      } else {
        setMapCover(null);
      }

      // 2) Derive the role bucket from the ad title (user can still change it in the report).
      let rid = roleId;
      let custom = customLabel;
      if (!rid) {
        const derived = deriveRoleFromTitle(ja?.job_title);
        if (derived) { rid = derived.roleId; custom = derived.customLabel ?? ""; }
        setRoleId(rid || "");
        setCustomLabel(custom);
      }

      // 3) Auto-pick the template for that role.
      const b = baseOverride ?? resolveBase(rid, custom);
      if (!b) { onOpenChange(false); navigate("/wizard/create"); return; }
      setBase(b);

      // 4) Score the match.
      const { data: full } = await supabase.from("resumes").select("content_json").eq("id", b.id).single();
      const cv = (full?.content_json as any) || {};
      const { data, error } = await supabase.functions.invoke("ats-check", {
        body: {
          resume_content_json: cv,
          job_posting_text: jobText.trim(),
          locale: b.language || language,
          demand_profile: ja ? { competence_themes: ja.competence_themes, knockout_requirements: ja.knockout_requirements } : undefined,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setReport({ kind: "job", ats: data as AtsCheckResult, jobTitle: ja?.job_title, company: ja?.company_name, ja: ja || undefined });
      const detected = ja?.company_name && !/^(unknown|okänt)$/i.test(ja.company_name) ? ja.company_name : "";
      setCompany(detected);
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
          tailoredForCompany: company.trim() || undefined,
          jobPostingText: jobText.trim() || undefined,
          lastAtsScore: report?.kind === "job"
            ? { score: Math.round(report.ats.overall_score), grade: report.ats.grade, at: new Date().toISOString(), subscores: report.ats.subscores }
            : undefined,
          // Cache hash too, so the editor reuses this exact analysis instead of re-scanning.
          lastAtsResult: report?.kind === "job"
            ? { hash: cvScanSignature(cv, jobText.trim()), at: new Date().toISOString(), result: report.ats }
            : undefined,
          // Single source of truth: the editor's scans anchor to THIS demand profile.
          demandProfile: report?.kind === "job" && report.ja
            ? { competence_themes: report.ja.competence_themes, knockout_requirements: report.ja.knockout_requirements }
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
      if (asPage) {
        // The journey continues in the flow: improve → done → PDF. Editor is opt-in.
        setCreatedId(id);
        setCreatedCv(content);
        setStep("improve");
      } else {
        onOpenChange(false);
        reset();
        navigate(`/editor/${id}`);
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setBusy(false);
    }
  };

  const advice = getRoleAdvice(roleId);
  const reportThemes = report?.kind === "job" ? (report.ats.job_language_match?.competence_themes ?? []) : [];
  const gapCount = reportThemes.filter(t => Math.round(t.rating ?? (t.evidence === "strong" ? 4 : t.evidence === "missing" ? 1 : 3)) < 4).length;

  // ── Improve-in-flow helpers (page mode): the created CV lives here through steps 3–4. ──
  const cvLang: "sv" | "en" = base?.language === "en" ? "en" : "sv";
  const mutateCreated = (fn: (cv: any) => any) => setCreatedCv((prev: any) => (prev ? fn(prev) : prev));
  // Persist every change; updates are sparse (one per accepted card), no debounce needed.
  useEffect(() => {
    if (createdId && createdCv && (step === "improve" || step === "done")) {
      supabase.from("resumes").update({ content_json: createdCv }).eq("id", createdId).then(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createdCv]);

  const applyReframeCreated = (experienceId: string, original: string, suggested: string): boolean => {
    const cv = createdCv;
    if (!cv) return false;
    const norm = (s: string) => s.trim().toLowerCase();
    let changed = false;
    const replaceIn = (bullets: string[]) => bullets.map(b => (!changed && norm(b) === norm(original) ? (changed = true, suggested) : b));
    let next = { ...cv, experience: cv.experience.map((e: any) => (e.id === experienceId ? { ...e, bullets: replaceIn(e.bullets || []) } : e)) };
    if (!changed) next = { ...cv, experience: cv.experience.map((e: any) => ({ ...e, bullets: replaceIn(e.bullets || []) })) };
    if (changed) setCreatedCv(next);
    return changed;
  };

  const downloadCreated = async () => {
    if (!createdCv) return;
    const tCv = (k: string) => cvHeadings[cvLang]?.[k] ?? k;
    const enabled = [...(createdCv.sections || [])].filter((s: any) => s.enabled).sort((a: any, b: any) => a.order - b.order);
    const name = (createdCv.contact?.name || "cv").replace(/[^\wåäöÅÄÖ -]/g, "").trim() || "cv";
    // Parse-back guard: nothing leaves the flow that a real parser can't read.
    try {
      const checks = await runParseBackCheck(createdCv, enabled, tCv, createdCv.__meta?.templateStyle, createdCv.__meta?.templateAccent, cvLang);
      const misses = checks.filter(c => !c.ok);
      if (misses.length) {
        toast({
          title: isSv ? `${misses.length} fält klarade inte parsningen` : `${misses.length} fields failed parsing`,
          description: isSv ? "Öppna i editorn och kör Testa parsning för detaljer. PDF:en laddas ner ändå." : "Open in the editor and run Test parsing for details. The PDF downloads anyway.",
          variant: "destructive",
        });
      }
    } catch { /* the guard never blocks a download when the checker itself fails */ }
    exportToPdf(createdCv, enabled, tCv, `${name}.pdf`, createdCv.__meta?.templateStyle, createdCv.__meta?.templateAccent, cvLang)
      .catch(() => toast({ title: "PDF export failed", variant: "destructive" }));
  };

  const STEPS = isSv ? ["Annons", "Rapport", "Förbättra", "Klart"] : ["Ad", "Report", "Improve", "Done"];
  const stepIdx = step === "input" ? 0 : step === "report" ? 1 : step === "improve" ? 2 : 3;

  const body = (
    <>
        {/* Visible sequence with numerator and denominator (Baymard) — page mode only. */}
        {asPage && (
          <div className="mb-8">
            <p className="text-xs text-muted-foreground tabular-nums">{isSv ? "Steg" : "Step"} {stepIdx + 1} {isSv ? "av" : "of"} 4</p>
            <div className="mt-2 flex items-center gap-2">
              {STEPS.map((s, i) => (
                <div key={s} className="flex flex-1 flex-col gap-1.5">
                  <div className={`h-1 rounded-full ${i <= stepIdx ? "bg-primary" : "bg-muted"}`} />
                  <span className={`text-[11px] ${i === stepIdx ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{s}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {step === "input" ? (
          <>
            <Head>
              <Title className="flex items-center gap-2">
                                {isSv ? "Sök en ny tjänst" : "Apply for a new position"}
              </Title>
              <Desc>
                {isSv ? "Klistra in annonsen — vi listar ut roll, mall och företag åt dig." : "Paste the ad — we work out the role, template and company for you."}
              </Desc>
            </Head>

            <div className="space-y-3 py-1">
              {!roleMode ? (
                <>
                  <Textarea
                    autoFocus
                    value={jobText}
                    onChange={(e) => setJobText(e.target.value)}
                    placeholder={isSv ? "Klistra in jobbannonsen här…" : "Paste the job ad here…"}
                    className="min-h-[180px] text-sm"
                  />
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => setRoleMode(true)}
                  >
                    {isSv ? "Ingen annons? Rikta mot en roll →" : "No ad? Target a role →"}
                  </button>
                </>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{isSv ? "Vilken roll söker du?" : "What role are you applying for?"}</label>
                  <RolePicker value={roleId} onChange={setRoleId} selectedLabel={roleId ? label : ""} onCustomLabel={(l) => setCustomLabel(l)} />
                  {isCustom && (
                    <Input autoFocus value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder={isSv ? "t.ex. Commercial Excellence" : "e.g. Commercial Excellence"} />
                  )}
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => setRoleMode(false)}
                  >
                    {isSv ? "← Har en annons ändå" : "← I have an ad after all"}
                  </button>
                </div>
              )}
            </div>

            <Foot>
              <Button size="lg" className="w-full text-base" onClick={() => runReport()} disabled={busy || (roleMode ? !roleId : !jobText.trim())}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                {busy ? (isSv ? "Analyserar…" : "Analyzing…") : roleMode ? (isSv ? "Fortsätt" : "Continue") : (isSv ? "Analysera matchning" : "Analyze match")}
              </Button>
            </Foot>
          </>
        ) : step === "report" ? (
          <>
            <Head>
              <Title className="flex items-center gap-2">
                                {label}
              </Title>
              <Desc>
                {report?.kind === "job"
                  ? (isSv ? "Så väl matchar din mall den här annonsen." : "How well your template matches this ad.")
                  : (isSv ? "Vad den här rollen normalt kräver." : "What this role normally expects.")}
              </Desc>
            </Head>

            <div className="space-y-4 py-1">
              {/* Everything derived — shown as editable fields, never asked upfront. */}
              <div className="grid gap-2">
                {report?.kind === "job" && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">{isSv ? "Roll (härledd från annonsen)" : "Role (derived from the ad)"}</label>
                    <RolePicker value={roleId} onChange={setRoleId} selectedLabel={roleId ? label : ""} onCustomLabel={(l) => setCustomLabel(l)} />
                  </div>
                )}
                {templates.length > 1 && base && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">{isSv ? "Mall" : "Template"}</label>
                    <Select
                      value={base.id}
                      onValueChange={(id) => {
                        const b = templates.find(t => t.id === id);
                        if (b && b.id !== base.id) runReport(b);
                      }}
                    >
                      <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {templates.length <= 1 && base && (
                  <p className="text-xs text-muted-foreground">{isSv ? "Mall: " : "Template: "}<span className="font-medium text-foreground">{base.title}</span></p>
                )}
              </div>

              {busy && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{isSv ? "Analyserar om mot vald mall…" : "Re-analyzing against the selected template…"}</p>
              )}

              {report?.kind === "job" ? (
                <MatchScorecard
                  themes={reportThemes}
                  knockouts={report.ja?.knockout_requirements}
                  fallbackScore={report.ats.overall_score}
                  fallbackGrade={report.ats.grade}
                  isSv={isSv}
                />
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

            {report?.kind === "job" && mapCover && mapCover.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-[11px] font-medium text-muted-foreground">{isSv ? "Mot hela profilen: alla CV:n och sparade svar" : "Against your whole profile: every CV and saved answer"}</p>
                <div className="flex flex-wrap gap-1.5">
                  {mapCover.map(c => (
                    <span key={c.theme} className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                      c.status === "covered" ? "bg-green-600/10 text-green-700 dark:text-green-500"
                      : c.status === "partial" ? "bg-warning/15 text-warning"
                      : "border border-dashed border-warning/60 text-warning"}`}>
                      {c.theme} · {c.status === "covered" ? (isSv ? "Täckt" : "Covered") : c.status === "partial" ? (isSv ? "Delvis" : "Partial") : "Gap"}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5 pt-1">
              <label className="text-sm font-medium">{isSv ? "Företag" : "Company"} <span className="font-normal text-muted-foreground">({isSv ? "för din överblick" : "for your tracking"})</span></label>
              <Input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder={isSv ? "t.ex. Klarna" : "e.g. Klarna"}
              />
            </div>

            <Foot className="flex-col gap-2 sm:flex-col">
              <Button size="lg" className="w-full text-base" onClick={createAndOpen} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                {gapCount > 0
                  ? (isSv ? `Skapa riktat CV — ${gapCount} gap att fixa` : `Create tailored CV — ${gapCount} gaps to fix`)
                  : (isSv ? "Skapa riktat CV" : "Create tailored CV")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setStep("input")} disabled={busy}>{isSv ? "Tillbaka" : "Back"}</Button>
            </Foot>
          </>
        ) : step === "improve" ? (
          <>
            <Head>
              <Title>{isSv ? "Förbättra" : "Improve"}</Title>
              <Desc>{isSv ? "Ett kort i taget. Hoppa över fritt, allt går att göra senare i editorn." : "One card at a time. Skip freely; everything can be done later in the editor."}</Desc>
            </Head>
            {createdCv && (
              <InsightsPanel
                cv={createdCv}
                cvLanguage={cvLang}
                t={(k: any) => String(k)}
                jobPostingText={jobText.trim() || undefined}
                initialResult={report?.kind === "job" ? report.ats : undefined}
                autoRun
                onNavigateToSection={() => {}}
                onUpdateProfile={(text) => mutateCreated(cv => ({ ...cv, profile: text }))}
                onUpdateExperienceBullets={(i, bullets) => mutateCreated(cv => ({ ...cv, experience: cv.experience.map((e: any, j: number) => (j === i ? { ...e, bullets } : e)) }))}
                onUpdateSkills={(skills) => mutateCreated(cv => ({ ...cv, skills }))}
                onUpdateMeta={(patch) => mutateCreated(cv => ({ ...cv, __meta: { ...cv.__meta, ...patch } }))}
                onPersistScore={(score, grade, subscores) => mutateCreated(cv => ({ ...cv, __meta: { ...cv.__meta, lastAtsScore: { score, grade, at: new Date().toISOString(), subscores } } }))}
                onPersistResult={(hash, result) => mutateCreated(cv => ({ ...cv, __meta: { ...cv.__meta, lastAtsResult: { hash, at: new Date().toISOString(), result } } }))}
                onPersistRoleFit={(hash, result) => mutateCreated(cv => ({ ...cv, __meta: { ...cv.__meta, lastRoleFit: { hash, at: new Date().toISOString(), result } } }))}
                onApplyReframe={applyReframeCreated}
                onDownload={downloadCreated}
                profileEvidence={profileLookup ?? undefined}
              />
            )}
            <Foot>
              <Button size="lg" className="w-full text-base" onClick={() => setStep("done")}>
                {isSv ? "Klar för nu" : "Done for now"}<ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => createdId && navigate(`/editor/${createdId}`)}>
                {isSv ? "Öppna i editorn i stället" : "Open in the editor instead"}
              </Button>
            </Foot>
          </>
        ) : (
          <>
            <Head>
              <Title>{isSv ? "Klart" : "Done"}</Title>
              <Desc>
                {(report?.kind === "job" && report.jobTitle) ? report.jobTitle : label}
                {company.trim() ? ` @ ${company.trim()}` : ""} · {isSv ? "CV:t är sparat under Ansökningar." : "The CV is saved under Applications."}
              </Desc>
            </Head>
            <p className="font-serif text-6xl tabular-nums">
              {(() => {
                // ONE score everywhere: the same Matchpoäng the improve panel shows —
                // never the raw ATS subscore composite, which reads differently.
                const themes = (createdCv?.__meta?.lastAtsResult?.result as any)?.job_language_match?.competence_themes;
                const m = themes?.length ? computeMatchScore(themes) : null;
                return m !== null && m !== undefined ? Math.round(m) : (createdCv?.__meta?.lastAtsScore?.score ?? "–");
              })()}
              <span className="text-lg text-muted-foreground"> / 100</span>
            </p>
            <Foot>
              <Button size="lg" className="w-full text-base" onClick={downloadCreated}>{isSv ? "Ladda ner PDF" : "Download PDF"}</Button>
              <Button variant="outline" onClick={() => createdId && navigate(`/editor/${createdId}`)}>{isSv ? "Öppna i editorn" : "Open in the editor"}</Button>
              <Button variant="ghost" size="sm" onClick={reset}>{isSv ? "Ny ansökan" : "New application"}</Button>
            </Foot>
          </>
        )}
    </>
  );

  if (asPage) {
    if (!open) return null;
    return <div className="mx-auto w-full max-w-xl px-4 py-10 sm:px-6">{body}</div>;
  }
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">{body}</DialogContent>
    </Dialog>
  );
}
