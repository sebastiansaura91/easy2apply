import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CVContent } from "@/types/cv";
import { CVUploadZone } from "./CVUploadZone";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, ChevronRight, Loader2, Sparkles, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

interface SavedResume {
  id: string;
  title: string;
  updated_at: string;
  content_json: any;
}

interface RankedCV {
  id: string;
  title: string;
  score: number;
  matched: string[];
  missing: string[];
}

interface Props {
  onParsed: (cv: CVContent, resumeId?: string) => void;
  className?: string;
  /** When provided, CVs are auto-scored against this job analysis and the best match is highlighted. */
  jobAnalysis?: any;
}

export function CVPicker({ onParsed, className, jobAnalysis }: Props) {
  const { user } = useAuth();
  const [savedCVs, setSavedCVs] = useState<SavedResume[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [ranking, setRanking] = useState(false);
  const [ranked, setRanked] = useState<Record<string, RankedCV>>({});
  const [bestId, setBestId] = useState<string | null>(null);

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

  // Auto-rank CVs against the job analysis
  useEffect(() => {
    if (!jobAnalysis || savedCVs.length === 0) return;
    let cancelled = false;
    setRanking(true);
    supabase.functions
      .invoke("suggest-best-cv", {
        body: {
          cvs: savedCVs.map((c) => ({ id: c.id, title: c.title, content_json: c.content_json })),
          job_analysis: jobAnalysis,
        },
      })
      .then(({ data, error }) => {
        if (cancelled || error || !data?.ranked) { setRanking(false); return; }
        const map: Record<string, RankedCV> = {};
        for (const r of data.ranked as RankedCV[]) map[r.id] = r;
        setRanked(map);
        setBestId(data.best_id || null);
        setRanking(false);
      });
    return () => { cancelled = true; };
  }, [jobAnalysis, savedCVs]);

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

  // Sort CVs: best match first when ranking exists, otherwise default order
  const orderedCVs = jobAnalysis && Object.keys(ranked).length > 0
    ? [...savedCVs].sort((a, b) => (ranked[b.id]?.score ?? -1) - (ranked[a.id]?.score ?? -1))
    : savedCVs;

  const scoreColor = (s: number) =>
    s >= 75 ? "text-green-600" : s >= 50 ? "text-yellow-600" : "text-muted-foreground";

  return (
    <div className={cn("space-y-4", className)}>
      {/* Existing CVs */}
      {!loading && savedCVs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Use an existing CV</p>
            {jobAnalysis && (
              <span className="text-[10px] flex items-center gap-1 text-primary">
                {ranking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {ranking ? "Scoring CVs..." : "Auto-matched to job"}
              </span>
            )}
          </div>
          <div className="grid gap-2">
            {orderedCVs.map(cv => {
              const r = ranked[cv.id];
              const isBest = jobAnalysis && bestId === cv.id && r && r.score > 0;
              return (
                <button
                  key={cv.id}
                  onClick={() => pickSaved(cv)}
                  disabled={!!loadingId}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-primary/5 disabled:opacity-50",
                    isBest ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:border-primary/50"
                  )}
                >
                  <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{cv.title}</p>
                      {isBest && (
                        <span className="text-[9px] font-semibold uppercase tracking-wide bg-primary text-primary-foreground px-1.5 py-0.5 rounded flex items-center gap-1">
                          <Trophy className="h-2.5 w-2.5" /> Best match
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[10px] text-muted-foreground">Updated {formatDate(cv.updated_at)}</p>
                      {r && (
                        <span className={cn("text-[10px] font-semibold", scoreColor(r.score))}>
                          • {r.score}% match
                        </span>
                      )}
                    </div>
                    {isBest && r && r.matched.length > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-1 truncate">
                        Covers: {r.matched.slice(0, 4).join(", ")}
                      </p>
                    )}
                  </div>
                  {loadingId === cv.id ? (
                    <Loader2 className="h-4 w-4 text-primary animate-spin flex-shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                </button>
              );
            })}
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
