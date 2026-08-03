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
// Distilled human-writing rules (from the "signs of AI writing" guide): suggested
// text must read like a person wrote it. Recruiters discard obvious AI wording.
const HUMAN_WRITING_RULES = `

HUMAN WRITING RULES for every piece of suggested text:
- Plain verbs, plain claims: led/built/increased (ledde/byggde/ökade). Banned CV-slop verbs: spearheaded, leveraged, utilized, orchestrated, championed, pioneered.
- Banned buzzwords (EN): passionate, dynamic, results-driven, proven track record, synergy, seamless, cutting-edge, vibrant, pivotal, crucial, testament, showcase, delve, robust, holistic, "landscape"/"tapestry" (figurative).
- Banned (SV): brinner för, passionerad, dynamisk, visionär, spjutspetskompetens, "mervärde" och "framgångsrikt" som utfyllnad.
- No "-ing"/"vilket" tails that fake depth ("...driving growth, enhancing efficiency" / "...vilket skapade synergier"). One bullet, one concrete claim.
- No rule-of-three padding: two facts get two items, not a forced third. No "not only... but also" / "inte bara... utan även".
- Never use em dashes (—) or en dashes (–). Use a comma, period or colon instead.
- Cut filler: "in order to" -> "to", "responsible for ensuring" -> "ensured", "i syfte att" -> "för att", "ansvarade för att säkerställa" -> "säkerställde".
- Every word must carry a checkable fact (what, scale, outcome) or be cut. Vary sentence length; never end on a generic upbeat close.`;

// Em dashes are the most reliable AI tell: strip them from every suggested string
// no matter what the model returns. Hyphens and digit ranges stay untouched;
// values under an "original" key quote the CV verbatim and must survive for matching.
const stripAiDashes = (v: unknown): unknown =>
  typeof v === "string" ? v.replace(/\s*—\s*/g, ", ")
    : Array.isArray(v) ? v.map(stripAiDashes)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, k === "original" ? x : stripAiDashes(x)])) : v;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { resume_content_json, missing_phrases, locale, evidence } = await req.json();
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

    const hasEvidence = Array.isArray(evidence) && evidence.length > 0;
    const systemPrompt = `You place missing ATS keywords into existing CV bullets with MINIMAL edits.
STRICT RULES:
- For each keyword, choose the ONE bullet where it fits most naturally (a synonym or related phrasing already exists there).
- The revised bullet must be the SAME bullet with only 1–2 words swapped or inserted. Same claim, same numbers, same structure, roughly the same length.
- NEVER invent achievements, numbers, tools or scope. If a keyword has no honest home in any bullet${hasEvidence ? " and no candidate evidence covers it" : ""}, OMIT it (do not force it).
- Never place two keywords in the same bullet.${hasEvidence ? `
- CANDIDATE EVIDENCE: the candidate has answered verification questions confirming real experience. Use their answers to pick the right bullet and wording.
- If a confirmed keyword has NO honest home in any existing bullet, you may instead propose ONE new bullet in new_bullets for the most relevant experience — built ONLY from facts in the candidate's answer (their system names, role, outcome). Use "${locale === "en" ? "[FILL IN]" : "[FYLL I]"}" for any number the answer does not state. Max 180 characters, outcome-first.` : ""}
- LANGUAGE PURITY: every revised bullet must be written entirely in ${lang}. When a keyword comes from a job ad in the other language, place its natural ${lang} equivalent instead (Swedish "serieförvärvare" → English "serial acquirer"; "ledningsgrupp" → "management team"). Recruiters and scanners match translations — never mix two languages inside one bullet.
- EMPLOYER-CONTEXT TERMS: some keywords describe the COMPANY, not the person ("serieförvärvare"/"serial acquirer", "PE-backed", "family-owned", industry labels). Place these only as environment context ("…within a serial acquirer" / "…i en serieförvärvarkoncern") — never as a role or trait of the candidate ("as a serial acquirer" would be false). If no bullet can carry that context naturally, omit the keyword.
- Output all text in ${lang}.
Return via the keyword_placements tool.`;

    let userPrompt = `## MISSING KEYWORDS\n${missing_phrases.slice(0, 10).join("; ")}\n\n## BULLETS (with indices)\n\`\`\`json\n${JSON.stringify(bullets, null, 2)}\n\`\`\`\n\n`;
    if (hasEvidence) {
      userPrompt += `## CANDIDATE EVIDENCE (verified answers — the only source of new facts)\n`;
      for (const ev of evidence.slice(0, 10)) userPrompt += `- ${ev.keyword}: ${String(ev.answer || "").slice(0, 400)}\n`;
      userPrompt += `\n`;
    }
    userPrompt += `Propose minimal placements now.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        // Deterministic: same CV + keywords must yield the same placements.
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt + HUMAN_WRITING_RULES },
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
                new_bullets: {
                  type: "array",
                  description: "Only when evidence confirms a keyword that has no honest home in existing bullets",
                  items: {
                    type: "object",
                    properties: {
                      keyword: { type: "string" },
                      exp_index: { type: "number" },
                      bullet: { type: "string", description: "New bullet built ONLY from the candidate's answer" },
                      note: { type: "string" },
                    },
                    required: ["keyword", "exp_index", "bullet", "note"],
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

    // New bullets are allowed ONLY with evidence, and every number in them must come
    // from the candidate's own answer (or be a [FYLL I]/[FILL IN] placeholder).
    const evidenceText = (Array.isArray(evidence) ? evidence : []).map((e: any) => String(e?.answer || "")).join(" ");
    const evidenceDigits = new Set((evidenceText.match(/\d+/g) || []));
    result.new_bullets = (result.new_bullets || []).filter((nb: any) => {
      if (!hasEvidence) return false;
      if (typeof nb?.exp_index !== "number" || !(resume_content_json.experience || [])[nb.exp_index]) return false;
      if (!nb.bullet || nb.bullet.length > 220) return false;
      const nums = String(nb.bullet).match(/\d+/g) || [];
      return nums.every((n: string) => evidenceDigits.has(n));
    });

    // Language guard: an English CV must never pick up Swedish words through a placement —
    // a Swedish ad's keyword has to arrive translated. Swedish letters are a reliable tell
    // for this direction (proper nouns already in the bullet keep their åäö).
    if (locale === "en") {
      const sv = /[åäöÅÄÖ]/;
      result.placements = result.placements.filter((p: any) => !sv.test(p.revised) || sv.test(p.original));
      result.new_bullets = result.new_bullets.filter((nb: any) => !sv.test(nb.bullet) || sv.test(evidenceText));
    }

    return new Response(JSON.stringify(stripAiDashes(result)), {
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
