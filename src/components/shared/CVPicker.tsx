import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CVContent } from "@/types/cv";
import { CVUploadZone } from "./CVUploadZone";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SavedResume {
  id: string;
  title: string;
  updated_at: string;
  content_json: any;
}

interface Props {
  onParsed: (cv: CVContent, resumeId?: string) => void;
  className?: string;
}

export function CVPicker({ onParsed, className }: Props) {
  const { user } = useAuth();
  const [savedCVs, setSavedCVs] = useState<SavedResume[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("resumes")
      .select("id, title, updated_at, content_json")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setSavedCVs(data || []);
        setLoading(false);
      });
  }, [user]);

  const pickSaved = (resume: SavedResume) => {
    setLoadingId(resume.id);
    // Small delay for UX feedback
    setTimeout(() => {
      onParsed(resume.content_json as CVContent, resume.id);
      setLoadingId(null);
    }, 200);
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Existing CVs */}
      {!loading && savedCVs.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Use an existing CV</p>
          <div className="grid gap-2">
            {savedCVs.map(cv => (
              <button
                key={cv.id}
                onClick={() => pickSaved(cv)}
                disabled={!!loadingId}
                className="w-full flex items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50"
              >
                <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{cv.title}</p>
                  <p className="text-[10px] text-muted-foreground">Updated {formatDate(cv.updated_at)}</p>
                </div>
                {loadingId === cv.id ? (
                  <Loader2 className="h-4 w-4 text-primary animate-spin flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Divider */}
      {!loading && savedCVs.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or upload a new one</span>
          <div className="h-px flex-1 bg-border" />
        </div>
      )}

      {/* Upload zone */}
      <CVUploadZone onParsed={(cv) => onParsed(cv)} />
    </div>
  );
}
