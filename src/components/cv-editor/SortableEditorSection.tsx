import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight, Eye, EyeOff, GripVertical } from "lucide-react";
import { CVSection } from "@/types/cv";

interface Props {
  section: CVSection;
  title: string;
  isOpen: boolean;
  onToggleOpen: () => void;
  onToggleEnabled: () => void;
  hiddenLabel: string;
  toggleTitle: string;
  children: ReactNode;
}

/**
 * One unified section row: drag handle (reorder) + chevron (expand to edit) + eye
 * (show/hide in the CV). Replaces the old split between a collapsible list and a
 * separate "reorder sections" list.
 */
export function SortableEditorSection({
  section, title, isOpen, onToggleOpen, onToggleEnabled, hiddenLabel, toggleTitle, children,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.9 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="bg-card">
      <Collapsible open={isOpen} onOpenChange={onToggleOpen}>
        <div className="flex h-12 items-center gap-1 px-2 sm:px-3">
          <button
            type="button"
            className="flex h-9 w-7 flex-shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground/60 hover:text-muted-foreground active:cursor-grabbing"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <ChevronRight className={`h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
            <span className="truncate text-sm font-medium text-primary">{title}</span>
            {!section.enabled && <span className="flex-shrink-0 text-[10px] text-muted-foreground">({hiddenLabel})</span>}
          </CollapsibleTrigger>
          <button
            type="button"
            onClick={onToggleEnabled}
            title={toggleTitle}
            aria-label={toggleTitle}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {section.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
        </div>
        <CollapsibleContent>
          <div className="border-t border-border px-4 py-4 [&_.card]:border-0">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
