import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { CVSection } from "@/types/cv";

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

export { sectionLabelKey };

export function SortableSectionItem({ section, t, onToggle }: { section: CVSection; t: (k: any) => string; onToggle: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: section.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 p-3 rounded-lg bg-card border border-border hover:border-primary/30 transition-colors">
      <div {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground transition-colors">
        <GripVertical className="h-4 w-4" />
      </div>
      <span className="flex-1 text-sm font-medium">{t(sectionLabelKey[section.type] as any)}</span>
      <Switch checked={section.enabled} onCheckedChange={() => onToggle(section.id)} />
    </div>
  );
}
