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

    const systemPrompt = `You verify whether a candidate actually has specific competences a job ad asks for.
For EACH keyword return three things:
1. question — ONE short, OPEN question (max 20 words) asking whether the candidate has ANY experience with this, anywhere in their career: "Have you worked with X? In what role, and where?" ROLE-AGNOSTIC: never assert where or in which role it happened ("Your role at Y involved..." is wrong — the CV context below is only for choosing plausible options, never for framing the question).
2. options — the 3 most plausible KINDS of experience with this competence, first person, most likely first. Guide recognition, don't test recall: name the concrete forms this work usually takes. Example — keyword "pricing" → "I have set prices and packaging myself" / "I have run pricing analyses as input to decisions" / "I have worked on pricing as part of a commercial team". Each option: max 14 words, safe to claim if true, NO numbers, NO company or role names — the candidate adds their own specifics. The candidate can pick several.
3. hint — one short prompt (max 12 words) for the specifics worth adding: where (company/role), what you did, outcome.
- Never suggest the candidate should claim something — "no" must stay an easy answer. Do NOT include a "no experience" option; the interface has a separate button for that.
- LEVEL-UP MODE: when THEME CONTEXT gives a current rating for a keyword, do NOT ask whether the candidate has the competence. Ask for the missing ingredient of the NEXT level, one attribute at a time (SFIA logic): autonomy (owned decisions vs supported), scope (budget, teams, companies), measurable outcome, repetition (how many contexts), recency. Grade the options by that attribute ("Jag ägde besluten" / "Jag drev arbetet" / "Jag stödde teamet"), and let the hint chase the number.
- Output all text in ${lang}. Return via the verification_questions tool.`;

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
