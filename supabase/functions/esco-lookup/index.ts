import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Enrich canonical competences with ESCO — the EU's open skills taxonomy (14k skills,
 * Swedish + English labels and synonym rings, no auth). Conservative by design: a
 * wrong match pollutes the alias matching, so no match beats a bad match.
 */
const ESCO = "https://ec.europa.eu/esco/api/search";
const STOP = new Set(["of", "and", "the", "for", "av", "och", "för", "inom", "på", "&"]);
const words = (s: string) =>
  s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(w => w.length >= 3 && !STOP.has(w));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { queries } = await req.json();
    if (!Array.isArray(queries) || !queries.length) {
      return new Response(JSON.stringify({ error: "queries required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { id: string; escoUri: string | null; escoTitle: string | null; labels: string[] }[] = [];

    for (const q of queries.slice(0, 25)) {
      const id = String(q?.id || "");
      let escoUri: string | null = null;
      let escoTitle: string | null = null;
      const labels = new Set<string>();

      for (const [name, lang] of [[String(q?.name_en || ""), "en"], [String(q?.name_sv || ""), "sv"]] as const) {
        if (!name.trim() || escoUri) continue;
        const want = words(name);
        if (!want.length) continue;
        try {
          const res = await fetch(`${ESCO}?text=${encodeURIComponent(name)}&language=${lang}&type=skill&limit=5&full=true`, {
            headers: { Accept: "application/json" },
          });
          if (!res.ok) continue;
          const data = await res.json();
          for (const hit of data?._embedded?.results || []) {
            const pref = hit?.preferredLabel || {};
            const candidateText = `${hit?.title || ""} ${pref.en || ""} ${pref.sv || ""}`;
            const have = new Set(words(candidateText));
            // Relevance gate: EVERY content word of the competence name must appear in
            // the candidate's labels — otherwise ESCO's fuzzy search drags in noise
            // ("pricing strategies" → "perform financial analysis on price strategies").
            if (!want.every(w => have.has(w))) continue;
            escoUri = hit.uri || null;
            escoTitle = pref.en || hit.title || null;
            const alt = hit?.alternativeLabel || {};
            for (const l of [pref.sv, pref.en, ...(alt.sv || []), ...(alt.en || [])]) {
              const s = String(l || "").trim();
              if (s && s.length <= 50) labels.add(s);
            }
            break;
          }
        } catch { /* ESCO down → enrich nothing, never fail the save */ }
      }
      results.push({ id, escoUri, escoTitle, labels: Array.from(labels).slice(0, 10) });
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("esco-lookup error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
