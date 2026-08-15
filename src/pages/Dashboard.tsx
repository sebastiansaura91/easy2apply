import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Copy, Trash2, Edit3, Settings, LogOut, Briefcase, Target, Plus, Star, Tag, ArrowRight, Loader2 } from "lucide-react";
import { RolePicker, CUSTOM_ROLE } from "@/components/role/RolePicker";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { CVMeta, emptyCV } from "@/types/cv";
import { getResumeMeta, splitTemplatesApplications } from "@/lib/resume-grouping";
import { roleLabel } from "@/lib/role-advice";
import { useLanguage } from "@/i18n/LanguageContext";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { v4 as uuidv4 } from "uuid";

interface ResumeRow { id: string; title: string; language: string; updated_at: string; created_at: string; content_json?: { __meta?: CVMeta } | null; }

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { language } = useLanguage();
  const isSv = language === "sv";
  const [resumes, setResumes] = useState<ResumeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [roleForId, setRoleForId] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState<string>("");
  const [roleCustom, setRoleCustom] = useState<string>("");
  const [roleIsApp, setRoleIsApp] = useState(false);
  const [companyDraft, setCompanyDraft] = useState<string>("");

  const fetchResumes = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("resumes").select("id, title, language, updated_at, created_at, content_json")
      .eq("user_id", user.id).order("updated_at", { ascending: false });
    if (error) { setFetchError(true); setLoading(false); return; }
    setFetchError(false);
    // The registry row is app infrastructure, not a CV — never list it.
    setResumes(((data as ResumeRow[]) || []).filter(r => !(r.content_json?.__meta as any)?.isRegistryRow));
    setLoading(false);
  };

  useEffect(() => { fetchResumes(); }, [user]);

  const { templates, applications } = splitTemplatesApplications(resumes);
  // The apply journey is a full page (/apply), not a modal.
  const openApply = (roleId?: string) => navigate(roleId ? `/apply?role=${encodeURIComponent(roleId)}` : "/apply");

  // Status per application, GOV.UK task-list style. Thresholds follow the industry
  // convention (Jobscan: 75 minimum, 80 sweet spot): 80+ ready, 60–79 improve.
  // After sending, the lifecycle stage takes over from the readiness score.
  // Status is typographic (the read.cv/Fey lesson): hairline border, ink text, and one
  // small state dot — never a colored slab per row. Density stays calm.
  const LIFECYCLE: Record<string, { sv: string; en: string; cls: string; dot: string }> = {
    sent: { sv: "Skickad", en: "Sent", cls: "text-foreground", dot: "bg-primary/60" },
    interview: { sv: "Intervju", en: "Interview", cls: "text-foreground", dot: "bg-primary" },
    offer: { sv: "Erbjudande", en: "Offer", cls: "text-green-700 dark:text-green-500", dot: "bg-green-600" },
    rejected: { sv: "Avslag", en: "Rejected", cls: "text-muted-foreground", dot: "bg-muted-foreground/50" },
  };
  const statusOf = (meta: CVMeta) => {
    const st = meta.applicationStatus;
    if (st && LIFECYCLE[st.stage]) {
      const l = LIFECYCLE[st.stage];
      return { label: `${isSv ? l.sv : l.en} ${format(new Date(st.at), "d/M")}`, cls: l.cls, dot: l.dot, lifecycle: true };
    }
    const s = meta.lastAtsScore?.score;
    if (s === undefined) return { label: isSv ? "Utkast" : "Draft", cls: "text-muted-foreground", dot: "bg-muted-foreground/40", lifecycle: false };
    if (s >= 80) return { label: isSv ? "Redo att skicka" : "Ready to send", cls: "text-green-700 dark:text-green-500", dot: "bg-green-600", lifecycle: false };
    if (s >= 60) return { label: isSv ? "Att förbättra" : "To improve", cls: "text-warning", dot: "bg-warning", lifecycle: false };
    return { label: isSv ? "Svag match" : "Weak match", cls: "text-destructive", dot: "bg-destructive", lifecycle: false };
  };
  const setStage = async (r: ResumeRow, stage: "sent" | "interview" | "offer" | "rejected" | null) => {
    const { data } = await supabase.from("resumes").select("content_json").eq("id", r.id).single();
    const prev = (data?.content_json as any) || {};
    const content = {
      ...prev,
      __meta: { ...(prev.__meta || {}), applicationStatus: stage ? { stage, at: new Date().toISOString() } : undefined },
    };
    const { error } = await supabase.from("resumes").update({ content_json: content }).eq("id", r.id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else fetchResumes();
  };
  // The one application that needs you most: lowest score under 80, unanalyzed last.
  // Sent/finished applications are out of the fix queue.
  const nextStep = applications
    .map(r => ({ r, meta: getResumeMeta(r), score: getResumeMeta(r).lastAtsScore?.score }))
    .filter(x => !x.meta.applicationStatus && (x.score === undefined || x.score < 80))
    .sort((a, b) => (a.score ?? 998) - (b.score ?? 998))[0];

  // Pipeline (the Huntr/Teal model): where an application LIVES on the page answers
  // "where does this process stand" — the pill is just the control for moving it.
  type Stage = "fix" | "ready" | "sent" | "interview" | "done";
  const stageOf = (meta: CVMeta): Stage => {
    const st = meta.applicationStatus?.stage;
    if (st === "interview") return "interview";
    if (st === "sent") return "sent";
    if (st === "offer" || st === "rejected") return "done";
    return (meta.lastAtsScore?.score ?? 0) >= 80 ? "ready" : "fix";
  };
  const pipeline: Record<Stage, ResumeRow[]> = { fix: [], ready: [], sent: [], interview: [], done: [] };
  for (const r of applications) pipeline[stageOf(getResumeMeta(r))].push(r);
  const STAGE_META: { key: Stage; label: string }[] = [
    { key: "fix", label: isSv ? "Att fixa" : "To fix" },
    { key: "ready", label: isSv ? "Redo att skicka" : "Ready to send" },
    { key: "sent", label: isSv ? "Skickad" : "Sent" },
    { key: "interview", label: isSv ? "Intervju" : "Interview" },
  ];
  const overview = STAGE_META
    .filter(s => pipeline[s.key].length > 0)
    .map(s => `${pipeline[s.key].length} ${s.label.toLowerCase()}`)
    .join(" · ");
  const [doneOpen, setDoneOpen] = useState(false);

  // "Sökt jobb": log an application that already went out (often outside the app).
  // Picking a CV stores a copy — the receipt of exactly what was sent.
  const [addOpen, setAddOpen] = useState(false);
  const [ajTitle, setAjTitle] = useState("");
  const [ajCompany, setAjCompany] = useState("");
  const [ajDate, setAjDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [ajCvId, setAjCvId] = useState<string>("");
  const [ajSaving, setAjSaving] = useState(false);

  const saveAppliedJob = async () => {
    if (!user || !ajTitle.trim()) return;
    setAjSaving(true);
    try {
      const at = new Date(`${ajDate}T12:00:00`).toISOString();
      const source = resumes.find(r => r.id === ajCvId);
      const isExistingApplication = source && applications.some(a => a.id === source.id);
      if (source && isExistingApplication) {
        // An in-app application was sent — move it to Skickad instead of duplicating it.
        const { data } = await supabase.from("resumes").select("content_json").eq("id", source.id).single();
        const prev = (data?.content_json as any) || {};
        const content = {
          ...prev,
          __meta: {
            ...(prev.__meta || {}),
            tailoredForJob: prev.__meta?.tailoredForJob || ajTitle.trim(),
            tailoredForCompany: ajCompany.trim() || prev.__meta?.tailoredForCompany,
            applicationStatus: { stage: "sent", at },
          },
        };
        const { error } = await supabase.from("resumes").update({ content_json: content }).eq("id", source.id);
        if (error) throw error;
      } else {
        // External or template-based: create the pipeline row (with a copy of the CV if one was picked).
        let content: any = { ...emptyCV };
        if (source) {
          const { data } = await supabase.from("resumes").select("content_json").eq("id", source.id).single();
          content = { ...((data?.content_json as any) || emptyCV) };
        }
        content.__meta = {
          ...(content.__meta || {}),
          isTemplate: false,
          tailoredForJob: ajTitle.trim(),
          tailoredForCompany: ajCompany.trim() || undefined,
          applicationStatus: { stage: "sent", at },
          ...(source ? { createdFrom: source.id } : {}),
        };
        const { error } = await supabase.from("resumes").insert({
          id: uuidv4(), user_id: user.id,
          title: `${ajTitle.trim()}${ajCompany.trim() ? ` – ${ajCompany.trim()}` : ""}`,
          language: source?.language || (isSv ? "sv" : "en"), template_id: "default", content_json: content,
        });
        if (error) throw error;
      }
      setAddOpen(false);
      setAjTitle(""); setAjCompany(""); setAjCvId(""); setAjDate(format(new Date(), "yyyy-MM-dd"));
      toast({ title: isSv ? "Sökt jobb loggat" : "Applied job logged", description: isSv ? "Ligger under Skickad i pipelinen." : "Now under Sent in the pipeline." });
      fetchResumes();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setAjSaving(false); }
  };

  const duplicateResume = async (r: ResumeRow) => {
    if (!user) return;
    const { data } = await supabase.from("resumes").select("content_json").eq("id", r.id).single();
    if (!data) return;
    const id = uuidv4();
    const content = { ...((data.content_json as any) || {}), __meta: { ...getResumeMeta(r), createdFrom: r.id } };
    const { error } = await supabase.from("resumes").insert({
      id, user_id: user.id, title: `${r.title} (kopia)`, language: r.language, template_id: "default", content_json: content,
    });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { fetchResumes(); toast({ title: isSv ? "CV kopierat" : "CV duplicated" }); }
  };

  const deleteResume = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("resumes").delete().eq("id", deleteId);
    if (!error) setResumes((p) => p.filter((r) => r.id !== deleteId));
    else toast({ title: "Error", description: error.message, variant: "destructive" });
    setDeleteId(null);
  };

  const openRole = (r: ResumeRow) => {
    const m = getResumeMeta(r);
    setRoleForId(r.id);
    setRoleDraft(m.targetRoleLabel ? CUSTOM_ROLE : (m.targetRole ?? ""));
    setRoleCustom(m.targetRoleLabel ?? "");
    setRoleIsApp(applications.some(a => a.id === r.id));
    setCompanyDraft(m.tailoredForCompany ?? "");
  };

  const saveRole = async () => {
    if (!roleForId) return;
    const isCustom = roleDraft === CUSTOM_ROLE;
    const { data } = await supabase.from("resumes").select("content_json").eq("id", roleForId).single();
    const prev = (data?.content_json as any) || {};
    const content = {
      ...prev,
      __meta: {
        ...(prev.__meta || {}),
        targetRole: isCustom ? undefined : (roleDraft || undefined),
        targetRoleLabel: isCustom ? (roleCustom.trim() || undefined) : undefined,
        // Company is application tracking — only written for applications.
        ...(roleIsApp ? { tailoredForCompany: companyDraft.trim() || undefined } : {}),
      },
    };
    const { error } = await supabase.from("resumes").update({ content_json: content }).eq("id", roleForId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { setRoleForId(null); fetchResumes(); toast({ title: isSv ? "Roll uppdaterad" : "Role updated" }); }
  };

  const renderCard = (r: ResumeRow, kind: "template" | "application") => {
    const meta = getResumeMeta(r);
    const isTemplate = kind === "template";
    return (
      <Card key={r.id} className="transition-shadow hover:shadow-md">
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => navigate(`/editor/${r.id}`)}>
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate font-medium">{r.title}</h3>
                {(meta.targetRole || meta.targetRoleLabel) && (
                  <Badge variant="outline" className="h-5 max-w-[200px] truncate whitespace-nowrap border-primary/30 text-[10px] text-primary">
                                        {roleLabel(meta.targetRole, meta.targetRoleLabel, language)}
                  </Badge>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {meta.tailoredForJob ? `${isSv ? "för" : "for"} ${meta.tailoredForJob}${meta.tailoredForCompany ? ` @ ${meta.tailoredForCompany}` : ""} · ` : ""}
                {format(new Date(r.updated_at), "yyyy-MM-dd")} · {r.language.toUpperCase()}
              </p>
            </div>
          </button>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            {!isTemplate && (() => {
              const st = statusOf(meta);
              const sc = meta.lastAtsScore?.score;
              return (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={`hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium tabular-nums hover:bg-muted sm:inline-flex ${st.cls}`}
                      title={isSv ? "Sätt status" : "Set status"}>
                      <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} aria-hidden="true" />
                      {!st.lifecycle && sc !== undefined && <>{sc} · </>}{st.label}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">{isSv ? "Ansökan" : "Application"}</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => setStage(r, "sent")}>{isSv ? "Skickad" : "Sent"}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStage(r, "interview")}>{isSv ? "Intervju" : "Interview"}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStage(r, "offer")}>{isSv ? "Erbjudande" : "Offer"}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStage(r, "rejected")}>{isSv ? "Avslag" : "Rejected"}</DropdownMenuItem>
                    {meta.applicationStatus && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setStage(r, null)}>{isSv ? "Tillbaka till utkast" : "Back to draft"}</DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })()}
            {isTemplate && (
              <Button size="sm" className="h-9 text-xs" onClick={() => openApply(getResumeMeta(r).targetRole)}>
                {isSv ? "Sök" : "Apply"}
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-9 w-9" title={isSv ? "Kategorisera roll" : "Set role"} onClick={() => openRole(r)}><Tag className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-9 w-9" title={isSv ? "Redigera" : "Edit"} onClick={() => navigate(`/editor/${r.id}`)}><Edit3 className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-9 w-9" title={isSv ? "Kopiera" : "Duplicate"} onClick={() => duplicateResume(r)}><Copy className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-9 w-9" title={isSv ? "Radera" : "Delete"} onClick={() => setDeleteId(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="min-w-0 flex-1">
      <div className="mx-auto max-w-3xl px-6 py-12">
        {loading ? (
          <div className="py-20 text-center text-muted-foreground">{isSv ? "Laddar…" : "Loading..."}</div>
        ) : fetchError ? (
          <div className="space-y-3 py-20 text-center">
            <p className="text-sm text-muted-foreground">{isSv ? "Kunde inte ladda dina CV:n — kolla anslutningen." : "Couldn't load your CVs — check your connection."}</p>
            <Button variant="outline" onClick={fetchResumes}>{isSv ? "Försök igen" : "Try again"}</Button>
          </div>
        ) : resumes.length === 0 ? (
          <div className="mx-auto max-w-md py-24 text-center">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <h1 className="font-serif text-3xl font-medium tracking-tight">{isSv ? "Skapa din första mall" : "Create your first template"}</h1>
            <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground">
              {isSv ? "En stark master för en roll du söker. Rikta den sedan mot varje jobb." : "A strong master for a role you target. Then tailor it to each job."}
            </p>
            <Button size="lg" className="mt-8" onClick={() => navigate("/wizard/create")}>
              <Plus className="mr-1.5 h-4 w-4" />{isSv ? "Skapa CV" : "Create CV"}
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            <div>
              <h1 className="font-serif text-3xl font-medium tracking-tight">{isSv ? "Hem" : "Home"}</h1>
              {overview && <p className="mt-1.5 text-sm text-muted-foreground tabular-nums">{overview}</p>}
            </div>

            {/* Hero action — the one move that matters */}
            <section className="flex flex-col gap-4 rounded-xl border border-border bg-accent/50 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
              <div className="max-w-md">
                <h2 className="font-serif text-2xl font-medium tracking-tight">{isSv ? "Ska du söka en tjänst?" : "Applying for a role?"}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {isSv ? "Välj roll — vi hämtar din mall, kollar mot annonsen och öppnar ett riktat CV på två steg." : "Pick a role — we pull your template, check it against the ad, and open a tailored CV in two steps."}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-stretch gap-2">
                <Button size="lg" className="h-12 px-6 text-base" onClick={() => openApply()} disabled={templates.length === 0}>
                  {isSv ? "Sök en ny tjänst" : "Apply for a new position"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <button type="button" onClick={() => setAddOpen(true)}
                  className="text-center text-xs text-muted-foreground underline-offset-4 hover:underline">
                  {isSv ? "Redan sökt? Logga jobbet" : "Already applied? Log the job"}
                </button>
              </div>
            </section>

            {/* The task that needs you most, GOV.UK task-list style. */}
            {nextStep && (
              <section className="rounded-xl border border-warning/50 p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{isSv ? "Nästa steg" : "Next step"}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {nextStep.meta.tailoredForJob || nextStep.r.title}
                      {nextStep.meta.tailoredForCompany ? ` @ ${nextStep.meta.tailoredForCompany}` : ""}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {nextStep.score !== undefined
                        ? (isSv ? `${nextStep.score} av 100. Kör Förbättra så stiger den.` : `${nextStep.score} of 100. Run Improve to raise it.`)
                        : (isSv ? "Ingen analys än. Öppna och kör en skanning." : "No analysis yet. Open it and run a scan.")}
                    </p>
                  </div>
                  <Button className="h-10 shrink-0" onClick={() => navigate(`/editor/${nextStep.r.id}`)}>
                    {isSv ? "Fortsätt" : "Continue"}<ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </section>
            )}

            {/* Pipeline: one section per stage, in process order — where a card sits
                IS its status. Templates live on their own page now. */}
            {applications.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                {isSv ? "Inga ansökningar än. Tryck “Sök en ny tjänst” ovan så börjar pipelinen fyllas." : "No applications yet. Hit “Apply for a new position” above and the pipeline starts filling."}
              </div>
            ) : (
              STAGE_META.filter(s => pipeline[s.key].length > 0).map(s => (
                <section key={s.key}>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground tabular-nums">
                    {s.label} · {pipeline[s.key].length}
                  </p>
                  <div className="space-y-2">{pipeline[s.key].map((r) => renderCard(r, "application"))}</div>
                </section>
              ))
            )}
            {pipeline.done.length > 0 && (
              <section>
                <button type="button" onClick={() => setDoneOpen(o => !o)}
                  className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground underline-offset-4 hover:underline tabular-nums">
                  {isSv ? "Avslutade" : "Closed"} · {pipeline.done.length} {doneOpen ? "▴" : "▾"}
                </button>
                {doneOpen && <div className="space-y-2">{pipeline.done.map((r) => renderCard(r, "application"))}</div>}
              </section>
            )}
          </div>
        )}
      </div>
      </main>

      {/* Log an already-sent application — it lands straight in the Skickad section. */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isSv ? "Logga ett sökt jobb" : "Log an applied job"}</DialogTitle>
            <DialogDescription>
              {isSv ? "Ett jobb du redan skickat in ansökan till. Hamnar under Skickad." : "A job you already applied to. It lands under Sent."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <Input autoFocus value={ajTitle} onChange={e => setAjTitle(e.target.value)} placeholder={isSv ? "Jobbtitel *" : "Job title *"} />
            <Input value={ajCompany} onChange={e => setAjCompany(e.target.value)} placeholder={isSv ? "Företag" : "Company"} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{isSv ? "Skickad datum" : "Date sent"}</label>
                <Input type="date" value={ajDate} onChange={e => setAjDate(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{isSv ? "CV som skickades" : "CV that was sent"}</label>
                <select value={ajCvId} onChange={e => setAjCvId(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                  <option value="">{isSv ? "Inget härifrån" : "None from here"}</option>
                  {resumes.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
                </select>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {isSv ? "Väljer du ett CV sparas en kopia som kvitto på exakt vad som skickades. Väljer du en pågående ansökan flyttas den bara till Skickad." : "Pick a CV and a copy is stored as the receipt of exactly what was sent. Pick an ongoing application and it just moves to Sent."}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={ajSaving}>{isSv ? "Avbryt" : "Cancel"}</Button>
            <Button onClick={saveAppliedJob} disabled={ajSaving || !ajTitle.trim()}>
              {ajSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {isSv ? "Logga jobbet" : "Log the job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!roleForId} onOpenChange={(o) => !o && setRoleForId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{roleIsApp ? (isSv ? "Roll & företag" : "Role & company") : (isSv ? "Kategorisera roll" : "Categorize role")}</DialogTitle>
            <DialogDescription>
              {roleIsApp
                ? (isSv ? "Rollen ansökan gäller och företaget — för din överblick." : "The role this application targets and the company — for your tracking.")
                : (isSv ? "Välj vilken roll det här CV:t är en mall för." : "Choose which role this CV is a template for.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <RolePicker value={roleDraft} onChange={setRoleDraft} selectedLabel={roleLabel(roleDraft, roleCustom, language)} onCustomLabel={(l) => setRoleCustom(l)} />
            {roleDraft === CUSTOM_ROLE && (
              <Input
                autoFocus
                value={roleCustom}
                onChange={(e) => setRoleCustom(e.target.value)}
                placeholder={isSv ? "t.ex. VP Customer Experience" : "e.g. VP Customer Experience"}
              />
            )}
            {roleIsApp && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{isSv ? "Företag" : "Company"}</label>
                <Input
                  value={companyDraft}
                  onChange={(e) => setCompanyDraft(e.target.value)}
                  placeholder={isSv ? "t.ex. Klarna" : "e.g. Klarna"}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleForId(null)}>{isSv ? "Avbryt" : "Cancel"}</Button>
            <Button onClick={saveRole}>{isSv ? "Spara" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isSv ? "Radera CV?" : "Delete CV?"}</AlertDialogTitle>
            <AlertDialogDescription>{isSv ? "Det här går inte att ångra." : "This can't be undone."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isSv ? "Avbryt" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction onClick={deleteResume}>{isSv ? "Radera" : "Delete"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Dashboard;
