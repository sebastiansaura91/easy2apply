import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Given missing keywords and the CV's bullets, propose MINIMAL edits: for each keyword,
 * pick the one existing bullet where it fits naturally and swap/insert one or two words.
 * The bullet's claim, numbers and length must stay intact — this is word-level tailoring,
 * never rewriting.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { resume_content_json, missing_phrases, locale } = await req.json();
    if (!resume_content_json || !Array.isArray(missing_phrases) || missing_phrases.length === 0) {
      return new Response(JSON.stringify({ error: "resume_content_json and missing_phrases are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const lang = locale === "en" ? "English" : "Swedish";
    const bullets: { exp_index: number; bullet_index: number; text: string }[] = [];
    (resume_content_json.experience || []).forEach((e: any, ei: number) => {
      (e.bullets || []).forEach((b: string, bi: number) => {
        if (b && b.trim()) bullets.push({ exp_index: ei, bullet_index: bi, text: b });
      });
    });
    if (bullets.length === 0) {
      return new Response(JSON.stringify({ placements: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You place missing ATS keywords into existing CV bullets with MINIMAL edits.
STRICT RULES:
- For each keyword, choose the ONE bullet where it fits most naturally (a synonym or related phrasing already exists there).
- The revised bullet must be the SAME bullet with only 1–2 words swapped or inserted. Same claim, same numbers, same structure, roughly the same length.
- NEVER invent achievements, numbers, tools or scope. If a keyword has no honest home in any bullet, OMIT it (do not force it).
- Never place two keywords in the same bullet.
- Output all text in ${lang}.
Return via the keyword_placements tool.`;

    const userPrompt = `## MISSING KEYWORDS\n${missing_phrases.slice(0, 10).join("; ")}\n\n## BULLETS (with indices)\n\`\`\`json\n${JSON.stringify(bullets, null, 2)}\n\`\`\`\n\nPropose minimal placements now.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        // Deterministic: same CV + keywords must yield the same placements.
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "keyword_placements",
            description: "Minimal keyword placements into existing bullets",
            parameters: {
              type: "object",
              properties: {
                placements: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      keyword: { type: "string" },
                      exp_index: { type: "number" },
                      bullet_index: { type: "number" },
                      original: { type: "string", description: "The bullet text exactly as given" },
                      revised: { type: "string", description: "Same bullet with 1-2 words swapped/inserted to include the keyword" },
                      note: { type: "string", description: "One short sentence: what was swapped and why it stays truthful" },
                    },
                    required: ["keyword", "exp_index", "bullet_index", "original", "revised", "note"],
                  },
                },
              },
              required: ["placements"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "keyword_placements" } },
      }),
    });

    if (response.status === 429 || response.status === 402) {
      return new Response(JSON.stringify({ error: response.status === 429 ? "Rate limit reached. Try again shortly." : "AI credits exhausted." }), {
        status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!response.ok) {
      console.error("place-keywords gateway error:", response.status);
      throw new Error(`AI gateway error: ${response.status}`);
    }

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

    // Deterministic guards: the original must actually match the CV bullet, and the
    // revision must stay a minimal edit (no ballooning, no new digits).
    const norm = (s: string) => String(s || "").trim().toLowerCase();
    const digits = (s: string) => (String(s).match(/\d+/g) || []).join(",");
    result.placements = (result.placements || []).filter((p: any) => {
      const actual = bullets.find(b => b.exp_index === p.exp_index && b.bullet_index === p.bullet_index);
      if (!actual || norm(actual.text) !== norm(p.original)) return false;
      if (!p.revised || norm(p.revised) === norm(p.original)) return false;
      if (p.revised.length > p.original.length * 1.25 + 20) return false;
      if (digits(p.revised) !== digits(p.original)) return false; // numbers must be untouched
      return true;
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("place-keywords error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
