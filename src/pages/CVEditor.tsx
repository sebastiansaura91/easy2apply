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
import { ArrowLeft, FileDown, Globe, Languages, Loader2, Sparkles, Palette, FileText, ArrowRight, LayoutList, ListChecks, Target, UserCog, RefreshCw, MoreHorizontal, Check, Eye, ListOrdered, Save } from "lucide-react";
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
  const [pageBreaksOpen, setPageBreaksOpen] = useState(false);
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
    if (changed) setCv(next);
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

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">{t("loading")}</p></div>;

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
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
            <Button variant="outline" size="sm" className="h-9 whitespace-nowrap text-xs" onClick={() => setTailorOpen(true)}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />{cvLanguage === "en" ? "Improve" : "Förbättra"}
            </Button>
            <Button variant="outline" size="sm" className="h-9 whitespace-nowrap text-xs" onClick={() => setPageBreaksOpen(true)}>
              <Eye className="mr-1.5 h-3.5 w-3.5" />{cvLanguage === "en" ? "Preview" : "Förhandsgranska"}
            </Button>
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
      {mode === "step" ? (
        <main className="flex-1">
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
        <main className="flex-1">
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
      )}

      {/* Unified tailoring surface — role fit + ATS/keywords + role guide */}
      <TailorPanel
        open={tailorOpen}
        onOpenChange={setTailorOpen}
        cv={cv}
        cvLanguage={cvLanguage}
        t={t}
        seededJob={seededJob}
        seededResult={seededResult}
        onApplyReframe={applyReframe}
        onNavigateToSection={navigateToSection}
        onUpdateProfile={updateProfile}
        onUpdateExperienceBullets={updateExperienceBullets}
        onUpdateSkills={updateSkills}
        onPersistScore={(score, grade, subscores) =>
          setCv(prev => ({ ...prev, __meta: { ...prev.__meta, lastAtsScore: { score, grade, at: new Date().toISOString(), subscores } } }))}
        onPersistResult={(hash, result) =>
          setCv(prev => ({ ...prev, __meta: { ...prev.__meta, lastAtsResult: { hash, at: new Date().toISOString(), result } } }))}
        onPersistRoleFit={(hash, result) =>
          setCv(prev => ({ ...prev, __meta: { ...prev.__meta, lastRoleFit: { hash, at: new Date().toISOString(), result } } }))}
        onUpdateMeta={(patch) =>
          setCv(prev => ({ ...prev, __meta: { ...prev.__meta, ...patch } }))}
        onDownload={doExport}
        profileEvidence={profileEvidence ?? undefined}
      />

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

      {/* Page breaks dialog */}
      <Dialog open={pageBreaksOpen} onOpenChange={setPageBreaksOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{cvLanguage === "en" ? "Preview" : "Förhandsgranskning"}</DialogTitle>
          </DialogHeader>
          {pageCount !== null && (
            <p className={`text-xs ${pageCount > 2 ? "text-warning" : "text-muted-foreground"}`}>
              {cvLanguage === "en"
                ? `${pageCount} ${pageCount === 1 ? "page" : "pages"} in the exported PDF${pageCount > 2 ? " — aim for max 2. Shorten the longest bullets or hide a section." : "."}`
                : `${pageCount} ${pageCount === 1 ? "sida" : "sidor"} i exporterad PDF${pageCount > 2 ? " — sikta på max 2. Korta de längsta punkterna eller dölj en sektion." : "."}`}
            </p>
          )}
          <div className="bg-muted/40 p-4 rounded-lg flex justify-center overflow-auto">
            <div className="transform scale-[0.75] origin-top">
              <A4Preview cv={cv} enabledSections={enabledSections} t={tCv} style={templateStyle} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
};

export default CVEditor;
