import { useMemo } from "react";
import { CVContent, CVSection } from "@/types/cv";
import { findCvIssues } from "@/lib/cv-quality";
import { User, FileText, Briefcase, GraduationCap, Wrench, Award, FolderKanban, Globe, MoreHorizontal, AlertOctagon, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const sectionMeta: Record<string, { icon: typeof User; label: string }> = {
  contact: { icon: User, label: "Contact" },
  profile: { icon: FileText, label: "Profile" },
  experience: { icon: Briefcase, label: "Experience" },
  education: { icon: GraduationCap, label: "Education" },
  skills: { icon: Wrench, label: "Skills" },
  certifications: { icon: Award, label: "Certifications" },
  projects: { icon: FolderKanban, label: "Projects" },
  languages: { icon: Globe, label: "Languages" },
  other: { icon: MoreHorizontal, label: "Other" },
};

function hasContent(cv: CVContent, type: string): boolean {
  switch (type) {
    case "contact": return !!(cv.contact.name || cv.contact.email);
    case "profile": return cv.profile.length > 0;
    case "experience": return cv.experience.length > 0;
    case "education": return cv.education.length > 0;
    case "skills": return cv.skills.length > 0;
    case "certifications": return cv.certifications.length > 0;
    case "projects": return cv.projects.length > 0;
    case "languages": return cv.languages.length > 0;
    case "other": return cv.other.length > 0;
    default: return false;
  }
}

interface Props {
  sections: CVSection[];
  activeSection: string;
  onSelect: (type: string) => void;
  cv: CVContent;
  cvLanguage?: "sv" | "en";
}

export function SectionNav({ sections, activeSection, onSelect, cv, cvLanguage = "sv" }: Props) {
  const issues = useMemo(() => findCvIssues(cv, cvLanguage), [cv, cvLanguage]);

  // Count issues per section
  const issueCounts = useMemo(() => {
    const counts: Record<string, { errors: number; warnings: number }> = {};
    issues.forEach(issue => {
      if (!counts[issue.section]) counts[issue.section] = { errors: 0, warnings: 0 };
      if (issue.severity === "error") counts[issue.section].errors++;
      else if (issue.severity === "warning") counts[issue.section].warnings++;
    });
    return counts;
  }, [issues]);

  return (
    <nav className="py-4 px-3 space-y-0.5">
      <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider px-2 mb-2">Sections</p>
      {sections.map(s => {
        const meta = sectionMeta[s.type] || { icon: MoreHorizontal, label: s.type };
        const Icon = meta.icon;
        const filled = hasContent(cv, s.type);
        const active = activeSection === s.type;
        const sectionIssues = issueCounts[s.type];
        const hasErrors = sectionIssues?.errors > 0;
        const hasWarnings = sectionIssues?.warnings > 0;

        return (
          <button key={s.id} onClick={() => onSelect(s.type)}
            className={cn(
              "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors",
              active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}>
            <Icon className="h-4 w-4 flex-shrink-0" />
            <span className="truncate text-left flex-1">{meta.label}</span>
            {hasErrors ? (
              <span className="flex items-center gap-0.5 text-destructive">
                <AlertOctagon className="h-3 w-3" />
                <span className="text-[9px] font-bold">{sectionIssues.errors}</span>
              </span>
            ) : hasWarnings ? (
              <span className="flex items-center gap-0.5 text-warning">
                <AlertTriangle className="h-3 w-3" />
                <span className="text-[9px] font-bold">{sectionIssues.warnings}</span>
              </span>
            ) : filled ? (
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 flex-shrink-0" />
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
