import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLanguage } from "@/i18n/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useFlow } from "@/contexts/FlowContext";
import { supabase } from "@/integrations/supabase/client";
import { CVContent, emptyCV } from "@/types/cv";
import { convertLanguageLevels } from "@/lib/language-level-mapping";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, FileDown, Globe, Languages, Loader2, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { SortableSectionItem } from "@/components/cv-editor/SortableSectionItem";
import { A4Preview } from "@/components/cv-editor/A4Preview";
import { SectionFormRenderer } from "@/components/cv-editor/SectionForms";
import { SectionNav } from "@/components/editor/SectionNav";
import { InsightsPanel } from "@/components/editor/InsightsPanel";
import { cvHeadings } from "@/i18n/cvHeadings";
import { exportToPdf } from "@/lib/export-pdf";
import { detectCvLanguages } from "@/lib/language-detection";

const CVEditor = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user } = useAuth();
  const flow = useFlow();
  const { toast } = useToast();

  const [cv, setCv] = useState<CVContent>(emptyCV);
  const [title, setTitle] = useState("");
  const [cvLanguage, setCvLanguage] = useState<"sv" | "en">("sv");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [translating, setTranslating] = useState(false);
  const [activeSection, setActiveSection] = useState("contact");
  const [showInsights, setShowInsights] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
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
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = window.setTimeout(() => saveCV(), 2000);
    return () => { if (saveTimeout.current) clearTimeout(saveTimeout.current); };
  }, [cv, title, cvLanguage, loading]);

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

  const handleApplyBullet = (bulletPath: string, newText: string) => {
    const match = bulletPath.match(/^(\w+)\[(\d+)\]\.bullets\[(\d+)\]$/);
    if (!match) return;
    const [, section, si, bi] = match;
    const sIdx = parseInt(si), bIdx = parseInt(bi);
    if (section === "experience") {
      const updated = [...cv.experience];
      if (updated[sIdx]?.bullets?.[bIdx] !== undefined) {
        updated[sIdx] = { ...updated[sIdx], bullets: updated[sIdx].bullets.map((b, i) => i === bIdx ? newText : b) };
        updateCv("experience", updated);
      }
    } else if (section === "projects") {
      const updated = [...cv.projects];
      if (updated[sIdx]?.bullets?.[bIdx] !== undefined) {
        updated[sIdx] = { ...updated[sIdx], bullets: updated[sIdx].bullets.map((b, i) => i === bIdx ? newText : b) };
        updateCv("projects", updated);
      }
    }
  };

  const enabledSections = [...cv.sections].sort((a, b) => a.order - b.order).filter(s => s.enabled);

  const scrollToSection = (type: string) => {
    setActiveSection(type);
    document.getElementById(`section-${type}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">{t("loading")}</p></div>;

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Top bar */}
      <nav className="border-b border-border bg-card/80 backdrop-blur-sm flex-shrink-0 z-50">
        <div className="flex items-center justify-between h-12 px-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Input value={title} onChange={e => setTitle(e.target.value)} className="h-7 w-48 text-xs font-medium border-transparent hover:border-input focus:border-input" />
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1">
              <Globe className="h-3 w-3 text-muted-foreground" />
              <Select value={cvLanguage} onValueChange={(v: "sv" | "en") => setCvLanguage(v)}>
                <SelectTrigger className="h-7 w-20 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sv">Svenska</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowInsights(!showInsights)}>
              {showInsights ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={saveCV} disabled={saving}>
              <Save className="mr-1 h-3 w-3" />{saving ? "Saving..." : "Save"}
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => {
              const safeName = (title || "cv").replace(/[^a-zA-Z0-9åäöÅÄÖ_-]/g, "_");
              exportToPdf(cv, enabledSections, tCv, `${safeName}.pdf`).catch(() => toast({ title: "PDF export failed", variant: "destructive" }));
            }}><FileDown className="mr-1 h-3 w-3" />PDF</Button>
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
          <Button variant="outline" size="sm" className="h-6 text-[10px] border-warning/50" onClick={handleTranslateCV} disabled={translating}>
            {translating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Languages className="h-3 w-3 mr-1" />}
            {translating ? "Translating..." : "Convert all"}
          </Button>
        </div>
      )}

      {/* 3-zone layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Section nav */}
        <aside className="w-48 border-r border-border bg-card/30 overflow-y-auto flex-shrink-0 hidden md:block">
          <SectionNav sections={enabledSections} activeSection={activeSection} onSelect={scrollToSection} cv={cv} cvLanguage={cvLanguage} />
          <div className="px-3 pb-4">
            <Button variant="ghost" size="sm" className="w-full text-xs justify-start" onClick={() => setShowPreview(!showPreview)}>
              {showPreview ? "Hide preview" : "Show preview"}
            </Button>
          </div>
        </aside>

        {/* Center: Editing */}
        <main className="flex-1 overflow-y-auto">
          <ScrollArea className="h-full">
            <div className="max-w-2xl mx-auto p-6 space-y-6">
              {enabledSections.map(section => (
                <div key={section.id} id={`section-${section.type}`}>
                  <SectionFormRenderer sectionType={section.type} cv={cv} updateCv={updateCv} t={t} cvLanguage={cvLanguage} />
                </div>
              ))}

              {/* Section management */}
              <div className="border-t border-border pt-6">
                <p className="text-xs font-semibold uppercase text-muted-foreground mb-3">Manage sections</p>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={cv.sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
                    {[...cv.sections].sort((a, b) => a.order - b.order).map(section => (
                      <SortableSectionItem key={section.id} section={section} t={t} onToggle={toggleSection} />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>

              {/* Inline preview */}
              {showPreview && (
                <div className="border-t border-border pt-6">
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-4">Preview</p>
                  <div className="bg-muted/50 p-4 rounded-lg flex justify-center overflow-auto">
                    <div className="transform scale-[0.6] origin-top">
                      <A4Preview cv={cv} enabledSections={enabledSections} t={tCv} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </main>

        {/* Right: Insights */}
        {showInsights && (
          <aside className="w-72 border-l border-border bg-card/30 overflow-y-auto flex-shrink-0 hidden lg:block">
            <ScrollArea className="h-full">
              <InsightsPanel
                cv={cv}
                cvLanguage={cvLanguage}
                t={t}
                jobPostingText={flow.jobPostingText || undefined}
                onApplyBullet={handleApplyBullet}
                onNavigateToSection={scrollToSection}
              />
            </ScrollArea>
          </aside>
        )}
      </div>
    </div>
  );
};

export default CVEditor;
