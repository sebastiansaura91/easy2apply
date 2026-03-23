import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ToastAction } from "@/components/ui/toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Trash2, X, Lightbulb, Sparkles, Loader2, Wand2, Check, Undo2, MessageSquarePlus } from "lucide-react";
import { CVContent, ExperienceItem, EducationItem } from "@/types/cv";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BulletWizard } from "./BulletWizard";
import { ExplainWizard } from "./ExplainWizard";
import { analyzeBullet } from "@/lib/cv-quality";

const bulletTipsSv = [
  "💡 Kvantifiera resultat: \"Ökade försäljningen med 25% på 6 månader\"",
  "📊 Använd KPI:er: omsättning, NPS, konverteringsgrad, kostnadsbesparingar",
  "👥 Personalansvar? Ange antal: \"Ledde ett team på 8 personer\"",
  "🎯 Nämn specifika projekt och din roll: \"Projektledare för ERP-implementation\"",
  "🔧 Nämn verktyg och metoder: Agile, SAP, Power BI, etc.",
  "📈 Visa förändring: \"Från X till Y\" visar tydlig påverkan",
  "⏱️ Tidsramar stärker trovärdigheten: \"på 3 månader\", \"under Q2 2024\"",
];

const bulletTipsEn = [
  "💡 Quantify results: \"Increased sales by 25% in 6 months\"",
  "📊 Use KPIs: revenue, NPS, conversion rate, cost savings",
  "👥 People management? State numbers: \"Led a team of 8\"",
  "🎯 Mention specific projects and your role: \"Project lead for ERP implementation\"",
  "🔧 Mention tools and methods: Agile, SAP, Power BI, etc.",
  "📈 Show change: \"From X to Y\" shows clear impact",
  "⏱️ Timeframes add credibility: \"in 3 months\", \"during Q2 2024\"",
];

interface SectionFormProps {
  cv: CVContent;
  updateCv: <K extends keyof CVContent>(key: K, value: CVContent[K]) => void;
  t: (k: any) => string;
  cvLanguage?: "sv" | "en";
}

export function ContactForm({ cv, updateCv, t }: SectionFormProps) {
  return (
    <Card>
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
}

export function ProfileForm({ cv, updateCv, t, cvLanguage }: SectionFormProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("sectionProfile")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Textarea rows={4} value={cv.profile} onChange={(e) => updateCv("profile", e.target.value)} placeholder={cvLanguage === "en" ? "Write a short professional summary..." : "Skriv en kort professionell sammanfattning..."} />
      </CardContent>
    </Card>
  );
}

export function ExperienceForm({ cv, updateCv, t, cvLanguage }: SectionFormProps) {
  const isSv = cvLanguage !== "en";
  const [improvingKey, setImprovingKey] = useState<string | null>(null);
  const [improvingAll, setImprovingAll] = useState<number | null>(null);
  const [wizardExpIdx, setWizardExpIdx] = useState<number | null>(null);
  const [explainExpIdx, setExplainExpIdx] = useState<number | null>(null);
  // Preview state: { expIdx-bulletIdx: { original, improved, reason } }
  const [previews, setPreviews] = useState<Record<string, { original: string; improved: string; reason: string }>>({});
  // "Improve all" preview: expIdx -> array of previews
  const [allPreviews, setAllPreviews] = useState<{ expIdx: number; items: { bulletIdx: number; original: string; improved: string; reason: string }[] } | null>(null);
  const { toast } = useToast();

  const addExperience = () => {
    updateCv("experience", [...cv.experience, { id: uuidv4(), title: "", company: "", location: "", startDate: "", endDate: "", isPresent: false, bullets: [""] }]);
  };

  const updateExperience = (idx: number, updates: Partial<ExperienceItem>) => {
    updateCv("experience", cv.experience.map((e, i) => i === idx ? { ...e, ...updates } : e));
  };

  const removeExperience = (idx: number) => {
    updateCv("experience", cv.experience.filter((_, i) => i !== idx));
  };

  const improveBullet = async (expIdx: number, bulletIdx: number) => {
    const exp = cv.experience[expIdx];
    const bullet = exp.bullets[bulletIdx];
    if (!bullet.trim()) {
      toast({ title: "Skriv något först", description: "Fyll i punkten innan du förbättrar den med AI.", variant: "destructive" });
      return;
    }

    const key = `${expIdx}-${bulletIdx}`;
    setImprovingKey(key);

    try {
      const { data, error } = await supabase.functions.invoke("improve-bullet", {
        body: { bullet, jobTitle: exp.title, company: exp.company, language: cvLanguage || "sv" },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.improved) {
        setPreviews((prev) => ({
          ...prev,
          [key]: { original: bullet, improved: data.improved, reason: data.reason || "Förbättrad formulering." },
        }));
      }
    } catch (err: any) {
      toast({ title: "Kunde inte förbättra", description: err.message || "Något gick fel", variant: "destructive" });
    } finally {
      setImprovingKey(null);
    }
  };

  const acceptPreview = (expIdx: number, bulletIdx: number) => {
    const key = `${expIdx}-${bulletIdx}`;
    const preview = previews[key];
    if (!preview) return;
    const newBullets = [...cv.experience[expIdx].bullets];
    newBullets[bulletIdx] = preview.improved;
    updateExperience(expIdx, { bullets: newBullets });
    setPreviews((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const rejectPreview = (expIdx: number, bulletIdx: number) => {
    const key = `${expIdx}-${bulletIdx}`;
    setPreviews((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const improveAllBullets = async (expIdx: number) => {
    const exp = cv.experience[expIdx];
    const nonEmpty = exp.bullets.map((b, i) => ({ b, i })).filter(({ b }) => b.trim().length > 0);
    if (nonEmpty.length === 0) {
      toast({ title: "Inga punkter att förbättra", variant: "destructive" });
      return;
    }

    setImprovingAll(expIdx);
    const items: { bulletIdx: number; original: string; improved: string; reason: string }[] = [];

    for (const { b, i: bIdx } of nonEmpty) {
      try {
        const { data, error } = await supabase.functions.invoke("improve-bullet", {
          body: { bullet: b, jobTitle: exp.title, company: exp.company, language: cvLanguage || "sv" },
        });
        if (!error && data?.improved) {
          items.push({ bulletIdx: bIdx, original: b, improved: data.improved, reason: data.reason || "Förbättrad formulering." });
        }
      } catch {
        // continue
      }
    }

    setImprovingAll(null);
    if (items.length > 0) {
      setAllPreviews({ expIdx, items });
    } else {
      toast({ title: "Kunde inte förbättra några punkter", variant: "destructive" });
    }
  };

  const acceptAllPreviews = () => {
    if (!allPreviews) return;
    const exp = cv.experience[allPreviews.expIdx];
    const newBullets = [...exp.bullets];
    for (const item of allPreviews.items) {
      newBullets[item.bulletIdx] = item.improved;
    }
    updateExperience(allPreviews.expIdx, { bullets: newBullets });
    toast({ title: `✨ ${allPreviews.items.length} punkter uppdaterade` });
    setAllPreviews(null);
  };

  const acceptSingleFromAll = (itemIdx: number) => {
    if (!allPreviews) return;
    const item = allPreviews.items[itemIdx];
    const exp = cv.experience[allPreviews.expIdx];
    const newBullets = [...exp.bullets];
    newBullets[item.bulletIdx] = item.improved;
    updateExperience(allPreviews.expIdx, { bullets: newBullets });
    const remaining = allPreviews.items.filter((_, i) => i !== itemIdx);
    if (remaining.length === 0) setAllPreviews(null);
    else setAllPreviews({ ...allPreviews, items: remaining });
  };

  const rejectSingleFromAll = (itemIdx: number) => {
    if (!allPreviews) return;
    const remaining = allPreviews.items.filter((_, i) => i !== itemIdx);
    if (remaining.length === 0) setAllPreviews(null);
    else setAllPreviews({ ...allPreviews, items: remaining });
  };

  return (
    <>
      <Card>
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium">{t("expBullets")}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center cursor-help">
                          <Lightbulb className="h-3.5 w-3.5 text-primary/60 hover:text-primary transition-colors" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs space-y-1 p-3">
                        <p className="font-semibold text-xs mb-1.5">{isSv ? "Tips för starka punkter:" : "Tips for strong bullets:"}</p>
                        {(isSv ? bulletTipsSv : bulletTipsEn).map((tip, i) => (
                          <p key={i} className="text-xs leading-relaxed">{tip}</p>
                        ))}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="flex gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => setExplainExpIdx(idx)}
                        >
                          <MessageSquarePlus className="h-3 w-3" />
                          {cvLanguage === "en" ? "Explain what you did" : "Förklara vad du gjorde"}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p className="text-xs">{cvLanguage === "en" ? "Answer questions to generate bullets" : "Svara på frågor för att generera bullets"}</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => improveAllBullets(idx)}
                          disabled={improvingAll === idx}
                        >
                          {improvingAll === idx ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                          {isSv ? "Förbättra alla" : "Improve all"}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p className="text-xs">{isSv ? "Förbättra alla punkter med AI" : "Improve all bullets with AI"}</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => setWizardExpIdx(idx)}
                        >
                          <Wand2 className="h-3 w-3" />
                          {isSv ? "Skapa bullets" : "Create bullets"}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p className="text-xs">{isSv ? "Generera nya bullets med AI-wizard" : "Generate new bullets with AI wizard"}</p></TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                {exp.bullets.map((bullet, bIdx) => {
                  const key = `${idx}-${bIdx}`;
                  const isImproving = improvingKey === key;
                  const preview = previews[key];
                  return (
                    <div key={bIdx} className="space-y-0">
                      {/* Inline bullet quality indicator */}
                      {bullet.trim() && (() => {
                        const quality = analyzeBullet(bullet, cvLanguage || "sv");
                        if (quality.score === "good") return null;
                        return (
                          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-t-md text-[10px] ${quality.score === "weak" ? "bg-destructive/5 text-destructive" : "bg-warning/5 text-warning"}`}>
                            <span className={`inline-block h-1.5 w-1.5 rounded-full flex-shrink-0 ${quality.score === "weak" ? "bg-destructive" : "bg-warning"}`} />
                            {quality.issues.slice(0, 2).join(" · ")}
                          </div>
                        );
                      })()}
                      <div className="flex gap-2">
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
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="flex-shrink-0 mt-1 text-primary/60 hover:text-primary hover:bg-primary/10"
                              onClick={() => improveBullet(idx, bIdx)}
                              disabled={isImproving || !!preview}
                            >
                              {isImproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p className="text-xs">{isSv ? "Förbättra med AI" : "Improve with AI"}</p>
                          </TooltipContent>
                        </Tooltip>
                        <Button variant="ghost" size="icon" className="flex-shrink-0 mt-1" onClick={() => {
                          updateExperience(idx, { bullets: exp.bullets.filter((_, i) => i !== bIdx) });
                        }}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      {/* Inline preview card */}
                      {preview && (
                        <div className="ml-5 mt-1.5 rounded-md border border-primary/20 bg-primary/5 p-3 space-y-2">
                          <div className="flex items-start gap-2">
                            <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <Textarea
                                rows={2}
                                value={preview.improved}
                                onChange={(e) => {
                                  setPreviews((prev) => ({
                                    ...prev,
                                    [key]: { ...prev[key], improved: e.target.value },
                                  }));
                                }}
                                className="min-h-[40px] bg-background/50 text-sm"
                              />
                              <p className="text-xs text-muted-foreground italic">{preview.reason}</p>
                            </div>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => rejectPreview(idx, bIdx)}>
                              <Undo2 className="h-3 w-3 mr-1" />
                              {isSv ? "Behåll original" : "Keep original"}
                            </Button>
                            <Button size="sm" className="h-7 text-xs" onClick={() => acceptPreview(idx, bIdx)}>
                              <Check className="h-3 w-3 mr-1" />
                               {isSv ? "Acceptera" : "Accept"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <Button variant="ghost" size="sm" onClick={() => updateExperience(idx, { bullets: [...exp.bullets, ""] })}>
                  <Plus className="h-3 w-3 mr-1" />
                  {t("editorAddBullet")}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Bullet Wizard Dialog */}
      {wizardExpIdx !== null && (
        <BulletWizard
          open={true}
          onClose={() => setWizardExpIdx(null)}
          jobTitle={cv.experience[wizardExpIdx]?.title || ""}
          company={cv.experience[wizardExpIdx]?.company || ""}
          startDate={cv.experience[wizardExpIdx]?.startDate || ""}
          endDate={cv.experience[wizardExpIdx]?.endDate || ""}
          isPresent={cv.experience[wizardExpIdx]?.isPresent || false}
          language={cvLanguage}
          onAcceptBullets={(bullets) => {
            const exp = cv.experience[wizardExpIdx];
            const existingNonEmpty = exp.bullets.filter((b) => b.trim().length > 0);
            updateExperience(wizardExpIdx, { bullets: [...existingNonEmpty, ...bullets] });
            toast({ title: `✨ ${bullets.length} ${cvLanguage === "en" ? "bullets added" : "bullets tillagda"}`, description: cvLanguage === "en" ? "Review and fill in [FILL IN] placeholders." : "Granska och fyll i [FYLL I]-platshållare." });
          }}
        />
      )}

      {/* Explain Wizard */}
      {explainExpIdx !== null && (
        <ExplainWizard
          open={true}
          onClose={() => setExplainExpIdx(null)}
          jobTitle={cv.experience[explainExpIdx]?.title || ""}
          company={cv.experience[explainExpIdx]?.company || ""}
          language={cvLanguage}
          existingBullets={cv.experience[explainExpIdx]?.bullets || []}
          onAcceptBullets={(bullets, previousBullets) => {
            const idx = explainExpIdx;
            const exp = cv.experience[idx];
            const existingNonEmpty = exp.bullets.filter((b) => b.trim().length > 0);
            updateExperience(idx, { bullets: [...existingNonEmpty, ...bullets] });
            toast({
              title: `✨ ${bullets.length} bullets tillagda`,
              description: cvLanguage === "en" ? "Review and fill in [FILL IN] placeholders." : "Granska och fyll i [FYLL I]-platshållare.",
              action: (
                <ToastAction
                  altText={cvLanguage === "en" ? "Undo" : "Ångra"}
                  onClick={() => {
                    updateExperience(idx, { bullets: previousBullets });
                    toast({ title: cvLanguage === "en" ? "Reverted" : "Ångrade ändringen" });
                  }}
                >
                  {cvLanguage === "en" ? "Undo" : "Ångra"}
                </ToastAction>
              ),
            });
          }}
        />
      )}

      {/* Improve All Preview Dialog */}
      {allPreviews && (
        <Dialog open={true} onOpenChange={() => setAllPreviews(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                {isSv ? "Förhandsgranskning" : "Preview"} – {allPreviews.items.length} {isSv ? "förbättringar" : "improvements"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {allPreviews.items.map((item, i) => (
                <div key={i} className="rounded-md border border-border p-3 space-y-2">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground line-through">{item.original}</p>
                    <Textarea
                      rows={2}
                      value={item.improved}
                      onChange={(e) => {
                        setAllPreviews((prev) => {
                          if (!prev) return prev;
                          const items = [...prev.items];
                          items[i] = { ...items[i], improved: e.target.value };
                          return { ...prev, items };
                        });
                      }}
                      className="min-h-[40px] text-sm"
                    />
                    <p className="text-xs text-muted-foreground italic">{item.reason}</p>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => rejectSingleFromAll(i)}>
                      <X className="h-3 w-3 mr-1" />
                      {isSv ? "Skippa" : "Skip"}
                    </Button>
                    <Button size="sm" className="h-6 text-xs" onClick={() => acceptSingleFromAll(i)}>
                      <Check className="h-3 w-3 mr-1" />
                       {isSv ? "Acceptera" : "Accept"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between pt-2 border-t border-border">
              <Button variant="ghost" onClick={() => setAllPreviews(null)}>{isSv ? "Avbryt" : "Cancel"}</Button>
              <Button onClick={acceptAllPreviews}>
                <Check className="h-4 w-4 mr-1" />
                {isSv ? "Acceptera alla" : "Accept all"} ({allPreviews.items.length})
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export function EducationForm({ cv, updateCv, t, cvLanguage }: SectionFormProps) {
  const isSv = cvLanguage !== "en";
  const addEducation = () => {
    updateCv("education", [...cv.education, { id: uuidv4(), degree: "", school: "", field: "", startDate: "", endDate: "" }]);
  };

  const updateEducation = (idx: number, updates: Partial<EducationItem>) => {
    updateCv("education", cv.education.map((e, i) => i === idx ? { ...e, ...updates } : e));
  };

  const removeEducation = (idx: number) => {
    updateCv("education", cv.education.filter((_, i) => i !== idx));
  };

  return (
    <Card>
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
              <Input placeholder={isSv ? "Examen" : "Degree"} value={edu.degree} onChange={(e) => updateEducation(idx, { degree: e.target.value })} />
              <Input placeholder={isSv ? "Skola" : "School"} value={edu.school} onChange={(e) => updateEducation(idx, { school: e.target.value })} />
              <Input placeholder={isSv ? "Inriktning" : "Field of study"} value={edu.field} onChange={(e) => updateEducation(idx, { field: e.target.value })} />
              <div />
              <Input type="month" value={edu.startDate} onChange={(e) => updateEducation(idx, { startDate: e.target.value })} />
              <Input type="month" value={edu.endDate} onChange={(e) => updateEducation(idx, { endDate: e.target.value })} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function SkillsForm({ cv, updateCv, t, cvLanguage }: SectionFormProps) {
  const [newSkill, setNewSkill] = useState("");
  const isSv = cvLanguage !== "en";
  const addSkill = () => {
    if (!newSkill.trim()) return;
    updateCv("skills", [...cv.skills, newSkill.trim()]);
    setNewSkill("");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("sectionSkills")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-3">
          {cv.skills.map((skill, idx) => (
            <Badge key={idx} variant="secondary" className="gap-1 cursor-pointer hover:bg-destructive/10 transition-colors" onClick={() => updateCv("skills", cv.skills.filter((_, i) => i !== idx))}>
              {skill}
              <X className="h-3 w-3" />
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input placeholder={isSv ? "Ny kompetens..." : "New skill..."} value={newSkill} onChange={(e) => setNewSkill(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())} />
          <Button variant="outline" size="sm" onClick={addSkill}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function CertificationsForm({ cv, updateCv, t, cvLanguage }: SectionFormProps) {
  const isSv = cvLanguage !== "en";
  const addCertification = () => {
    updateCv("certifications", [...cv.certifications, { id: uuidv4(), name: "", issuer: "", date: "" }]);
  };

  return (
    <Card>
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
            <Input placeholder={isSv ? "Certifiering" : "Certification"} value={cert.name} onChange={(e) => updateCv("certifications", cv.certifications.map((c, i) => i === idx ? { ...c, name: e.target.value } : c))} />
            <Input placeholder={isSv ? "Utfärdare" : "Issuer"} value={cert.issuer} className="w-32" onChange={(e) => updateCv("certifications", cv.certifications.map((c, i) => i === idx ? { ...c, issuer: e.target.value } : c))} />
            <Input placeholder={isSv ? "År" : "Year"} value={cert.date} className="w-20" onChange={(e) => updateCv("certifications", cv.certifications.map((c, i) => i === idx ? { ...c, date: e.target.value } : c))} />
            <Button variant="ghost" size="icon" onClick={() => updateCv("certifications", cv.certifications.filter((_, i) => i !== idx))}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const LANGUAGE_LEVELS_SV = [
  { value: "Modersmål", label: "Modersmål" },
  { value: "Flytande", label: "Flytande" },
  { value: "Avancerad", label: "Avancerad" },
  { value: "Övre mellannivå", label: "Övre mellannivå" },
  { value: "Mellannivå", label: "Mellannivå" },
  { value: "Grundläggande", label: "Grundläggande" },
];

const LANGUAGE_LEVELS_EN = [
  { value: "Native speaker", label: "Native speaker" },
  { value: "Fluent", label: "Fluent" },
  { value: "Advanced", label: "Advanced" },
  { value: "Upper intermediate", label: "Upper intermediate" },
  { value: "Intermediate", label: "Intermediate" },
  { value: "Basic", label: "Basic" },
];

export function LanguagesForm({ cv, updateCv, t, cvLanguage }: SectionFormProps) {
  const addLanguage = () => {
    updateCv("languages", [...cv.languages, { id: uuidv4(), language: "", level: "" }]);
  };

  const isSv = cvLanguage === "sv";
  const levels = isSv ? LANGUAGE_LEVELS_SV : LANGUAGE_LEVELS_EN;

  return (
    <Card>
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
            <Input
              className="flex-1"
              placeholder={isSv ? "Språk" : "Language"}
              value={lang.language}
              onChange={(e) => updateCv("languages", cv.languages.map((l, i) => i === idx ? { ...l, language: e.target.value } : l))}
            />
            <Select
              value={levels.some(lv => lv.value === lang.level) ? lang.level : ""}
              onValueChange={(val) => updateCv("languages", cv.languages.map((l, i) => i === idx ? { ...l, level: val } : l))}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={isSv ? "Välj nivå" : "Select level"} />
              </SelectTrigger>
              <SelectContent>
                {levels.map((lv) => (
                  <SelectItem key={lv.value} value={lv.value}>{lv.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" onClick={() => updateCv("languages", cv.languages.filter((_, i) => i !== idx))}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function OtherForm({ cv, updateCv, t, cvLanguage }: SectionFormProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("sectionOther")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Textarea rows={3} value={cv.other} onChange={(e) => updateCv("other", e.target.value)} />
      </CardContent>
    </Card>
  );
}

export function ProjectsForm({ cv, updateCv, t, cvLanguage }: SectionFormProps) {
  const isSv = cvLanguage !== "en";
  const addProject = () => {
    updateCv("projects", [...cv.projects, { id: uuidv4(), name: "", description: "", bullets: [""] }]);
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base">{t("sectionProjects")}</CardTitle>
        <Button variant="ghost" size="sm" onClick={addProject}>
          <Plus className="h-4 w-4 mr-1" />
          {t("editorAddItem")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {cv.projects.map((proj, idx) => (
          <div key={proj.id} className="space-y-3 pb-4 border-b border-border last:border-0">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-muted-foreground">#{idx + 1}</span>
              <Button variant="ghost" size="icon" onClick={() => updateCv("projects", cv.projects.filter((_, i) => i !== idx))}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <Input placeholder={isSv ? "Projektnamn" : "Project name"} value={proj.name} onChange={(e) => updateCv("projects", cv.projects.map((p, i) => i === idx ? { ...p, name: e.target.value } : p))} />
            <Textarea placeholder={isSv ? "Beskrivning" : "Description"} rows={2} value={proj.description} onChange={(e) => updateCv("projects", cv.projects.map((p, i) => i === idx ? { ...p, description: e.target.value } : p))} />
            <div className="space-y-2">
              {proj.bullets.map((bullet, bIdx) => (
                <div key={bIdx} className="flex gap-2">
                  <span className="text-muted-foreground mt-2">•</span>
                  <Textarea
                    rows={2}
                    value={bullet}
                    onChange={(e) => {
                      const newBullets = [...proj.bullets];
                      newBullets[bIdx] = e.target.value;
                      updateCv("projects", cv.projects.map((p, i) => i === idx ? { ...p, bullets: newBullets } : p));
                    }}
                    className="min-h-[40px]"
                  />
                  <Button variant="ghost" size="icon" className="flex-shrink-0 mt-1" onClick={() => {
                    updateCv("projects", cv.projects.map((p, i) => i === idx ? { ...p, bullets: proj.bullets.filter((_, bi) => bi !== bIdx) } : p));
                  }}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => updateCv("projects", cv.projects.map((p, i) => i === idx ? { ...p, bullets: [...proj.bullets, ""] } : p))}>
                <Plus className="h-3 w-3 mr-1" />
                {t("editorAddBullet")}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const sectionFormMap: Record<string, React.ComponentType<SectionFormProps>> = {
  contact: ContactForm,
  profile: ProfileForm,
  experience: ExperienceForm,
  education: EducationForm,
  skills: SkillsForm,
  certifications: CertificationsForm,
  projects: ProjectsForm,
  languages: LanguagesForm,
  other: OtherForm,
};

export function SectionFormRenderer({ sectionType, cv, updateCv, t, cvLanguage }: { sectionType: string } & SectionFormProps) {
  const FormComponent = sectionFormMap[sectionType];
  if (!FormComponent) return null;
  return <FormComponent cv={cv} updateCv={updateCv} t={t} cvLanguage={cvLanguage} />;
}
