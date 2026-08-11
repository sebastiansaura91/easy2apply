import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Cluster every raw competence signal (ad themes, verified keywords, CV skills)
 * into a canonical registry of at most 20 competences with bilingual names and
 * aliases. The user reviews the result before it's saved — this only proposes.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { signals } = await req.json();
    if (!Array.isArray(signals) || signals.length === 0) {
      return new Response(JSON.stringify({ error: "signals (string[]) is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const unique = Array.from(new Set(signals.map((s: unknown) => String(s || "").trim()).filter(Boolean))).slice(0, 150);

    const systemPrompt = `You organise ONE candidate's competence signals into a canonical registry.
INPUT: raw strings collected over time — competence themes from job ads, verified keywords, CV skills. Some Swedish, some English, many meaning the same thing.
RULES:
- Cluster them into AT MOST 20 canonical competences.
- Merge only when clearly the same competence ("prissättning" = "pricing strategy"). Pricing and product management are DIFFERENT competences. When unsure, keep separate — the user can merge by hand, un-merging is harder.
- name_sv and name_en: short plain names, max 4 words, no buzzwords ("Pris & paketering", not "Strategisk prisoptimering").
- id: kebab-case from name_en.
- aliases: assign EVERY input string to exactly one competence's aliases (the string may equal the name). Never drop an input, never invent strings that were not in the input.
Return via the competence_registry tool.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        // Deterministic: the same signals must produce the same clustering.
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `## INPUT SIGNALS (${unique.length})\n${unique.map(s => `- ${s}`).join("\n")}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "competence_registry",
            description: "Canonical competence registry for one candidate",
            parameters: {
              type: "object",
              properties: {
                competences: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string", description: "kebab-case, from name_en" },
                      name_sv: { type: "string" },
                      name_en: { type: "string" },
                      aliases: { type: "array", items: { type: "string" }, description: "Input strings assigned to this competence" },
                    },
                    required: ["id", "name_sv", "name_en", "aliases"],
                  },
                },
              },
              required: ["competences"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "competence_registry" } },
      }),
    });

    if (response.status === 429 || response.status === 402) {
      return new Response(JSON.stringify({ error: response.status === 429 ? "Rate limit reached. Try again shortly." : "AI credits exhausted." }), {
        status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!response.ok) throw new Error(`AI gateway error: ${response.status}`);

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "AI did not return structured result" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let result: any;
    try {
      result = typeof toolCall.function.arguments === "string" ? JSON.parse(toolCall.function.arguments) : toolCall.function.arguments;
    } catch {
      return new Response(JSON.stringify({ error: "Failed to parse AI result" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Completeness guard: any input the model dropped becomes its own competence,
    // so no signal ever silently disappears from the registry.
    const norm = (s: string) => s.toLowerCase().trim();
    const competences = (result.competences || []).filter((c: any) => c?.id && c?.name_sv && c?.name_en);
    const covered = new Set<string>();
    for (const c of competences) {
      c.aliases = Array.isArray(c.aliases) ? c.aliases.filter((a: any) => typeof a === "string" && a.trim()) : [];
      for (const a of [c.name_sv, c.name_en, ...c.aliases]) covered.add(norm(a));
    }
    const usedIds = new Set(competences.map((c: any) => c.id));
    for (const s of unique) {
      if (covered.has(norm(s))) continue;
      let id = norm(s).replace(/[^a-z0-9åäö]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "signal";
      while (usedIds.has(id)) id = `${id}-x`;
      usedIds.add(id);
      competences.push({ id, name_sv: s, name_en: s, aliases: [s] });
      covered.add(norm(s));
    }

    return new Response(JSON.stringify({ competences }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("build-competence-registry error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
