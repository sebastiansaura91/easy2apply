import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ChevronDown, Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CVMeta, ExperienceItem, emptyCV } from "@/types/cv";
import {
  CanonicalCompetence, CompetenceRegistry, REGISTRY_ROW_TITLE, buildEvidenceLookup, normName,
} from "@/lib/competence-registry";
import { format } from "date-fns";

interface Row { id: string; title: string; meta: CVMeta; experience: ExperienceItem[] }
interface EvidenceItem { keyword: string; answer: string; at: string; role?: string }

/** One role in the chronological profile, merged across every CV that mentions it. */
interface RoleAgg {
  key: string;
  title: string;
  company: string;
  startDate: string;
  endDate: string;
  isPresent: boolean;
  bullets: string[];
  evidence: EvidenceItem[];
  cvCount: number;
}

const yearOf = (d: string) => (d || "").slice(0, 4);

/**
 * The profile: your career in chronological order — the roles you have actually held,
 * merged from every CV, with verified answers filed under the role they belong to.
 * Competence themes stay invisible matching machinery; the ads bring the themes,
 * your history brings the proof.
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
      experience: Array.isArray(r.content_json?.experience) ? r.content_json.experience : [],
    })));
    setLoading(false);
  }, []);

  useEffect(() => { if (user) fetchRows(); }, [user, fetchRows]);

  const registryRow = rows.find(r => r.meta.isRegistryRow);
  const registry: CompetenceRegistry | null = registryRow?.meta.competenceRegistry || null;
  const cvRows = useMemo(() => rows.filter(r => !r.meta.isRegistryRow), [rows]);

  const { roles, looseEvidence, evidenceCount, toFill } = useMemo(() => {
    // 1) Merge roles across CVs. Company + start date identify a role even when
    //    different CV angles phrase the title differently.
    const map = new Map<string, RoleAgg>();
    for (const { experience } of cvRows) {
      for (const e of experience) {
        if (!e.title && !e.company) continue;
        const key = `${normName(e.company || "")}|${e.startDate || normName(e.title)}`;
        if (!map.has(key)) {
          map.set(key, {
            key, title: e.title, company: e.company, startDate: e.startDate || "",
            endDate: e.endDate || "", isPresent: !!e.isPresent, bullets: [], evidence: [], cvCount: 0,
          });
        }
        const agg = map.get(key)!;
        agg.cvCount++;
        if ((e.title || "").length > agg.title.length) agg.title = e.title;
        if (e.isPresent) agg.isPresent = true;
        if ((e.endDate || "") > agg.endDate) agg.endDate = e.endDate || "";
        for (const b of e.bullets || []) {
          const t = b.trim();
          if (t && !agg.bullets.some(x => normName(x) === normName(t))) agg.bullets.push(t);
        }
      }
    }
    const list = Array.from(map.values()).sort((a, b) =>
      (Number(b.isPresent) - Number(a.isPresent)) || b.startDate.localeCompare(a.startDate));

    // 2) File every verified answer under its role; the rest go to "outside the roles".
    const loose: EvidenceItem[] = [];
    let evTotal = 0;
    const seen = new Set<string>();
    for (const { meta } of cvRows) {
      for (const ev of meta.verifiedEvidence || []) {
        const dedupe = `${ev.keyword}|${ev.answer}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        evTotal++;
        const rn = normName(ev.role || "");
        const hit = rn && list.find(r =>
          rn.includes(normName(r.company)) || (normName(r.title).length >= 4 && rn.includes(normName(r.title))));
        if (hit) hit.evidence.push(ev);
        else loose.push(ev);
      }
    }

    // 3) What the ads keep demanding but nothing in the profile proves yet.
    const lookup = buildEvidenceLookup(cvRows as any, registry);
    const demanded = new Map<string, number>();
    for (const { meta } of cvRows) {
      for (const t of meta.demandProfile?.competence_themes || []) {
        if (t.importance !== "must") continue;
        const scanned = (meta.lastAtsResult?.result as any)?.job_language_match?.competence_themes || [];
        const rated = scanned.find((s: any) => normName(s.theme) === normName(t.theme));
        const r = rated ? Math.round(rated.rating ?? (rated.evidence === "strong" ? 4 : rated.evidence === "missing" ? 1 : 3)) : 0;
        if (r >= 4 || lookup(t.theme).length > 0) continue;
        demanded.set(t.theme, (demanded.get(t.theme) || 0) + 1);
      }
    }
    const fill = Array.from(demanded.entries()).sort((a, b) => b[1] - a[1]).map(([theme, n]) => ({ theme, n }));

    return { roles: list, looseEvidence: loose, evidenceCount: evTotal, toFill: fill };
  }, [cvRows, registry]);

  /** Signals for the registry build — unchanged matching machinery, now backstage. */
  const collectSignals = () => {
    const out = new Set<string>();
    for (const { meta } of cvRows) {
      for (const t of meta.demandProfile?.competence_themes || []) out.add(t.theme);
      const scanned = (meta.lastAtsResult?.result as any)?.job_language_match?.competence_themes || [];
      for (const t of scanned) out.add(t.theme);
      for (const ev of meta.verifiedEvidence || []) out.add(ev.keyword);
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
      let competences: CanonicalCompetence[] = data.competences || [];
      // ESCO enrichment happens at DRAFT stage, so the wording is reviewable in the
      // dialog (dashed chips) before anything is saved. An ESCO outage costs nothing.
      try {
        const { data: esco } = await supabase.functions.invoke("esco-lookup", {
          body: { queries: competences.map(c => ({ id: c.id, name_en: c.name_en, name_sv: c.name_sv })) },
        });
        const byId = new Map(((esco?.results as any[]) || []).map(r => [r.id, r]));
        competences = competences.map(c => {
          const r = byId.get(c.id);
          if (!r?.escoUri) return c;
          const known = new Set([c.name_sv, c.name_en, ...c.aliases].map(normName));
          return { ...c, escoUri: r.escoUri, escoLabels: (r.labels as string[]).filter(l => !known.has(normName(l))) };
        });
      } catch { /* draft still fully usable without ESCO */ }
      setDraft(competences);
    } catch (e: any) {
      toast({ title: isSv ? "Kunde inte bygga registret" : "Couldn't build the registry", description: e.message, variant: "destructive" });
    } finally { setBuilding(false); }
  };

  const saveRegistry = async () => {
    if (!draft || !user) return;
    // What you reviewed is what gets saved — ESCO wording included, already vetted.
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
      toast({ title: isSv ? "Registret sparat" : "Registry saved", description: isSv ? `${cleaned.length} kompetenser i matchningsmotorn.` : `${cleaned.length} competences in the matching engine.` });
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

  const period = (r: RoleAgg) => {
    const from = yearOf(r.startDate);
    const to = r.isPresent ? (isSv ? "nu" : "now") : yearOf(r.endDate);
    return [from, to].filter(Boolean).join("–");
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-3xl px-6 py-12">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl">{isSv ? "Profilen" : "Profile"}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {isSv ? "Allt du gjort, i den ordning du gjorde det. Varje verifierat svar sparas under rätt roll." : "Everything you have done, in the order you did it. Every verified answer is filed under its role."}
              </p>
            </div>
            <Button variant="outline" className="h-9 text-xs" onClick={buildRegistry} disabled={building || loading}>
              {building && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {building ? (isSv ? "Klustrar…" : "Clustering…") : (isSv ? "Uppdatera matchningsmotorn" : "Update the matching engine")}
            </Button>
          </div>
          {!loading && roles.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground tabular-nums">
              {roles.length} {isSv ? "roller" : "roles"} · {evidenceCount} {isSv ? "verifierade bevis" : "verified answers"}
              {registry && <> · {isSv ? "motor v" : "engine v"}{registry.version}</>}
            </p>
          )}

          {/* What ads keep demanding but nothing here proves yet — the complement queue. */}
          {!loading && toFill.length > 0 && (
            <div className="mt-5 rounded-lg border border-dashed border-warning/60 p-4">
              <p className="text-sm font-medium">{isSv ? "Annonserna kräver, profilen saknar bevis" : "The ads demand it, the profile lacks proof"}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {toFill.slice(0, 6).map(f => (
                  <span key={f.theme} className="rounded-full border border-border px-2.5 py-1 text-xs">
                    {f.theme}{f.n > 1 && <span className="text-muted-foreground"> · {f.n} {isSv ? "annonser" : "ads"}</span>}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {isSv ? "Frågorna ställs i Förbättra-flödet. Svaren hamnar här, under rätt roll, och frågas aldrig igen." : "The questions are asked in the improve flow. Answers land here, under the right role, and are never asked twice."}
              </p>
            </div>
          )}

          {loading ? (
            <p className="mt-10 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{isSv ? "Bygger profilen…" : "Building the profile…"}</p>
          ) : roles.length === 0 ? (
            <div className="mt-10 rounded-lg border border-dashed border-border p-8 text-center">
              <p className="font-medium">{isSv ? "Inga roller än" : "No roles yet"}</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                {isSv ? "Profilen byggs ur dina CV:n. Skapa eller importera ett CV så fylls den." : "The profile builds from your CVs. Create or import one and it fills in."}
              </p>
            </div>
          ) : (
            <div className="mt-8">
              {roles.map((r, i) => {
                const isOpen = open.has(r.key);
                return (
                  <div key={r.key} className={`grid grid-cols-[64px_1fr] gap-4 ${i > 0 ? "border-t border-border" : ""} py-5`}>
                    <div className="pt-0.5 text-right text-xs text-muted-foreground tabular-nums">{period(r)}</div>
                    <div className="min-w-0">
                      <button type="button" className="flex w-full items-baseline justify-between gap-3 text-left" onClick={() => toggle(r.key)}>
                        <div className="min-w-0">
                          <p className="font-medium leading-snug">{r.title}</p>
                          <p className="text-sm text-muted-foreground">{r.company}</p>
                        </div>
                        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground tabular-nums">
                          {r.evidence.length > 0 && <span className="rounded-full bg-accent px-2 py-0.5 text-accent-foreground">{r.evidence.length} {isSv ? "bevis" : "proofs"}</span>}
                          {r.bullets.length} {isSv ? "punkter" : "bullets"}
                          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                        </span>
                      </button>
                      {isOpen && (
                        <div className="mt-3 space-y-2">
                          <ul className="list-disc space-y-1.5 pl-4 text-sm leading-relaxed">
                            {r.bullets.map((b, j) => <li key={j}>{b}</li>)}
                          </ul>
                          {r.evidence.map((ev, j) => (
                            <blockquote key={j} className="border-l-2 border-primary/50 bg-muted/40 px-3 py-2">
                              <p className="text-sm italic leading-relaxed">"{ev.answer}"</p>
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {isSv ? "Verifierat svar" : "Verified answer"} · {ev.keyword} · {format(new Date(ev.at), "d MMM yyyy")}
                              </p>
                            </blockquote>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {looseEvidence.length > 0 && (
                <div className="grid grid-cols-[64px_1fr] gap-4 border-t border-border py-5">
                  <div className="pt-0.5 text-right text-xs text-muted-foreground">{isSv ? "Övrigt" : "Other"}</div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">{isSv ? "Bevis utan roll. Ange roll när du svarar så hamnar de rätt." : "Answers without a role. Pick a role when answering and they land in place."}</p>
                    {looseEvidence.map((ev, j) => (
                      <blockquote key={j} className="border-l-2 border-border bg-muted/40 px-3 py-2">
                        <p className="text-sm italic leading-relaxed">"{ev.answer}"</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">{ev.keyword} · {format(new Date(ev.at), "d MMM yyyy")}</p>
                      </blockquote>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Matching-engine review: the model proposes clusters, you approve them. */}
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isSv ? "Granska matchningsmotorn" : "Review the matching engine"}</DialogTitle>
            <DialogDescription>
              {isSv
                ? "Så här slår motorn ihop annonsernas formuleringar. Döp om, ta bort fel. Syns aldrig i profilen, styr bara matchning och frågor."
                : "How the engine merges ad phrasings. Rename, remove mistakes. Never shown in the profile; only drives matching and questions."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {(draft || []).map((c, i) => (
              <div key={c.id} className="space-y-2 rounded-md border border-border p-3">
                <div className="flex items-center gap-2">
                  <Input value={c.name_sv} onChange={e => editDraft(i, { name_sv: e.target.value })} className="h-9 text-sm" placeholder="Namn (svenska)" />
                  <Input value={c.name_en} onChange={e => editDraft(i, { name_en: e.target.value })} className="h-9 text-sm" placeholder="Name (English)" />
                  <button type="button" className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                    title={isSv ? "Ta bort" : "Remove"}
                    onClick={() => setDraft(prev => prev ? prev.filter((_, j) => j !== i) : prev)}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {(c.aliases.length > 0 || (c.escoLabels || []).length > 0) && (
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
                    {(c.escoLabels || []).map(a => (
                      <span key={`esco-${a}`} title={isSv ? "Synonym från ESCO, EU:s kompetens­taxonomi" : "Synonym from ESCO, the EU skills taxonomy"}
                        className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/50 px-2 py-0.5 text-[11px] text-primary">
                        {a}
                        <button type="button" className="text-primary/70 hover:text-destructive"
                          onClick={() => editDraft(i, { escoLabels: (c.escoLabels || []).filter(x => x !== a) })}>
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
