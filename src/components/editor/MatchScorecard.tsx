import { CompetenceTheme } from "@/types/ats-check";
import { computeMatchScore, biggestGap } from "@/lib/match-score";

interface Props {
  themes?: CompetenceTheme[] | null;
  knockouts?: string[] | null;
  /** Shown when themes carry no ratings (older scans). */
  fallbackScore?: number;
  fallbackGrade?: string;
  isSv: boolean;
}

/**
 * Read-only recruiter scorecard — the ONE visual language for match results, used in the
 * Apply report (and mirrored by the editor's interactive panel): Matchpoäng, biggest gap,
 * knockout gate, and theme rows with rating dots.
 */
export function MatchScorecard({ themes, knockouts, fallbackScore, fallbackGrade, isSv }: Props) {
  const list = themes || [];
  const score = computeMatchScore(list);
  const gap = biggestGap(list);
  const scoreColor = (s: number) => (s >= 75 ? "text-green-600" : s >= 50 ? "text-warning" : "text-destructive");
  const ratingOf = (t: CompetenceTheme) =>
    Math.max(1, Math.min(5, Math.round(t.rating ?? (t.evidence === "strong" ? 4 : t.evidence === "missing" ? 1 : 3))));

  return (
    <div className="space-y-3">
      {/* Score */}
      <div className="text-center">
        {score !== null ? (
          <>
            <div className={`font-serif text-4xl font-medium ${scoreColor(score)}`}>{score}</div>
            <p className="text-xs font-semibold text-muted-foreground">{isSv ? "Matchpoäng · viktad kompetensmatchning" : "Match score · weighted competency match"}</p>
            {gap && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {isSv ? "Störst gap:" : "Biggest gap:"} <span className="font-medium text-foreground">{gap.theme}</span>
              </p>
            )}
          </>
        ) : fallbackScore !== undefined ? (
          <>
            <div className={`font-serif text-4xl font-medium ${scoreColor(fallbackScore)}`}>{Math.round(fallbackScore)}</div>
            <p className="text-xs font-semibold text-muted-foreground">{isSv ? "ATS-poäng" : "ATS score"}{fallbackGrade ? ` · ${isSv ? "betyg" : "grade"} ${fallbackGrade}` : ""}</p>
          </>
        ) : null}
      </div>

      {/* Knockout gate */}
      {(knockouts?.length ?? 0) > 0 && (
        <div className="space-y-1 rounded-lg border border-warning/40 bg-warning/5 p-3">
          <p className="text-xs font-semibold">{isSv ? "Hårda krav — svara ärligt i ansökan" : "Hard requirements — answer honestly in the application"}</p>
          <p className="text-[10px] text-muted-foreground">{isSv ? "De enda automatiska avslagen. CV-formuleringar hjälper inte här." : "The only automatic rejections. CV wording can't help here."}</p>
          <ul className="list-disc pl-4 text-xs">{knockouts!.map(k => <li key={k}>{k}</li>)}</ul>
        </div>
      )}

      {/* Theme rows — musts first, weakest first */}
      {list.length > 0 && (
        <div className="space-y-1.5">
          {[...list]
            .sort((a, b) => ((a.importance === "must" ? 0 : 1) - (b.importance === "must" ? 0 : 1)) || (ratingOf(a) - ratingOf(b)))
            .map((t, i) => {
              const r = ratingOf(t);
              return (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{t.theme}</span>
                  {t.importance === "must" && (
                    <span className="flex-shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">{isSv ? "Krav" : "Must"}</span>
                  )}
                  <span className="flex flex-shrink-0 items-center gap-0.5" title={`${r}/5`}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <span key={n} className={`h-1.5 w-1.5 rounded-full ${n <= r ? (r >= 4 ? "bg-green-600" : r >= 2 ? "bg-warning" : "bg-destructive") : "bg-muted"}`} />
                    ))}
                  </span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
