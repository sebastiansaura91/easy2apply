import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Loader2 } from "lucide-react";
import { CVMeta } from "@/types/cv";
import { format } from "date-fns";

interface EvidenceItem { keyword: string; answer: string; at: string; cvTitle: string }

/** One competence on the map, aggregated across every CV and scan. */
interface ThemeAgg {
  name: string;
  /** Best rating (1–5) seen in any scan, null when never rated. */
  best: number | null;
  scans: number;
  /** How many job ads demanded this as a must / nice-to-have. */
  must: number;
  nice: number;
  evidence: EvidenceItem[];
  cvs: Set<string>;
}

const normKey = (s: string) => s.toLowerCase().trim();

/**
 * The competence map: your permanent supply side. Every ad is demand; this page
 * aggregates what every scan and every verified answer has established about you,
 * independent of any single CV.
 */
export default function Profile() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const isSv = language === "sv";
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<{ title: string; meta: CVMeta }[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("resumes")
        .select("title, content_json")
        .order("updated_at", { ascending: false });
      setRows((data || []).map((r: any) => ({ title: r.title, meta: (r.content_json?.__meta || {}) as CVMeta })));
      setLoading(false);
    })();
  }, [user]);

  const { themes, evidenceCount, cvCount } = useMemo(() => {
    const map = new Map<string, ThemeAgg>();
    const get = (name: string) => {
      const k = normKey(name);
      if (!map.has(k)) map.set(k, { name, best: null, scans: 0, must: 0, nice: 0, evidence: [], cvs: new Set() });
      return map.get(k)!;
    };
    let evTotal = 0;
    const cvsSeen = new Set<string>();

    for (const { title, meta } of rows) {
      for (const t of meta.demandProfile?.competence_themes || []) {
        const agg = get(t.theme);
        if (t.importance === "must") agg.must++; else agg.nice++;
        agg.cvs.add(title);
        cvsSeen.add(title);
      }
      const scanned = (meta.lastAtsResult?.result as any)?.job_language_match?.competence_themes || [];
      for (const t of scanned) {
        const r = Math.round(t.rating ?? (t.evidence === "strong" ? 4 : t.evidence === "missing" ? 1 : 3));
        const agg = get(t.theme);
        agg.scans++;
        agg.best = agg.best === null ? r : Math.max(agg.best, r);
        agg.cvs.add(title);
        cvsSeen.add(title);
      }
      for (const ev of meta.verifiedEvidence || []) {
        evTotal++;
        const kwKey = normKey(ev.keyword);
        // Attach to a matching theme when one exists; otherwise the keyword is its own card.
        const hit = Array.from(map.keys()).find(k => k === kwKey || k.includes(kwKey) || kwKey.includes(k));
        const agg = hit ? map.get(hit)! : get(ev.keyword);
        agg.evidence.push({ ...ev, cvTitle: title });
        agg.cvs.add(title);
        cvsSeen.add(title);
      }
    }

    const list = Array.from(map.values()).sort((a, b) =>
      ((b.best ?? 0) - (a.best ?? 0)) || (b.evidence.length - a.evidence.length) || (b.must - a.must));
    return { themes: list, evidenceCount: evTotal, cvCount: cvsSeen.size };
  }, [rows]);

  const toggle = (name: string) => setOpen(prev => {
    const n = new Set(prev);
    n.has(name) ? n.delete(name) : n.add(name);
    return n;
  });

  const dotColor = (r: number) => (r >= 4 ? "bg-green-600" : r >= 2 ? "bg-warning" : "bg-destructive");

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-3xl px-6 py-12">
          <h1 className="text-2xl font-semibold tracking-tight">{isSv ? "Profilen" : "Profile"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSv ? "Ditt lager av kompetenser, oavsett annons. Byggd ur skanningar och verifierade svar." : "Your competence inventory, independent of any ad. Built from scans and verified answers."}
          </p>
          {!loading && themes.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground tabular-nums">
              {themes.length} {isSv ? "kompetenser" : "competences"} · {evidenceCount} {isSv ? "verifierade bevis" : "verified answers"} · {isSv ? "ur" : "from"} {cvCount} {isSv ? "CV:n" : "CVs"}
            </p>
          )}

          {loading ? (
            <p className="mt-10 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{isSv ? "Bygger kartan…" : "Building the map…"}</p>
          ) : themes.length === 0 ? (
            <div className="mt-10 rounded-2xl border border-dashed border-border p-8 text-center">
              <p className="font-medium">{isSv ? "Kartan är tom än" : "The map is empty so far"}</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                {isSv
                  ? "Den byggs av dina analyser och svar. Skapa en ansökan och kör Förbättra-flödet, varje skanning och varje svar hamnar här."
                  : "It builds from your analyses and answers. Create an application and run the improve flow; every scan and every answer lands here."}
              </p>
            </div>
          ) : (
            <div className="mt-8 space-y-3">
              {themes.map(t => {
                const thin = t.must >= 1 && (t.best ?? 0) < 4;
                const isOpen = open.has(t.name);
                return (
                  <Collapsible key={t.name} open={isOpen} onOpenChange={() => toggle(t.name)}>
                    <div className={`rounded-2xl border p-4 ${thin ? "border-dashed border-warning/60" : "border-border"} bg-card`}>
                      <CollapsibleTrigger asChild>
                        <button type="button" className="flex w-full items-center gap-3 text-left">
                          <div className="min-w-0 flex-1">
                            <p className={`truncate font-medium ${thin ? "text-warning-foreground" : ""}`}>{t.name}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                              {t.evidence.length > 0 && <>{t.evidence.length} {isSv ? "bevis" : "proofs"} · </>}
                              {t.must > 0 && <>{isSv ? "krav i" : "required in"} {t.must} {isSv ? "annonser" : "ads"} · </>}
                              {t.scans > 0 ? <>{t.scans} {isSv ? "skanningar" : "scans"}</> : <>{isSv ? "aldrig skannad" : "never scanned"}</>}
                              {thin && <span className="ml-1 text-warning">· {isSv ? "tunt och efterfrågat" : "thin and in demand"}</span>}
                            </p>
                          </div>
                          <span className="flex items-center gap-1">
                            {t.best !== null
                              ? [1, 2, 3, 4, 5].map(n => (
                                  <span key={n} className={`h-2 w-2 rounded-full ${n <= t.best! ? dotColor(t.best!) : "bg-muted"}`} />
                                ))
                              : <span className="text-xs text-muted-foreground">–</span>}
                          </span>
                          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="mt-3 space-y-2 border-t border-border pt-3">
                          {t.evidence.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              {isSv ? "Inga verifierade svar än. Svara på frågor i Förbättra-flödet så sparas bevisen här." : "No verified answers yet. Answer questions in the improve flow and the proof is stored here."}
                            </p>
                          ) : (
                            t.evidence.map((ev, i) => (
                              <blockquote key={i} className="rounded-r-lg border-l-2 border-primary/50 bg-muted/40 px-3 py-2">
                                <p className="text-sm italic leading-relaxed">"{ev.answer}"</p>
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                  {isSv ? "Verifierat svar" : "Verified answer"} · {ev.cvTitle} · {format(new Date(ev.at), "d MMM yyyy")}
                                </p>
                              </blockquote>
                            ))
                          )}
                          {t.cvs.size > 0 && (
                            <p className="text-[11px] text-muted-foreground">
                              {isSv ? "Förekommer i:" : "Appears in:"} {Array.from(t.cvs).slice(0, 4).join(" · ")}{t.cvs.size > 4 ? ` · +${t.cvs.size - 4}` : ""}
                            </p>
                          )}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
