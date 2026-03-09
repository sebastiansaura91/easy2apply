import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLanguage } from "@/i18n/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { CVContent, CVSection, ExperienceItem, EducationItem, CertificationItem, ProjectItem, LanguageItem, emptyCV } from "@/types/cv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Shield, ArrowLeft, Save, FileDown, Plus, Trash2, GripVertical, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { v4 as uuidv4 } from "uuid";
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const sectionLabelKey: Record<string, string> = {
  contact: "sectionContact",
  profile: "sectionProfile",
  experience: "sectionExperience",
  education: "sectionEducation",
  skills: "sectionSkills",
  certifications: "sectionCertifications",
  projects: "sectionProjects",
  languages: "sectionLanguages",
  other: "sectionOther",
};

function SortableSectionItem({ section, t, onToggle }: { section: CVSection; t: (k: any) => string; onToggle: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: section.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 p-2 rounded-lg bg-card border border-border">
      <div {...attributes} {...listeners} className="cursor-grab text-muted-foreground">
        <GripVertical className="h-4 w-4" />
      </div>
      <span className="flex-1 text-sm font-medium">{t(sectionLabelKey[section.type] as any)}</span>
      <Switch checked={section.enabled} onCheckedChange={() => onToggle(section.id)} />
    </div>
  );
}

// ATS Check logic
function runAtsCheck(cv: CVContent, t: (k: any) => string) {
  const checks: { key: string; label: string; pass: boolean; message?: string }[] = [];

  // Check standard headers
  const enabledSections = cv.sections.filter((s) => s.enabled).map((s) => s.type);
  const hasProfile = enabledSections.includes("profile") && cv.profile.length > 0;
  checks.push({ key: "headers", label: t("atsCheckHeaders"), pass: hasProfile });

  // Check date format consistency
  const dates = cv.experience.flatMap((e) => [e.startDate, e.endDate].filter(Boolean));
  const dateFormatOk = dates.every((d) => /^\d{4}-\d{2}$/.test(d));
  checks.push({ key: "dates", label: t("atsCheckDates"), pass: dates.length === 0 || dateFormatOk });

  // Check suspicious chars
  const allText = JSON.stringify(cv);
  const hasSuspicious = /[\t]|(\|.*\|)/.test(allText);
  checks.push({ key: "chars", label: t("atsCheckChars"), pass: !hasSuspicious });

  // Check bullet length
  const allBullets = cv.experience.flatMap((e) => e.bullets).concat(cv.projects.flatMap((p) => p.bullets));
  const longBullets = allBullets.filter((b) => b.length > 200);
  checks.push({ key: "bulletLength", label: t("atsCheckBulletLength"), pass: longBullets.length === 0, message: longBullets.length > 0 ? `${longBullets.length} bullets > 200 tecken` : undefined });

  // Check contact info
  const hasContact = cv.contact.name.length > 0 && cv.contact.email.length > 0;
  checks.push({ key: "contact", label: t("atsCheckContact"), pass: hasContact });

  return checks;
}

const CVEditor = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();

  const [cv, setCv] = useState<CVContent>(emptyCV);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const saveTimeout = useRef<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const load = async () => {
      if (!id || !user) return;
      const { data, error } = await supabase
        .from("resumes")
        .select("title, content_json")
        .eq("id", id)
        .single();

      if (error || !data) {
        toast({ title: t("error"), variant: "destructive" });
        navigate("/dashboard");
        return;
      }
      setTitle(data.title);
      setCv(data.content_json as unknown as CVContent);
      setLoading(false);
    };
    load();
  }, [id, user]);

  const saveCV = useCallback(async () => {
    if (!id || !user) return;
    setSaving(true);
    const { error } = await supabase
      .from("resumes")
      .update({ title, content_json: cv as any, updated_at: new Date().toISOString() })
      .eq("id", id);

    setSaving(false);
    if (error) {
      toast({ title: t("error"), description: error.message, variant: "destructive" });
    }
  }, [id, user, title, cv, t, toast]);

  // Auto-save with debounce
  useEffect(() => {
    if (loading) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = window.setTimeout(() => saveCV(), 2000);
    return () => { if (saveTimeout.current) clearTimeout(saveTimeout.current); };
  }, [cv, title, loading]);

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

  // Experience helpers
  const addExperience = () => {
    updateCv("experience", [...cv.experience, { id: uuidv4(), title: "", company: "", location: "", startDate: "", endDate: "", isPresent: false, bullets: [""] }]);
  };

  const updateExperience = (idx: number, updates: Partial<ExperienceItem>) => {
    updateCv("experience", cv.experience.map((e, i) => i === idx ? { ...e, ...updates } : e));
  };

  const removeExperience = (idx: number) => {
    updateCv("experience", cv.experience.filter((_, i) => i !== idx));
  };

  // Education helpers
  const addEducation = () => {
    updateCv("education", [...cv.education, { id: uuidv4(), degree: "", school: "", field: "", startDate: "", endDate: "" }]);
  };

  const updateEducation = (idx: number, updates: Partial<EducationItem>) => {
    updateCv("education", cv.education.map((e, i) => i === idx ? { ...e, ...updates } : e));
  };

  const removeEducation = (idx: number) => {
    updateCv("education", cv.education.filter((_, i) => i !== idx));
  };

  // Skills helpers
  const [newSkill, setNewSkill] = useState("");
  const addSkill = () => {
    if (!newSkill.trim()) return;
    updateCv("skills", [...cv.skills, newSkill.trim()]);
    setNewSkill("");
  };

  // Certifications
  const addCertification = () => {
    updateCv("certifications", [...cv.certifications, { id: uuidv4(), name: "", issuer: "", date: "" }]);
  };

  // Languages
  const addLanguage = () => {
    updateCv("languages", [...cv.languages, { id: uuidv4(), language: "", level: "" }]);
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
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <nav className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
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
            <Button variant="outline" size="sm" onClick={() => toast({ title: "PDF export – kommer snart!" })}>
              <FileDown className="mr-1 h-3 w-3" />
              PDF
            </Button>
          </div>
        </div>
      </nav>

      {/* Main Editor */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Form */}
        <div className="w-1/2 border-r border-border overflow-y-auto p-6 space-y-6">
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

            <TabsContent value="ats" className="space-y-3 mt-4">
              {atsResults.map((check) => (
                <div key={check.key} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                  {check.pass ? (
                    <CheckCircle2 className="h-5 w-5 text-accent flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{check.label}</p>
                    {check.message && <p className="text-xs text-muted-foreground">{check.message}</p>}
                  </div>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="edit" className="space-y-6 mt-4">
              {enabledSections.map((section) => {
                switch (section.type) {
                  case "contact":
                    return (
                      <Card key={section.id}>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">{t("sectionContact")}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-2 gap-3">
                          <Input placeholder={t("contactName")} value={cv.contact.name} onChange={(e) => updateCv("contact", { ...cv.contact, name: e.target.value })} />
                          <Input placeholder={t("contactEmail")} value={cv.contact.email} onChange={(e) => updateCv("contact", { ...cv.contact, email: e.target.value })} />
                          <Input placeholder={t("contactPhone")} value={cv.contact.phone} onChange={(e) => updateCv("contact", { ...cv.contact, phone: e.target.value })} />
                          <Input placeholder={t("contactCity")} value={cv.contact.city} onChange={(e) => updateCv("contact", { ...cv.contact, city: e.target.value })} />
                          <Input placeholder={t("contactLinkedin")} value={cv.contact.linkedin} onChange={(e) => updateCv("contact", { ...cv.contact, linkedin: e.target.value })} />
                          <Input placeholder={t("contactWebsite")} value={cv.contact.website} onChange={(e) => updateCv("contact", { ...cv.contact, website: e.target.value })} />
                        </CardContent>
                      </Card>
                    );
                  case "profile":
                    return (
                      <Card key={section.id}>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">{t("sectionProfile")}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Textarea rows={4} value={cv.profile} onChange={(e) => updateCv("profile", e.target.value)} placeholder="Skriv en kort professionell sammanfattning..." />
                        </CardContent>
                      </Card>
                    );
                  case "experience":
                    return (
                      <Card key={section.id}>
                        <CardHeader className="pb-3 flex flex-row items-center justify-between">
                          <CardTitle className="text-base">{t("sectionExperience")}</CardTitle>
                          <Button variant="ghost" size="sm" onClick={addExperience}>
                            <Plus className="h-4 w-4 mr-1" />
                            {t("editorAddItem")}
                          </Button>
                        </CardHeader>
                        <CardContent className="space-y-6">
                          {cv.experience.map((exp, idx) => (
                            <div key={exp.id} className="space-y-3 pb-4 border-b border-border last:border-0">
                              <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-muted-foreground">#{idx + 1}</span>
                                <Button variant="ghost" size="icon" onClick={() => removeExperience(idx)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <Input placeholder={t("expTitle")} value={exp.title} onChange={(e) => updateExperience(idx, { title: e.target.value })} />
                                <Input placeholder={t("expCompany")} value={exp.company} onChange={(e) => updateExperience(idx, { company: e.target.value })} />
                                <Input placeholder={t("expLocation")} value={exp.location} onChange={(e) => updateExperience(idx, { location: e.target.value })} />
                                <div />
                                <Input type="month" placeholder={t("expStartDate")} value={exp.startDate} onChange={(e) => updateExperience(idx, { startDate: e.target.value })} />
                                {!exp.isPresent && (
                                  <Input type="month" placeholder={t("expEndDate")} value={exp.endDate} onChange={(e) => updateExperience(idx, { endDate: e.target.value })} />
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Checkbox checked={exp.isPresent} onCheckedChange={(v) => updateExperience(idx, { isPresent: !!v, endDate: "" })} />
                                <span className="text-sm">{t("expPresent")}</span>
                              </div>
                              <div className="space-y-2">
                                <span className="text-sm font-medium">{t("expBullets")}</span>
                                {exp.bullets.map((bullet, bIdx) => (
                                  <div key={bIdx} className="flex gap-2">
                                    <span className="text-muted-foreground mt-2">•</span>
                                    <Textarea
                                      rows={2}
                                      value={bullet}
                                      onChange={(e) => {
                                        const newBullets = [...exp.bullets];
                                        newBullets[bIdx] = e.target.value;
                                        updateExperience(idx, { bullets: newBullets });
                                      }}
                                      className="min-h-[40px]"
                                    />
                                    <Button variant="ghost" size="icon" className="flex-shrink-0 mt-1" onClick={() => {
                                      updateExperience(idx, { bullets: exp.bullets.filter((_, i) => i !== bIdx) });
                                    }}>
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ))}
                                <Button variant="ghost" size="sm" onClick={() => updateExperience(idx, { bullets: [...exp.bullets, ""] })}>
                                  <Plus className="h-3 w-3 mr-1" />
                                  {t("editorAddBullet")}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    );
                  case "education":
                    return (
                      <Card key={section.id}>
                        <CardHeader className="pb-3 flex flex-row items-center justify-between">
                          <CardTitle className="text-base">{t("sectionEducation")}</CardTitle>
                          <Button variant="ghost" size="sm" onClick={addEducation}>
                            <Plus className="h-4 w-4 mr-1" />
                            {t("editorAddItem")}
                          </Button>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {cv.education.map((edu, idx) => (
                            <div key={edu.id} className="space-y-3 pb-4 border-b border-border last:border-0">
                              <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-muted-foreground">#{idx + 1}</span>
                                <Button variant="ghost" size="icon" onClick={() => removeEducation(idx)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <Input placeholder={t("eduDegree")} value={edu.degree} onChange={(e) => updateEducation(idx, { degree: e.target.value })} />
                                <Input placeholder={t("eduSchool")} value={edu.school} onChange={(e) => updateEducation(idx, { school: e.target.value })} />
                                <Input placeholder={t("eduField")} value={edu.field} onChange={(e) => updateEducation(idx, { field: e.target.value })} />
                                <div />
                                <Input type="month" value={edu.startDate} onChange={(e) => updateEducation(idx, { startDate: e.target.value })} />
                                <Input type="month" value={edu.endDate} onChange={(e) => updateEducation(idx, { endDate: e.target.value })} />
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    );
                  case "skills":
                    return (
                      <Card key={section.id}>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">{t("sectionSkills")}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-2 mb-3">
                            {cv.skills.map((skill, idx) => (
                              <Badge key={idx} variant="secondary" className="gap-1 cursor-pointer" onClick={() => updateCv("skills", cv.skills.filter((_, i) => i !== idx))}>
                                {skill}
                                <X className="h-3 w-3" />
                              </Badge>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <Input placeholder="Ny kompetens..." value={newSkill} onChange={(e) => setNewSkill(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())} />
                            <Button variant="outline" size="sm" onClick={addSkill}>
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  case "certifications":
                    return (
                      <Card key={section.id}>
                        <CardHeader className="pb-3 flex flex-row items-center justify-between">
                          <CardTitle className="text-base">{t("sectionCertifications")}</CardTitle>
                          <Button variant="ghost" size="sm" onClick={addCertification}>
                            <Plus className="h-4 w-4 mr-1" />
                            {t("editorAddItem")}
                          </Button>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {cv.certifications.map((cert, idx) => (
                            <div key={cert.id} className="flex gap-2 items-center">
                              <Input placeholder="Certifiering" value={cert.name} onChange={(e) => updateCv("certifications", cv.certifications.map((c, i) => i === idx ? { ...c, name: e.target.value } : c))} />
                              <Input placeholder="Utfärdare" value={cert.issuer} className="w-32" onChange={(e) => updateCv("certifications", cv.certifications.map((c, i) => i === idx ? { ...c, issuer: e.target.value } : c))} />
                              <Input placeholder="År" value={cert.date} className="w-20" onChange={(e) => updateCv("certifications", cv.certifications.map((c, i) => i === idx ? { ...c, date: e.target.value } : c))} />
                              <Button variant="ghost" size="icon" onClick={() => updateCv("certifications", cv.certifications.filter((_, i) => i !== idx))}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    );
                  case "languages":
                    return (
                      <Card key={section.id}>
                        <CardHeader className="pb-3 flex flex-row items-center justify-between">
                          <CardTitle className="text-base">{t("sectionLanguages")}</CardTitle>
                          <Button variant="ghost" size="sm" onClick={addLanguage}>
                            <Plus className="h-4 w-4 mr-1" />
                            {t("editorAddItem")}
                          </Button>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {cv.languages.map((lang, idx) => (
                            <div key={lang.id} className="flex gap-2 items-center">
                              <Input placeholder="Språk" value={lang.language} onChange={(e) => updateCv("languages", cv.languages.map((l, i) => i === idx ? { ...l, language: e.target.value } : l))} />
                              <Input placeholder="Nivå" value={lang.level} onChange={(e) => updateCv("languages", cv.languages.map((l, i) => i === idx ? { ...l, level: e.target.value } : l))} />
                              <Button variant="ghost" size="icon" onClick={() => updateCv("languages", cv.languages.filter((_, i) => i !== idx))}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    );
                  case "other":
                    return (
                      <Card key={section.id}>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">{t("sectionOther")}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Textarea rows={3} value={cv.other} onChange={(e) => updateCv("other", e.target.value)} />
                        </CardContent>
                      </Card>
                    );
                  default:
                    return null;
                }
              })}
            </TabsContent>
          </Tabs>
        </div>

        {/* Right: A4 Preview */}
        <div className="w-1/2 overflow-y-auto bg-muted/50 p-8 flex justify-center">
          <div className="a4-preview" style={{ transform: "scale(0.75)", transformOrigin: "top center" }}>
            {enabledSections.map((section) => {
              switch (section.type) {
                case "contact":
                  return (
                    <div key={section.id}>
                      <h1>{cv.contact.name || "Ditt Namn"}</h1>
                      <p className="contact-line">
                        {[cv.contact.email, cv.contact.phone, cv.contact.city, cv.contact.linkedin, cv.contact.website]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  );
                case "profile":
                  return cv.profile ? (
                    <div key={section.id}>
                      <h2>{t("sectionProfile")}</h2>
                      <p>{cv.profile}</p>
                    </div>
                  ) : null;
                case "experience":
                  return cv.experience.length > 0 ? (
                    <div key={section.id}>
                      <h2>{t("sectionExperience")}</h2>
                      {cv.experience.map((exp) => (
                        <div key={exp.id} style={{ marginBottom: "10pt" }}>
                          <h3>
                            {exp.title}{exp.company ? `, ${exp.company}` : ""}
                            {exp.location ? ` – ${exp.location}` : ""}
                          </h3>
                          <p className="contact-line">
                            {exp.startDate} – {exp.isPresent ? "Nuvarande" : exp.endDate}
                          </p>
                          {exp.bullets.filter(Boolean).length > 0 && (
                            <ul>
                              {exp.bullets.filter(Boolean).map((b, i) => (
                                <li key={i}>{b}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null;
                case "education":
                  return cv.education.length > 0 ? (
                    <div key={section.id}>
                      <h2>{t("sectionEducation")}</h2>
                      {cv.education.map((edu) => (
                        <div key={edu.id} style={{ marginBottom: "8pt" }}>
                          <h3>{edu.degree}{edu.field ? `, ${edu.field}` : ""}</h3>
                          <p className="contact-line">{edu.school} · {edu.startDate} – {edu.endDate}</p>
                        </div>
                      ))}
                    </div>
                  ) : null;
                case "skills":
                  return cv.skills.length > 0 ? (
                    <div key={section.id}>
                      <h2>{t("sectionSkills")}</h2>
                      <p>{cv.skills.join(", ")}</p>
                    </div>
                  ) : null;
                case "certifications":
                  return cv.certifications.length > 0 ? (
                    <div key={section.id}>
                      <h2>{t("sectionCertifications")}</h2>
                      {cv.certifications.map((cert) => (
                        <p key={cert.id}>{cert.name} – {cert.issuer} ({cert.date})</p>
                      ))}
                    </div>
                  ) : null;
                case "projects":
                  return cv.projects.length > 0 ? (
                    <div key={section.id}>
                      <h2>{t("sectionProjects")}</h2>
                      {cv.projects.map((p) => (
                        <div key={p.id}>
                          <h3>{p.name}</h3>
                          <p>{p.description}</p>
                          {p.bullets.length > 0 && <ul>{p.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
                        </div>
                      ))}
                    </div>
                  ) : null;
                case "languages":
                  return cv.languages.length > 0 ? (
                    <div key={section.id}>
                      <h2>{t("sectionLanguages")}</h2>
                      {cv.languages.map((lang) => (
                        <p key={lang.id}>{lang.language} – {lang.level}</p>
                      ))}
                    </div>
                  ) : null;
                case "other":
                  return cv.other ? (
                    <div key={section.id}>
                      <h2>{t("sectionOther")}</h2>
                      <p>{cv.other}</p>
                    </div>
                  ) : null;
                default:
                  return null;
              }
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CVEditor;
