import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Loader2, ListChecks, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CVMeta, emptyCV } from "@/types/cv";
import {
  CanonicalCompetence, CompetenceRegistry, REGISTRY_ROW_TITLE, resolveCompetence, normName,
} from "@/lib/competence-registry";
import { format } from "date-fns";

interface Row { id: string; title: string; meta: CVMeta; skills: string[] }
interface EvidenceItem { keyword: string; answer: string; at: string; cvTitle: string }
interface ThemeAgg {
  key: string;
  name: string;
  best: number | null;
  scans: number;
  must: number;
  nice: number;
  evidence: EvidenceItem[];
  cvs: Set<string>;
  aliases: Set<string>;
}

/**
 * The competence map: your permanent supply side, grouped by the canonical
 * registry when one exists. Ads are demand; this page is what you have,
 * independent of any single CV.
 */
export default function Profile() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { toast } = useToast();
  const isSv = language === "sv";
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [building, setBuilding] = useState(false);
  const [saving, setSaving] = useState(false);
  // Proposed registry under review — the user edits names and aliases before saving.
  const [draft, setDraft] = useState<CanonicalCompetence[] | null>(null);

  const fetchRows = useCallback(async () => {
    const { data } = await supabase
      .from("resumes")
      .select("id, title, content_json")
      .order("updated_at", { ascending: false });
    setRows((data || []).map((r: any) => ({
      id: r.id,
      title: r.title,
      meta: (r.content_json?.__meta || {}) as CVMeta,
      skills: Array.isArray(r.content_json?.skills) ? r.content_json.skills : [],
    })));
    setLoading(false);
  }, []);

  useEffect(() => { if (user) fetchRows(); }, [user, fetchRows]);

  const registryRow = rows.find(r => r.meta.isRegistryRow);
  const registry: CompetenceRegistry | null = registryRow?.meta.competenceRegistry || null;
  const cvRows = useMemo(() => rows.filter(r => !r.meta.isRegistryRow), [rows]);

  const { themes, evidenceCount, cvCount } = useMemo(() => {
    const map = new Map<string, ThemeAgg>();
    const get = (rawName: string) => {
      const c = resolveCompetence(registry, rawName);
      const key = c ? `id:${c.id}` : `raw:${normName(rawName)}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: c ? (isSv ? c.name_sv : c.name_en) : rawName,
          best: null, scans: 0, must: 0, nice: 0, evidence: [], cvs: new Set(), aliases: new Set(),
        });
      }
      const agg = map.get(key)!;
      if (normName(rawName) !== normName(agg.name)) agg.aliases.add(rawName);
      return agg;
    };
    let evTotal = 0;
    const cvsSeen = new Set<string>();

    for (const { title, meta } of cvRows) {
      for (const t of meta.demandProfile?.competence_themes || []) {
        const agg = get(t.theme);
        if (t.importance === "must") agg.must++; else agg.nice++;
        agg.cvs.add(title); cvsSeen.add(title);
      }
      const scanned = (meta.lastAtsResult?.result as any)?.job_language_match?.competence_themes || [];
      for (const t of scanned) {
        const r = Math.round(t.rating ?? (t.evidence === "strong" ? 4 : t.evidence === "missing" ? 1 : 3));
        const agg = get(t.theme);
        agg.scans++;
        agg.best = agg.best === null ? r : Math.max(agg.best, r);
        agg.cvs.add(title); cvsSeen.add(title);
      }
      for (const ev of meta.verifiedEvidence || []) {
        const agg = get(ev.keyword);
        // Reused answers are copied into each CV that used them — show the quote once.
        if (!agg.evidence.some(e => e.answer === ev.answer)) {
          evTotal++;
          agg.evidence.push({ ...ev, cvTitle: title });
        }
        agg.cvs.add(title); cvsSeen.add(title);
      }
    }

    const list = Array.from(map.values()).sort((a, b) =>
      ((b.best ?? 0) - (a.best ?? 0)) || (b.evidence.length - a.evidence.length) || (b.must - a.must));
    return { themes: list, evidenceCount: evTotal, cvCount: cvsSeen.size };
  }, [cvRows, registry, isSv]);

  /** Every raw signal the registry should organise. */
  const collectSignals = () => {
    const out = new Set<string>();
    for (const { meta, skills } of cvRows) {
      for (const t of meta.demandProfile?.competence_themes || []) out.add(t.theme);
      const scanned = (meta.lastAtsResult?.result as any)?.job_language_match?.competence_themes || [];
      for (const t of scanned) out.add(t.theme);
      for (const ev of meta.verifiedEvidence || []) out.add(ev.keyword);
      for (const s of skills) out.add(s);
    }
    return Array.from(out).filter(Boolean);
  };

  const buildRegistry = async () => {
    const signals = collectSignals();
    if (signals.length < 3) {
      toast({ title: isSv ? "För lite underlag" : "Not enough signals", description: isSv ? "Kör några analyser först så finns det något att bygga av." : "Run a few analyses first so there is something to build from." });
      return;
    }
    setBuilding(true);
    try {
      const { data, error } = await supabase.functions.invoke("build-competence-registry", { body: { signals } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setDraft(data.competences || []);
    } catch (e: any) {
      toast({ title: isSv ? "Kunde inte bygga registret" : "Couldn't build the registry", description: e.message, variant: "destructive" });
    } finally { setBuilding(false); }
  };

  const saveRegistry = async () => {
    if (!draft || !user) return;
    const cleaned = draft.filter(c => c.name_sv.trim() && c.name_en.trim());
    const reg: CompetenceRegistry = { version: (registry?.version || 0) + 1, updatedAt: new Date().toISOString(), competences: cleaned };
    setSaving(true);
    try {
      if (registryRow) {
        const { data } = await supabase.from("resumes").select("content_json").eq("id", registryRow.id).single();
        const content = { ...((data?.content_json as any) || emptyCV), __meta: { ...(data?.content_json as any)?.__meta, isRegistryRow: true, competenceRegistry: reg } };
        const { error } = await supabase.from("resumes").update({ content_json: content }).eq("id", registryRow.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("resumes").insert({
          id: crypto.randomUUID(), user_id: user.id, title: REGISTRY_ROW_TITLE, language: "sv", template_id: "default",
          content_json: { ...emptyCV, __meta: { isRegistryRow: true, competenceRegistry: reg } } as any,
        });
        if (error) throw error;
      }
      setDraft(null);
      toast({ title: isSv ? "Registret sparat" : "Registry saved", description: isSv ? `${cleaned.length} kompetenser. Kartan och nya annonser använder det nu.` : `${cleaned.length} competences. The map and new ads use it now.` });
      fetchRows();
    } catch (e: any) {
      toast({ title: isSv ? "Kunde inte spara" : "Couldn't save", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const editDraft = (i: number, patch: Partial<CanonicalCompetence>) =>
    setDraft(prev => prev ? prev.map((c, j) => j === i ? { ...c, ...patch } : c) : prev);

  const toggle = (key: string) => setOpen(prev => {
    const n = new Set(prev);
    n.has(key) ? n.delete(key) : n.add(key);
    return n;
  });

  const dotColor = (r: number) => (r >= 4 ? "bg-green-600" : r >= 2 ? "bg-warning" : "bg-destructive");

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-3xl px-6 py-12">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{isSv ? "Profilen" : "Profile"}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {isSv ? "Ditt lager av kompetenser, oavsett annons. Byggd ur skanningar och verifierade svar." : "Your competence inventory, independent of any ad. Built from scans and verified answers."}
              </p>
            </div>
            <Button variant={registry ? "outline" : "default"} className="h-10 text-sm" onClick={buildRegistry} disabled={building || loading}>
              {building ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ListChecks className="mr-1.5 h-4 w-4" />}
              {building ? (isSv ? "Klustrar…" : "Clustering…") : registry ? (isSv ? "Uppdatera registret" : "Update the registry") : (isSv ? "Bygg registret" : "Build the registry")}
            </Button>
          </div>
          {!loading && themes.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground tabular-nums">
              {themes.length} {isSv ? "kompetenser" : "competences"} · {evidenceCount} {isSv ? "verifierade bevis" : "verified answers"} · {isSv ? "ur" : "from"} {cvCount} {isSv ? "CV:n" : "CVs"}
              {registry && <> · {isSv ? "register v" : "registry v"}{registry.version}</>}
            </p>
          )}
          {!loading && !registry && themes.length > 3 && (
            <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              {isSv
                ? "Utan register är varje annons-formulering en egen rad. Bygg registret så slås samma kompetens ihop till ett kort, oavsett vad annonsen kallade den."
                : "Without a registry every ad phrasing is its own row. Build the registry and the same competence merges into one card no matter what the ad called it."}
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
                const isOpen = open.has(t.key);
                return (
                  <Collapsible key={t.key} open={isOpen} onOpenChange={() => toggle(t.key)}>
                    <div className={`rounded-2xl border p-4 ${thin ? "border-dashed border-warning/60" : "border-border"} bg-card`}>
                      <CollapsibleTrigger asChild>
                        <button type="button" className="flex w-full items-center gap-3 text-left">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{t.name}</p>
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
                          {t.aliases.size > 0 && (
                            <p className="text-[11px] text-muted-foreground">
                              {isSv ? "Även kallad:" : "Also called:"} {Array.from(t.aliases).slice(0, 5).join(" · ")}
                            </p>
                          )}
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

      {/* Registry review: the model proposes, you decide. */}
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isSv ? "Granska registret" : "Review the registry"}</DialogTitle>
            <DialogDescription>
              {isSv
                ? "Döp om, ta bort fel, stryk kompetenser du inte vill ha. Det du sparar blir kartans facit."
                : "Rename, remove mistakes, drop competences you don't want. What you save becomes the map's source of truth."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {(draft || []).map((c, i) => (
              <div key={c.id} className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input value={c.name_sv} onChange={e => editDraft(i, { name_sv: e.target.value })} className="h-9 text-sm" placeholder="Namn (svenska)" />
                  <Input value={c.name_en} onChange={e => editDraft(i, { name_en: e.target.value })} className="h-9 text-sm" placeholder="Name (English)" />
                  <button type="button" className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                    title={isSv ? "Ta bort kompetensen" : "Remove competence"}
                    onClick={() => setDraft(prev => prev ? prev.filter((_, j) => j !== i) : prev)}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {c.aliases.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {c.aliases.map(a => (
                      <span key={a} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                        {a}
                        <button type="button" className="text-muted-foreground hover:text-destructive"
                          onClick={() => editDraft(i, { aliases: c.aliases.filter(x => x !== a) })}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>{isSv ? "Avbryt" : "Cancel"}</Button>
            <Button onClick={saveRegistry} disabled={saving || !(draft || []).length}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {isSv ? `Spara ${draft?.length || 0} kompetenser` : `Save ${draft?.length || 0} competences`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
