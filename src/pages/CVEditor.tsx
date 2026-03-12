import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLanguage } from "@/i18n/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { CVContent, emptyCV } from "@/types/cv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, FileDown, CheckCircle2, AlertTriangle, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { SortableSectionItem } from "@/components/cv-editor/SortableSectionItem";
import { AtsCheckPanel, runAtsCheck } from "@/components/cv-editor/AtsCheck";
import { A4Preview } from "@/components/cv-editor/A4Preview";
import { SectionFormRenderer } from "@/components/cv-editor/SectionForms";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { cvHeadings } from "@/i18n/cvHeadings";
import { exportToPdf } from "@/lib/export-pdf";

const CVEditor = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();

  const [cv, setCv] = useState<CVContent>(emptyCV);
  const [title, setTitle] = useState("");
  const [cvLanguage, setCvLanguage] = useState<"sv" | "en">("sv");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const saveTimeout = useRef<number | null>(null);
  

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // CV-specific translation for headings based on CV language
  const tCv = useCallback((key: string) => {
    return cvHeadings[cvLanguage]?.[key] || key;
  }, [cvLanguage]);

  useEffect(() => {
    const load = async () => {
      if (!id || !user) return;
      const { data, error } = await supabase
        .from("resumes")
        .select("title, content_json, language")
        .eq("id", id)
        .single();

      if (error || !data) {
        toast({ title: t("error"), variant: "destructive" });
        navigate("/dashboard");
        return;
      }
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
    const { error } = await supabase
      .from("resumes")
      .update({ title, content_json: cv as any, language: cvLanguage, updated_at: new Date().toISOString() })
      .eq("id", id);

    setSaving(false);
    if (error) {
      toast({ title: t("error"), description: error.message, variant: "destructive" });
    }
  }, [id, user, title, cv, cvLanguage, t, toast]);

  // Auto-save with debounce
  useEffect(() => {
    if (loading) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = window.setTimeout(() => saveCV(), 2000);
    return () => { if (saveTimeout.current) clearTimeout(saveTimeout.current); };
  }, [cv, title, cvLanguage, loading]);

  const updateCv = <K extends keyof CVContent>(key: K, value: CVContent[K]) => {
    setCv((prev) => ({ ...prev, [key]: value }));
  };

  const toggleSection = (sectionId: string) => {
    updateCv("sections", cv.sections.map((s) => s.id === sectionId ? { ...s, enabled: !s.enabled } : s));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = cv.sections.findIndex((s) => s.id === active.id);
    const newIdx = cv.sections.findIndex((s) => s.id === over.id);
    updateCv("sections", arrayMove(cv.sections, oldIdx, newIdx).map((s, i) => ({ ...s, order: i })));
  };

  const atsResults = runAtsCheck(cv, t);
  const atsScore = atsResults.filter((c) => c.pass).length;
  const enabledSections = [...cv.sections].sort((a, b) => a.order - b.order).filter((s) => s.enabled);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">{t("loading")}</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Top bar */}
      <nav className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50 flex-shrink-0">
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-8 w-64 text-sm font-medium border-transparent hover:border-input focus:border-input"
            />
          </div>
          <div className="flex items-center gap-2">
            {/* CV Language selector */}
            <div className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              <Select value={cvLanguage} onValueChange={(v: "sv" | "en") => setCvLanguage(v)}>
                <SelectTrigger className="h-8 w-24 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sv">Svenska</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Badge variant={atsScore === atsResults.length ? "default" : "secondary"} className="gap-1">
              {atsScore === atsResults.length ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              ATS {atsScore}/{atsResults.length}
            </Badge>
            <Button variant="outline" size="sm" onClick={saveCV} disabled={saving}>
              <Save className="mr-1 h-3 w-3" />
              {saving ? t("editorSaving") : t("editorSave")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast({ title: "DOCX export – kommer snart!" })}>
              <FileDown className="mr-1 h-3 w-3" />
              DOCX
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
              const safeName = (title || "cv").replace(/[^a-zA-Z0-9åäöÅÄÖ_-]/g, "_");
              exportToPdf(cv, enabledSections, tCv, `${safeName}.pdf`).catch(() =>
                toast({ title: "PDF-export misslyckades", variant: "destructive" })
              );
            }}>
              <FileDown className="mr-1 h-3 w-3" />
              PDF
            </Button>
          </div>
        </div>
      </nav>

      {/* Main Editor with resizable panels */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Left: Form */}
        <ResizablePanel defaultSize={50} minSize={30} maxSize={70}>
          <ScrollArea className="h-full">
            <div className="p-6 space-y-6">
              <Tabs defaultValue="edit">
                <TabsList className="w-full">
                  <TabsTrigger value="edit" className="flex-1">Redigera</TabsTrigger>
                  <TabsTrigger value="sections" className="flex-1">Sektioner</TabsTrigger>
                  <TabsTrigger value="ats" className="flex-1">ATS-kontroll</TabsTrigger>
                </TabsList>

                <TabsContent value="sections" className="space-y-2 mt-4">
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={cv.sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                      {[...cv.sections].sort((a, b) => a.order - b.order).map((section) => (
                        <SortableSectionItem key={section.id} section={section} t={t} onToggle={toggleSection} />
                      ))}
                    </SortableContext>
                  </DndContext>
                </TabsContent>

                <TabsContent value="ats" className="mt-4">
                  <AtsCheckPanel cv={cv} t={t} cvLanguage={cvLanguage} />
                </TabsContent>

                <TabsContent value="edit" className="space-y-6 mt-4">
                  {enabledSections.map((section) => (
                    <SectionFormRenderer key={section.id} sectionType={section.type} cv={cv} updateCv={updateCv} t={t} cvLanguage={cvLanguage} />
                  ))}
                </TabsContent>
              </Tabs>
            </div>
          </ScrollArea>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right: A4 Preview */}
        <ResizablePanel defaultSize={50} minSize={30} maxSize={70}>
          <ScrollArea className="h-full">
            <div className="bg-muted/50 p-8 flex justify-center min-h-full">
              <A4Preview ref={previewRef} cv={cv} enabledSections={enabledSections} t={tCv} />
            </div>
          </ScrollArea>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default CVEditor;
