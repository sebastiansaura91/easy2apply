import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Trash2, X, Lightbulb } from "lucide-react";
import { CVContent, ExperienceItem, EducationItem } from "@/types/cv";
import { v4 as uuidv4 } from "uuid";

const bulletTips = [
  "💡 Kvantifiera resultat: \"Ökade försäljningen med 25% på 6 månader\"",
  "📊 Använd KPI:er: omsättning, NPS, konverteringsgrad, kostnadsbesparingar",
  "👥 Personalansvar? Ange antal: \"Ledde ett team på 8 personer\"",
  "🎯 Nämn specifika projekt och din roll: \"Projektledare för ERP-implementation\"",
  "🔧 Nämn verktyg och metoder: Agile, SAP, Power BI, etc.",
  "📈 Visa förändring: \"Från X till Y\" visar tydlig påverkan",
  "⏱️ Tidsramar stärker trovärdigheten: \"på 3 månader\", \"under Q2 2024\"",
];

interface SectionFormProps {
  cv: CVContent;
  updateCv: <K extends keyof CVContent>(key: K, value: CVContent[K]) => void;
  t: (k: any) => string;
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

export function ProfileForm({ cv, updateCv, t }: SectionFormProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("sectionProfile")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Textarea rows={4} value={cv.profile} onChange={(e) => updateCv("profile", e.target.value)} placeholder="Skriv en kort professionell sammanfattning..." />
      </CardContent>
    </Card>
  );
}

export function ExperienceForm({ cv, updateCv, t }: SectionFormProps) {
  const addExperience = () => {
    updateCv("experience", [...cv.experience, { id: uuidv4(), title: "", company: "", location: "", startDate: "", endDate: "", isPresent: false, bullets: [""] }]);
  };

  const updateExperience = (idx: number, updates: Partial<ExperienceItem>) => {
    updateCv("experience", cv.experience.map((e, i) => i === idx ? { ...e, ...updates } : e));
  };

  const removeExperience = (idx: number) => {
    updateCv("experience", cv.experience.filter((_, i) => i !== idx));
  };

  return (
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
}

export function EducationForm({ cv, updateCv, t }: SectionFormProps) {
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
}

export function SkillsForm({ cv, updateCv, t }: SectionFormProps) {
  const [newSkill, setNewSkill] = useState("");

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
          <Input placeholder="Ny kompetens..." value={newSkill} onChange={(e) => setNewSkill(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())} />
          <Button variant="outline" size="sm" onClick={addSkill}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function CertificationsForm({ cv, updateCv, t }: SectionFormProps) {
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
}

export function LanguagesForm({ cv, updateCv, t }: SectionFormProps) {
  const addLanguage = () => {
    updateCv("languages", [...cv.languages, { id: uuidv4(), language: "", level: "" }]);
  };

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
}

export function OtherForm({ cv, updateCv, t }: SectionFormProps) {
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

export function ProjectsForm({ cv, updateCv, t }: SectionFormProps) {
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
            <Input placeholder="Projektnamn" value={proj.name} onChange={(e) => updateCv("projects", cv.projects.map((p, i) => i === idx ? { ...p, name: e.target.value } : p))} />
            <Textarea placeholder="Beskrivning" rows={2} value={proj.description} onChange={(e) => updateCv("projects", cv.projects.map((p, i) => i === idx ? { ...p, description: e.target.value } : p))} />
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

export function SectionFormRenderer({ sectionType, cv, updateCv, t }: { sectionType: string } & SectionFormProps) {
  const FormComponent = sectionFormMap[sectionType];
  if (!FormComponent) return null;
  return <FormComponent cv={cv} updateCv={updateCv} t={t} />;
}
