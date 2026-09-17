import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, makeGateway, HUMAN_WRITING_RULES, stripAiDashes } from "../_shared/gateway.ts";




/**
 * For each missing keyword from a job ad, generate ONE short, role-agnostic verification
 * question ("Have you worked with X? In what role, and where?") plus multiple-choice
 * statements covering the plausible kinds of experience. The answers become the evidence
 * for truthful keyword placement.
 */


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const gw = makeGateway(req, "verify-keywords", "wording");

  try {
    const { resume_content_json, missing_phrases, locale, themes_context } = await req.json();
    if (!resume_content_json || !Array.isArray(missing_phrases) || missing_phrases.length === 0) {
      return new Response(JSON.stringify({ error: "resume_content_json and missing_phrases are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    const lang = locale === "en" ? "English" : "Swedish";

    const cvContext = (resume_content_json.experience || [])
      .map((e: any) => `${e.title} @ ${e.company}: ${(e.bullets || []).slice(0, 3).join(" | ")}`)
      .join("\n");

    const systemPrompt = `You interview a candidate, in ${lang}, about what they have ACTUALLY DONE, to close gaps against a job ad. This is a conversation with the candidate — warm, concrete, plain — never CV text and never a quiz.

INTERPRET, NEVER INTERROGATE LITERALLY: a keyword may be a competence theme or a phrase lifted from the ad. Ask about the underlying WORK in the ad's context, not the phrase. "engagerade medarbetare" is not a competence called employee engagement — the work behind it is leading so people stay engaged and grow. Use the theme context to understand what the ad is really after.

For EACH keyword return three things:
1. question — ONE short, OPEN question (max 20 words) about what the candidate has DONE in this area: "Vad har du gjort för att utveckla chefer du lett?" — never "Har du jobbat med X?". ROLE-AGNOSTIC: never assert where or in which role it happened; the CV context below only informs plausible options.
2. options — the 3 most plausible CONCRETE ACTIVITIES this work takes in real jobs, first person past tense, most likely first. Recognition, not recall — and NEVER a seniority ladder: bare status claims ("Jag ägde besluten" / "Jag ledde arbetet" / "Jag stödde teamet") are FORBIDDEN as options. Each option names a checkable activity someone either did or didn't: "Höll regelbundna utvecklingssamtal med chefer som rapporterade till mig" / "Byggde introduktionsprogram för nya ledare". Max 14 words, no numbers, no company or role names. Several can be true at once.
3. hint — one short prompt (max 12 words) chasing the specifics: where, with whom, scale, outcome.
- Never suggest the candidate should claim something — "no" must stay an easy answer. Do NOT include a "no experience" option; the interface has a separate button for that.
- LEVEL-UP MODE: when THEME CONTEXT gives a current rating, do not re-ask whether the competence exists. Ask for the NEXT level's missing ingredient, one attribute at a time (SFIA logic): autonomy, scope, measurable outcome, repetition, recency — but STILL as concrete activities ("Satte prislistan själv för en produktlinje", not "Jag ägde prissättningen"), and let the hint chase the number.
- EVERY word of question, options and hint in ${lang}. Return via the verification_questions tool.`;

    let userPrompt = `## KEYWORDS TO VERIFY\n${missing_phrases.slice(0, 10).join("; ")}\n\n`;
    if (Array.isArray(themes_context) && themes_context.length) {
      userPrompt += `## THEME CONTEXT (current rating 1-5 + why)\n`;
      for (const tc of themes_context.slice(0, 10)) userPrompt += `- ${String(tc.theme || "")}: rating ${tc.rating}. ${String(tc.evidence_note || "").slice(0, 200)}\n`;
      userPrompt += `\n`;
    }
    userPrompt += `## CANDIDATE CV CONTEXT\n${cvContext || "(none)"}`;

    const response = await gw.fetch((model) => ({
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        // Deterministic: same keywords + CV must yield the same questions.
        ...(model.startsWith("google/") ? { temperature: 0 } : {}),
        messages: [
          { role: "system", content: systemPrompt + HUMAN_WRITING_RULES },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "verification_questions",
            description: "One verification question per keyword",
            parameters: {
              type: "object",
              properties: {
                questions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      keyword: { type: "string" },
                      question: { type: "string" },
                      options: {
                        type: "array",
                        description: "Exactly 3 honest first-person answer statements, strongest involvement first",
                        items: { type: "string" },
                      },
                      hint: { type: "string", description: "Short prompt for specifics: system, scope, outcome" },
                    },
                    required: ["keyword", "question", "options"],
                  },
                },
              },
              required: ["questions"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "verification_questions" } },
      }),
    }));

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
    // Only questions for keywords we actually asked about; options capped and cleaned.
    const asked = new Set(missing_phrases.map((p: string) => p.toLowerCase().trim()));
    result.questions = (result.questions || [])
      .filter((q: any) => asked.has(String(q?.keyword || "").toLowerCase().trim()))
      .map((q: any) => ({
        ...q,
        options: (Array.isArray(q.options) ? q.options : [])
          .filter((o: any) => typeof o === "string" && o.trim())
          .map((o: string) => o.trim())
          .slice(0, 3),
      }));

    (result as any)._meta = { model: gw.model() };
    return new Response(JSON.stringify(stripAiDashes(result)), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("verify-keywords error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
