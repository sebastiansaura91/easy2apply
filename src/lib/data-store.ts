import { supabase } from "@/integrations/supabase/client";
import { CompetenceRegistry, REGISTRY_ROW_TITLE } from "@/lib/competence-registry";
import { CVContent } from "@/types/cv";

/**
 * Data model v2 repository layer. Every write here is EXPAND-phase: __meta in
 * content_json stays the cache the UI reads, these tables accumulate the durable
 * record (analysis history, version stack, registry). All calls tolerate the
 * tables not existing yet — the migration can lag behind a frontend publish —
 * so failures are swallowed, never surfaced to the user.
 */

// Generated Database types lag behind new tables; contained cast, same as telemetry.
const sb = supabase as unknown as {
  from: (table: string) => any;
};

export type AnalysisKind = "scan" | "rolefit";

/** Append one analysis to the history. Fire-and-forget — the __meta cache is the UI's source. */
export function recordAnalysis(args: {
  resumeId: string;
  kind: AnalysisKind;
  hash: string;
  result: unknown;
  score?: number;
  grade?: string;
  subscores?: unknown;
}): void {
  (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await sb.from("analyses").insert({
        user_id: user.id,
        resume_id: args.resumeId,
        kind: args.kind,
        input_hash: args.hash,
        score: args.score ?? null,
        grade: args.grade ?? null,
        subscores: args.subscores ?? null,
        result: args.result,
      });
    } catch { /* history is additive — never block the flow */ }
  })();
}

const VERSION_CAP = 20;

/**
 * Persist a document snapshot to resume_versions (the durable half of the undo
 * stack) and prune beyond the cap. Fire-and-forget.
 */
export function saveVersion(resumeId: string, label: string, doc: Omit<CVContent, "__meta">): void {
  (async () => {
    try {
      await sb.from("resume_versions").insert({
        resume_id: resumeId,
        version_name: label,
        content_json: doc,
      });
      // Prune: keep the newest VERSION_CAP rows for this resume.
      const { data } = await sb.from("resume_versions")
        .select("id")
        .eq("resume_id", resumeId)
        .order("created_at", { ascending: false })
        .range(VERSION_CAP, VERSION_CAP + 49);
      const stale = ((data as { id: string }[]) || []).map(r => r.id);
      if (stale.length) await sb.from("resume_versions").delete().in("id", stale);
    } catch { /* versions are a safety net, not a requirement */ }
  })();
}

/**
 * Load the canonical competence registry: the dedicated table first, the legacy
 * hidden resume row as fallback (pre-v2 data). A legacy hit is lazily migrated
 * into the table so the fallback path retires itself.
 */
export async function loadRegistry(): Promise<CompetenceRegistry | null> {
  try {
    const { data, error } = await sb.from("competence_registry").select("data").maybeSingle();
    if (!error && data?.data?.competences) return data.data as CompetenceRegistry;
  } catch { /* table may not exist yet */ }
  try {
    const { data: regRow } = await supabase
      .from("resumes")
      .select("content_json")
      .eq("title", REGISTRY_ROW_TITLE)
      .maybeSingle();
    const legacy = (regRow?.content_json as { __meta?: { competenceRegistry?: CompetenceRegistry } } | null)
      ?.__meta?.competenceRegistry || null;
    if (legacy) saveRegistryRow(legacy);
    return legacy;
  } catch {
    return null;
  }
}

/** Upsert the registry into its own table. Fire-and-forget, tolerant of a missing table. */
export function saveRegistryRow(reg: CompetenceRegistry): void {
  (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await sb.from("competence_registry").upsert({
        user_id: user.id,
        version: reg.version,
        data: reg,
        updated_at: new Date().toISOString(),
      });
    } catch { /* legacy row still carries the registry until the migration runs */ }
  })();
}
