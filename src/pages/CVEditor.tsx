import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLanguage } from "@/i18n/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useFlow } from "@/contexts/FlowContext";
import { supabase } from "@/integrations/supabase/client";
import { CVContent, emptyCV, atsSectionOrder } from "@/types/cv";
import { convertLanguageLevels } from "@/lib/language-level-mapping";
import { syncStructure } from "@/lib/sync-structure";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, FileDown, Globe, Languages, Loader2, Sparkles, Palette, FileText, ArrowRight, LayoutList, ListChecks, Target, UserCog, RefreshCw, RotateCcw, MoreHorizontal, Check, Eye, ListOrdered, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { TailorPanel } from "@/components/editor/TailorPanel";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { roleLabel } from "@/lib/role-advice";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { SortableEditorSection } from "@/components/cv-editor/SortableEditorSection";
import { A4Preview } from "@/components/cv-editor/A4Preview";
import { SectionFormRenderer } from "@/components/cv-editor/SectionForms";
import { cvHeadings } from "@/i18n/cvHeadings";
import { exportToPdf, buildPdf } from "@/lib/export-pdf";
import { TEMPLATE_STYLES, getTemplateStyle, withAccent, ACCENT_PRESETS } from "@/lib/templates";
import { detectCvLanguages } from "@/lib/language-detection";
import { buildEvidenceLookup } from "@/lib/competence-registry";

const CVEditor = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user } = useAuth();
  const flow = useFlow();
  const { toast } = useToast();
  const [tailorOpen, setTailorOpen] = useState(false);
  // Cross-CV evidence lookup (name → verified answers from any CV), loaded when the
  // tailor panel first opens so answered questions are never asked again.
  const [profileEvidence, setProfileEvidence] = useState<((name: string) => { keyword: string; answer: string }[]) | null>(null);
  // Wide screens dock the improve panel beside the document; narrow ones keep the sheet.
  const [isWide, setIsWide] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1280px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const fn = (e: MediaQueryListEvent) => setIsWide(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const autoOpenedRef = useRef(false);

  const [cv, setCv] = useState<CVContent>(emptyCV);
  const [title, setTitle] = useState("");
  const [cvLanguage, setCvLanguage] = useState<"sv" | "en">("sv");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [translating, setTranslating] = useState(false);
  const [mode, setMode] = useState<"step" | "overview">("overview");
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const toggleSectionOpen = (id: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const [stepIdx, setStepIdx] = useState(0);
  const [styleOpen, setStyleOpen] = useState(false);
  // Split view (category standard: form left, live document right). On narrow screens
  // or when the improve panel is docked, one pane at a time via the Redigera/Förhandsgranska toggle.
  const [view, setView] = useState<"edit" | "preview">("edit");
  // Parse-back test: read the ACTUAL exported PDF with a real parser (pdf.js) and
  // verify every field survives — "ATS-safe" as a measurement, not a promise.
  const [parseChecks, setParseChecks] = useState<{ label: string; ok: boolean }[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const saveTimeout = useRef<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const tCv = useCallback((key: string) => cvHeadings[cvLanguage]?.[key] || key, [cvLanguage]);

  const langCheck = useMemo(() => detectCvLanguages(cv, cvLanguage), [cv, cvLanguage]);
  const mismatchSections = langCheck.detected_sections.filter(s => s.language !== "unknown" && s.language !== cvLanguage && s.confidence > 0.5);

  useEffect(() => {
    const load = async () => {
      if (!id || !user) return;
      const { data, error } = await supabase.from("resumes").select("title, content_json, language").eq("id", id).single();
      if (error || !data) { toast({ title: t("error"), variant: "destructive" }); navigate("/dashboard"); return; }
      setTitle(data.title);
      setCv(data.content_json as unknown as CVContent);
      setCvLanguage((data.language as "sv" | "en") || "sv");
      setLoading(false);
    };
    load();
  }, [id, user]);

  const saveCV = useCallback(async () => {
    if (!id || !user) return;
    setSaving(true);
    const { error } = await supabase.from("resumes")
      .update({ title, content_json: cv as any, language: cvLanguage, updated_at: new Date().toISOString() })
      .eq("id", id);
    setSaving(false);
    if (error) toast({ title: t("error"), description: error.message, variant: "destructive" });
  }, [id, user, title, cv, cvLanguage, t, toast]);

  // Keep a ref to the latest saveCV + a dirty flag so we can flush pending edits on
  // unmount / tab-close without depending on a stale closure.
  const saveCVRef = useRef(saveCV);
  const dirtyRef = useRef(false);
  useEffect(() => { saveCVRef.current = saveCV; }, [saveCV]);

  useEffect(() => {
    if (!tailorOpen || profileEvidence) return;
    (async () => {
      const { data } = await supabase.from("resumes").select("title, content_json");
      const rows = (data || []).map((r: any) => ({ title: r.title, meta: (r.content_json?.__meta || {}) as CVContent["__meta"] & object }));
      const registry = rows.find(r => (r.meta as any)?.isRegistryRow)?.meta?.competenceRegistry || null;
      const lookup = buildEvidenceLookup(rows as any, registry as any);
      setProfileEvidence(() => lookup);
    })();
  }, [tailorOpen, profileEvidence]);

  const prevLangRef = useRef(cvLanguage);
  useEffect(() => {
    if (loading) return;
    if (prevLangRef.current !== cvLanguage) {
      const converted = convertLanguageLevels(cv, cvLanguage);
      if (converted.some((l, i) => l.level !== cv.languages[i]?.level)) {
        setCv(prev => ({ ...prev, languages: converted }));
      }
      prevLangRef.current = cvLanguage;
    }
  }, [cvLanguage, loading]);

  useEffect(() => {
    if (loading) return;
    dirtyRef.current = true;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = window.setTimeout(() => { saveCV(); dirtyRef.current = false; }, 2000);
    return () => { if (saveTimeout.current) clearTimeout(saveTimeout.current); };
  }, [cv, title, cvLanguage, loading]);

  // Flush any pending debounced save when leaving the editor (navigation unmount) or
  // closing the tab, so edits made within the 2s debounce window are never lost.
  useEffect(() => {
    const flush = () => {
      if (!dirtyRef.current) return;
      if (saveTimeout.current) { clearTimeout(saveTimeout.current); saveTimeout.current = null; }
      dirtyRef.current = false;
      void saveCVRef.current();
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, []);

  const updateCv = <K extends keyof CVContent>(key: K, value: CVContent[K]) => setCv(prev => ({ ...prev, [key]: value }));

  const toggleSection = (sectionId: string) => updateCv("sections", cv.sections.map(s => s.id === sectionId ? { ...s, enabled: !s.enabled } : s));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = cv.sections.findIndex(s => s.id === active.id);
    const newIdx = cv.sections.findIndex(s => s.id === over.id);
    updateCv("sections", arrayMove(cv.sections, oldIdx, newIdx).map((s, i) => ({ ...s, order: i })));
  };

  const handleTranslateCV = async () => {
    setTranslating(true);
    try {
      const { data, error } = await supabase.functions.invoke("translate-cv", {
        body: { resume_content_json: cv, target_language: cvLanguage },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setCv(prev => ({ ...prev, contact: data.contact || prev.contact, profile: data.profile ?? prev.profile, experience: data.experience || prev.experience, education: data.education || prev.education, skills: data.skills || prev.skills, certifications: data.certifications || prev.certifications, projects: data.projects || prev.projects, languages: data.languages || prev.languages, other: data.other ?? prev.other }));
      toast({ title: cvLanguage === "en" ? "CV translated to English" : "CV översatt till svenska" });
    } catch (err: any) {
      toast({ title: "Translation failed", description: err.message, variant: "destructive" });
    } finally { setTranslating(false); }
  };

  const enabledSections = [...cv.sections].sort((a, b) => a.order - b.order).filter(s => s.enabled);
  const clampedStep = Math.min(stepIdx, Math.max(0, enabledSections.length - 1));
  const currentSection = enabledSections[clampedStep];
  const isFirst = clampedStep === 0;
  const isLast = clampedStep >= enabledSections.length - 1;

  const goNext = () => {
    if (isLast) return;
    setStepIdx(clampedStep + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goPrev = () => {
    if (isFirst) return;
    setStepIdx(clampedStep - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    if (mode !== "step") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return;
      e.preventDefault();
      goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, clampedStep, enabledSections.length]);

  // Tailoring analysis carried in from a wizard, scoped to THIS resume so a stale
  // analysis from another CV never shows here.
  const flowScoped = flow.resumeId === id;
  const seededJob = (flowScoped ? flow.jobPostingText : "") || cv.__meta?.jobPostingText || undefined;
  const seededResult = flowScoped ? flow.analysis : null;

  // Auto-open the insights panel once when arriving from a wizard with analysis/job context,
  // so "Fix this in editor" lands on the actual issues to adjust for the role.
  useEffect(() => {
    if (loading || autoOpenedRef.current) return;
    if (flowScoped && (flow.analysis || (flow.jobPostingText && flow.jobPostingText.trim()))) {
      setTailorOpen(true);
      autoOpenedRef.current = true;
    }
  }, [loading, flowScoped, flow.analysis, flow.jobPostingText]);

  const updateProfile = (text: string) => updateCv("profile", text);
  const updateExperienceBullets = (expIdx: number, bullets: string[]) =>
    setCv(prev => ({ ...prev, experience: prev.experience.map((e, i) => i === expIdx ? { ...e, bullets } : e) }));
  const updateSkills = (skills: string[]) => updateCv("skills", skills);

  // One-step undo for automatic changes: snapshot the document BEFORE the change;
  // undo swaps current and snapshot, so pressing it twice is a redo.
  const takeSnapshot = useCallback((label: string) => {
    setCv(prev => {
      const { __meta, ...doc } = prev;
      return { ...prev, __meta: { ...__meta, lastSnapshot: { at: new Date().toISOString(), label, doc: doc as any } } };
    });
  }, []);
  const undoLast = () => {
    setCv(prev => {
      const snap = prev.__meta?.lastSnapshot;
      if (!snap) return prev;
      const { __meta, ...cur } = prev;
      return {
        ...(snap.doc as any),
        __meta: { ...__meta, lastSnapshot: { at: new Date().toISOString(), label: cvLanguage === "en" ? `Undid: ${snap.label}` : `Ångrade: ${snap.label}`, doc: cur as any } },
      };
    });
    toast({ title: cvLanguage === "en" ? "Undone" : "Ångrat", description: cvLanguage === "en" ? "Press again to redo." : "Tryck igen för att göra om." });
  };
  // Replace a bullet with its reframe. Matches tolerantly (trimmed, then across all
  // experiences as a fallback) and reports whether anything actually changed, so the
  // panel never claims "Applied" when nothing was. The change autosaves like any edit.
  const applyReframe = (experienceId: string, original: string, suggested: string): boolean => {
    const norm = (s: string) => s.trim().toLowerCase();
    let changed = false;
    const replaceIn = (bullets: string[]) =>
      bullets.map(b => {
        if (!changed && norm(b) === norm(original)) { changed = true; return suggested; }
        return b;
      });
    let next = {
      ...cv,
      experience: cv.experience.map(e => (e.id === experienceId ? { ...e, bullets: replaceIn(e.bullets) } : e)),
    };
    if (!changed) {
      // The AI sometimes returns a slightly-off experience id — fall back to any experience.
      next = { ...cv, experience: cv.experience.map(e => ({ ...e, bullets: replaceIn(e.bullets) })) };
    }
    if (changed) {
      takeSnapshot(cvLanguage === "en" ? "Reframe" : "Omformulering");
      setCv(prev => {
        // Recompute against the freshest state (snapshot updated __meta an instant ago).
        return { ...prev, experience: next.experience };
      });
    }
    return changed;
  };
  const navigateToSection = (sectionType: string) => {
    const idx = enabledSections.findIndex(s => s.type === sectionType);
    if (idx >= 0) { setMode("step"); setStepIdx(idx); }
    setTailorOpen(false);
  };

  const safeName = (title || "cv").replace(/[^a-zA-Z0-9åäöÅÄÖ_-]/g, "_");
  const templateStyleId = cv.__meta?.templateStyle;
  const templateAccent = cv.__meta?.templateAccent;
  const templateStyle = withAccent(getTemplateStyle(templateStyleId), templateAccent);
  const setTemplateStyle = (id: string) =>
    setCv(prev => ({ ...prev, __meta: { ...prev.__meta, templateStyle: id } }));
  const setTemplateAccent = (hex: string) =>
    setCv(prev => ({ ...prev, __meta: { ...prev.__meta, templateAccent: hex } }));
  const doExport = () => exportToPdf(cv, enabledSections, tCv, `${safeName}.pdf`, templateStyleId, templateAccent, cvLanguage).catch(() => toast({ title: "PDF export failed", variant: "destructive" }));

  const runParseTest = async () => {
    setParsing(true);
    try {
      const pdfjs: any = await import("pdfjs-dist");
      const worker: any = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const built = buildPdf(cv, enabledSections, tCv, templateStyleId, templateAccent, cvLanguage);
      const pdf = await pdfjs.getDocument({ data: built.output("arraybuffer") }).promise;
      let raw = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        raw += " " + content.items.map((it: any) => it.str).join(" ");
      }
      const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
      const hay = norm(raw);
      const checks: { label: string; ok: boolean }[] = [];
      const push = (label: string, value?: string) => {
        if (value && value.trim()) checks.push({ label, ok: hay.includes(norm(value)) });
      };
      const sv = cvLanguage === "sv";
      push(sv ? "Namn" : "Name", cv.contact.name);
      push(sv ? "E-post" : "Email", cv.contact.email);
      push(sv ? "Telefon" : "Phone", cv.contact.phone);
      push(sv ? "Profiltext" : "Profile", cv.profile);
      for (const e of cv.experience) {
        push(`${sv ? "Titel" : "Title"}: ${e.title}`, e.title);
        push(`${sv ? "Företag" : "Company"}: ${e.company}`, e.company);
        e.bullets.forEach((b, i) => push(`${e.title || "?"} · ${sv ? "punkt" : "bullet"} ${i + 1}`, b));
      }
      for (const s of cv.skills) push(`${sv ? "Kompetens" : "Skill"}: ${s}`, s);
      for (const ed of cv.education) { push(ed.degree, ed.degree); push(ed.school, ed.school); }
      for (const l of cv.languages) push(`${sv ? "Språk" : "Language"}: ${l.language}`, l.language);
      setParseChecks(checks);
    } catch (e: any) {
      toast({ title: cvLanguage === "en" ? "Parse test failed" : "Parsningstestet kraschade", description: e.message, variant: "destructive" });
    } finally { setParsing(false); }
  };

  // Explicit save (autosave still runs) — cancels any pending debounce and saves now.
  const manualSave = async () => {
    if (saveTimeout.current) { clearTimeout(saveTimeout.current); saveTimeout.current = null; }
    dirtyRef.current = false;
    await saveCV();
    toast({ title: cvLanguage === "en" ? "Saved" : "Sparat" });
  };

  // Live page count from the real PDF engine (debounced), so the editor always shows
  // exactly what export will produce — with a warning past two pages.
  const [pageCount, setPageCount] = useState<number | null>(null);
  useEffect(() => {
    if (loading) return;
    const id = window.setTimeout(() => {
      try {
        setPageCount(buildPdf(cv, enabledSections, tCv, templateStyleId, templateAccent, cvLanguage).getNumberOfPages());
      } catch { /* counting must never break editing */ }
    }, 800);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cv, loading, cvLanguage, templateStyleId, templateAccent]);

  // One-tap ATS-recommended order: summary + core competencies up top, then experience.
  const applyAtsOrder = () => {
    updateCv("sections", cv.sections.map(s => ({ ...s, order: atsSectionOrder.indexOf(s.type) })));
    toast({ title: cvLanguage === "en" ? "Sections arranged for ATS" : "Sektioner ordnade för ATS" });
  };

  // Propagate a structural fix (dates, company, contact, education…) to the master template
  // and every application in this lineage. Tailored profile/bullets/skills are left untouched.
  const syncFacts = async () => {
    if (!user || !id) return;
    setSyncing(true);
    const masterId = cv.__meta?.createdFrom || id;
    const { data } = await supabase.from("resumes").select("id, content_json").eq("user_id", user.id);
    const targets = (data || []).filter((r: any) =>
      r.id !== id && (r.id === masterId || r.content_json?.__meta?.createdFrom === masterId));
    let n = 0;
    for (const tg of targets) {
      const merged = syncStructure(cv, (tg.content_json as unknown as CVContent) || emptyCV);
      const { error } = await supabase.from("resumes")
        .update({ content_json: merged as any, updated_at: new Date().toISOString() }).eq("id", tg.id);
      if (!error) n++;
    }
    setSyncing(false);
    setSyncOpen(false);
    toast({ title: cvLanguage === "en" ? `Facts synced to ${n} CV${n === 1 ? "" : "s"}` : `Fakta synkade till ${n} CV:n` });
  };

  // One prop set for both homes of the improve panel: docked column (wide screens)
  // and overlay sheet (narrow).
  const tailorPanelProps = {
    onSnapshot: takeSnapshot,
    open: tailorOpen,
    onOpenChange: setTailorOpen,
    cv, cvLanguage, t,
    seededJob, seededResult,
    onApplyReframe: applyReframe,
    onNavigateToSection: navigateToSection,
    onUpdateProfile: updateProfile,
    onUpdateExperienceBullets: updateExperienceBullets,
    onUpdateSkills: updateSkills,
    onPersistScore: (score: number, grade: string, subscores?: any) =>
      setCv(prev => ({ ...prev, __meta: { ...prev.__meta, lastAtsScore: { score, grade, at: new Date().toISOString(), subscores } } })),
    onPersistResult: (hash: string, result: any) =>
      setCv(prev => ({ ...prev, __meta: { ...prev.__meta, lastAtsResult: { hash, at: new Date().toISOString(), result } } })),
    onPersistRoleFit: (hash: string, result: any) =>
      setCv(prev => ({ ...prev, __meta: { ...prev.__meta, lastRoleFit: { hash, at: new Date().toISOString(), result } } })),
    onUpdateMeta: (patch: any) =>
      setCv(prev => ({ ...prev, __meta: { ...prev.__meta, ...patch } })),
    onDownload: doExport,
    profileEvidence: profileEvidence ?? undefined,
  };

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">{t("loading")}</p></div>;

  const showBoth = isWide && !tailorOpen;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* Top bar */}
      <nav className="border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="h-8 w-56 text-sm font-medium border-transparent hover:border-input focus:border-input bg-transparent"
              placeholder={cvLanguage === "en" ? "Untitled resume" : "Namnlöst CV"}
            />
            {saving && <span className="text-[10px] text-muted-foreground ml-1">{cvLanguage === "en" ? "Saving…" : "Sparar…"}</span>}
            {pageCount !== null && (
              <span
                className={`ml-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                  pageCount > 2 ? "border-warning/50 bg-warning/10 text-warning" : "border-border text-muted-foreground"
                }`}
                title={pageCount > 2 ? (cvLanguage === "en" ? "Aim for max 2 pages — shorten the longest bullets." : "Sikta på max 2 sidor — korta de längsta punkterna.") : undefined}
              >
                {pageCount} {cvLanguage === "en" ? (pageCount === 1 ? "page" : "pages") : (pageCount === 1 ? "sida" : "sidor")}{pageCount > 2 ? " ⚠" : ""}
              </span>
            )}
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            {/* Mode toggle — icon only */}
            <div className="flex items-center rounded-md border border-border p-0.5 bg-muted/30">
              <button type="button" title={cvLanguage === "en" ? "Overview" : "Översikt"} onClick={() => setMode("overview")}
                className={`grid h-8 w-8 place-items-center rounded ${mode === "overview" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
                <LayoutList className="h-4 w-4" />
              </button>
              <button type="button" title={cvLanguage === "en" ? "Step-by-step" : "Steg-för-steg"} onClick={() => setMode("step")}
                className={`grid h-8 w-8 place-items-center rounded ${mode === "step" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                <ListChecks className="h-4 w-4" />
              </button>
            </div>
            <Button variant="outline" size="sm" className="h-9 whitespace-nowrap text-xs" onClick={() => { setTailorOpen(true); if (isWide) setView("preview"); }}>
              {cvLanguage === "en" ? "Improve" : "Förbättra"}
            </Button>
            {!showBoth && (
              <div className="flex items-center rounded-md border border-border bg-muted/30 p-0.5">
                <button type="button" onClick={() => setView("edit")}
                  className={`h-8 whitespace-nowrap rounded px-2.5 text-xs ${view === "edit" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
                  {cvLanguage === "en" ? "Edit" : "Redigera"}
                </button>
                <button type="button" onClick={() => setView("preview")}
                  className={`h-8 whitespace-nowrap rounded px-2.5 text-xs ${view === "preview" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
                  {cvLanguage === "en" ? "Preview" : "Förhandsgranska"}
                </button>
              </div>
            )}
            <Button variant="outline" size="icon" className="h-9 w-9" title={cvLanguage === "en" ? "Save" : "Spara"} onClick={manualSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </Button>
            <Button size="sm" className="h-9 whitespace-nowrap text-xs" onClick={doExport}>
              <FileDown className="mr-1.5 h-3.5 w-3.5" />{cvLanguage === "en" ? "Download PDF" : "Ladda ner PDF"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9" title={cvLanguage === "en" ? "More" : "Mer"}><MoreHorizontal className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setStyleOpen(true)}><Palette className="mr-2 h-4 w-4" />{cvLanguage === "en" ? "Style" : "Stil"}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSyncOpen(true)}><RefreshCw className="mr-2 h-4 w-4" />{cvLanguage === "en" ? "Sync facts" : "Synka fakta"}</DropdownMenuItem>
                <DropdownMenuItem onClick={applyAtsOrder}><ListOrdered className="mr-2 h-4 w-4" />{cvLanguage === "en" ? "Arrange for ATS" : "Ordna för ATS"}</DropdownMenuItem>
                <DropdownMenuItem onClick={runParseTest} disabled={parsing}>
                  <ListChecks className="mr-2 h-4 w-4" />
                  {parsing ? (cvLanguage === "en" ? "Parsing…" : "Parsar…") : (cvLanguage === "en" ? "Test parsing" : "Testa parsning")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={undoLast} disabled={!cv.__meta?.lastSnapshot}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {cv.__meta?.lastSnapshot
                    ? `${cvLanguage === "en" ? "Undo" : "Ångra"}: ${cv.__meta.lastSnapshot.label}`
                    : (cvLanguage === "en" ? "Undo last change" : "Ångra senaste ändring")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground"><Globe className="h-3 w-3" />{cvLanguage === "en" ? "Language" : "Språk"}</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setCvLanguage("sv")}>Svenska {cvLanguage === "sv" && <Check className="ml-auto h-4 w-4" />}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCvLanguage("en")}>English {cvLanguage === "en" && <Check className="ml-auto h-4 w-4" />}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </nav>

      {/* Language mismatch bar */}
      {langCheck.mismatch && mismatchSections.length > 0 && (
        <div className="border-b border-warning/30 bg-warning/5 px-4 py-1.5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Languages className="h-3.5 w-3.5 text-warning" />
            <span className="text-xs">{mismatchSections.length} section(s) with mixed languages</span>
          </div>
          <Button variant="outline" size="sm" className="h-8 text-[10px] border-warning/50" onClick={handleTranslateCV} disabled={translating}>
            {translating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Languages className="h-3 w-3 mr-1" />}
            {translating ? "Translating..." : "Convert all"}
          </Button>
        </div>
      )}

      {/* Main */}
      <div className="flex min-h-0 flex-1">
      {(showBoth || view === "edit") && (
      mode === "step" ? (
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-6 py-8">
            <div className="rounded-lg border border-border bg-card/40 p-8">
              {/* Progress bar */}
              <div className="flex items-center gap-1.5 mb-8">
                {enabledSections.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStepIdx(i)}
                    aria-label={tCv(`section${s.type.charAt(0).toUpperCase() + s.type.slice(1)}`)}
                    className={`h-1 flex-1 rounded-full transition-colors ${i <= clampedStep ? "bg-primary" : "bg-muted"}`}
                  />
                ))}
              </div>

              {/* Section title */}
              {currentSection && (
                <div className="mb-6 flex items-center justify-between">
                  <h2 className="text-2xl font-semibold tracking-tight">
                    {tCv(`section${currentSection.type.charAt(0).toUpperCase() + currentSection.type.slice(1)}`)}
                  </h2>
                  <span className="text-[11px] text-muted-foreground">
                    {clampedStep + 1} / {enabledSections.length}
                  </span>
                </div>
              )}

              {/* Current section form */}
              {currentSection && (
                <div className="[&_.card]:border-0">
                  <SectionFormRenderer sectionType={currentSection.type} cv={cv} updateCv={updateCv} t={t} cvLanguage={cvLanguage} />
                </div>
              )}
            </div>

            {/* Footer nav */}
            <div className="flex items-center justify-between mt-6 px-2">
              <Button variant="ghost" size="sm" onClick={goPrev} disabled={isFirst}>
                <ArrowLeft className="h-4 w-4 mr-1.5" />{cvLanguage === "en" ? "Back" : "Tillbaka"}
              </Button>
              <span className="text-xs text-muted-foreground">
                {cvLanguage === "en" ? "Press Enter to continue." : "Tryck Enter för att fortsätta."}
              </span>
              {isLast ? (
                <Button size="sm" onClick={doExport}>
                  <FileDown className="h-4 w-4 mr-1.5" />{cvLanguage === "en" ? "Download PDF" : "Ladda ner PDF"}
                </Button>
              ) : (
                <Button size="sm" onClick={goNext}>
                  {cvLanguage === "en" ? "Continue" : "Fortsätt"}<ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              )}
            </div>

            <p className="text-center text-[11px] text-muted-foreground mt-2">
              {cvLanguage === "en" ? "You can edit this later." : "Du kan redigera detta senare."}
            </p>
          </div>
        </main>
      ) : (
        <main className="min-w-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="max-w-3xl mx-auto p-4 sm:p-6">
              {/* Unified section list: drag to reorder, chevron to edit, eye to show/hide */}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={[...cv.sections].sort((a, b) => a.order - b.order).map(s => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="overflow-hidden rounded-xl border border-border bg-card divide-y divide-border">
                    {[...cv.sections].sort((a, b) => a.order - b.order).map(section => (
                      <SortableEditorSection
                        key={section.id}
                        section={section}
                        title={tCv(`section${section.type.charAt(0).toUpperCase() + section.type.slice(1)}`)}
                        isOpen={openSections.has(section.id)}
                        onToggleOpen={() => toggleSectionOpen(section.id)}
                        onToggleEnabled={() => toggleSection(section.id)}
                        hiddenLabel={cvLanguage === "en" ? "hidden" : "dold"}
                        toggleTitle={section.enabled ? (cvLanguage === "en" ? "Hide from CV" : "Dölj i CV") : (cvLanguage === "en" ? "Show in CV" : "Visa i CV")}
                      >
                        <SectionFormRenderer sectionType={section.type} cv={cv} updateCv={updateCv} t={t} cvLanguage={cvLanguage} />
                      </SortableEditorSection>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          </ScrollArea>
        </main>
      )
      )}

      {/* The document itself, always in sight (visibility of system status): live A4,
          updated on every keystroke. */}
      {(showBoth || view === "preview") && (
        <div className={`min-w-0 flex-1 overflow-auto bg-muted/40 ${showBoth ? "border-l border-border" : ""}`}>
          <div className="flex justify-center p-6">
            <div style={{ zoom: 0.62 }}>
              <A4Preview cv={cv} enabledSections={enabledSections} t={tCv} style={templateStyle} />
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Unified tailoring surface — overlay sheet on narrow screens only; wide screens
          get the docked column beside the document instead. */}
      {!isWide && <TailorPanel {...tailorPanelProps} />}

      {/* Sync structural facts across the whole lineage */}
      <Dialog open={syncOpen} onOpenChange={setSyncOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{cvLanguage === "en" ? "Sync facts to all your CVs" : "Synka fakta till alla dina CV:n"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {cvLanguage === "en"
              ? "Copies the structural facts from this CV — contact, role dates & companies, education, certifications, languages — to your master template and every application built from it. Your tailored profile, bullets and skills are left untouched."
              : "Kopierar de strukturella fakta från det här CV:t — kontakt, roll-datum & företag, utbildning, certifieringar, språk — till din master och alla ansökningar som byggts från den. Din skräddarsydda profil, punkter och kompetenser rörs inte."}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSyncOpen(false)} disabled={syncing}>{cvLanguage === "en" ? "Cancel" : "Avbryt"}</Button>
            <Button onClick={syncFacts} disabled={syncing}>
              {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {cvLanguage === "en" ? "Sync facts" : "Synka fakta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Style dialog — template picker (drives preview + PDF export) */}
      <Dialog open={styleOpen} onOpenChange={setStyleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{cvLanguage === "en" ? "Style" : "Stil"}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">
            {cvLanguage === "en"
              ? "Same content, different look. All styles stay single-column and ATS-safe."
              : "Samma innehåll, olika utseende. Alla stilar är enkolumniga och ATS-säkra."}
          </p>
          <div className="space-y-2 mt-1">
            {TEMPLATE_STYLES.map((s) => {
              const selected = templateStyle.id === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setTemplateStyle(s.id)}
                  className={`w-full text-left rounded-lg border p-3 transition-all ${selected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border hover:border-primary/40"}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm" style={{ color: s.accentHex }}>{s.label[cvLanguage]}</span>
                    {selected && <span className="text-[10px] text-primary">{cvLanguage === "en" ? "Selected" : "Vald"}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.desc[cvLanguage]}</p>
                </button>
              );
            })}
          </div>
          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">{cvLanguage === "en" ? "Accent colour" : "Accentfärg"}</p>
            <div className="flex items-center gap-2">
              {ACCENT_PRESETS.map((a) => {
                const active = templateStyle.accentHex.toLowerCase() === a.hex.toLowerCase();
                return (
                  <button
                    key={a.id}
                    onClick={() => setTemplateAccent(a.hex)}
                    title={a.label[cvLanguage]}
                    aria-label={a.label[cvLanguage]}
                    className={`h-7 w-7 rounded-full transition-transform ${active ? "ring-2 ring-offset-2 ring-foreground/40 scale-110" : "hover:scale-105"}`}
                    style={{ backgroundColor: a.hex }}
                  />
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      </div>

      {/* Parse-back result: what a real PDF parser actually recovered from the export. */}
      <Dialog open={!!parseChecks} onOpenChange={(o) => !o && setParseChecks(null)}>
        <DialogContent className="max-h-[80vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{cvLanguage === "en" ? "Parse test" : "Parsningstest"}</DialogTitle>
          </DialogHeader>
          {parseChecks && (() => {
            const ok = parseChecks.filter(c => c.ok).length;
            const misses = parseChecks.filter(c => !c.ok);
            return (
              <div className="space-y-3">
                <p className={`text-sm font-medium ${misses.length === 0 ? "text-green-700 dark:text-green-500" : "text-warning"}`}>
                  {cvLanguage === "en"
                    ? `${ok} of ${parseChecks.length} fields recovered by a real PDF parser.`
                    : `${ok} av ${parseChecks.length} fält återfanns av en riktig PDF-parser.`}
                </p>
                {misses.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {cvLanguage === "en" ? "Everything survives extraction. This export is machine-readable, measured, not promised." : "Allt överlever extraktion. Exporten är maskinläsbar — uppmätt, inte lovat."}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">{cvLanguage === "en" ? "Not recovered:" : "Återfanns inte:"}</p>
                    {misses.map((m, i) => (
                      <p key={i} className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{m.label}</p>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Docked improve column (the Grammarly pattern): the CV changes in view while
          you answer. Sticky, own scroll, closable. */}
      {isWide && tailorOpen && (
        <aside className="sticky top-0 h-screen w-[400px] shrink-0 border-l border-border bg-card">
          <TailorPanel {...tailorPanelProps} docked />
        </aside>
      )}
    </div>
  );
};

export default CVEditor;
