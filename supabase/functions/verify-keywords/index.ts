import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * For each missing keyword from a job ad, generate ONE short verification question that
 * helps the candidate recall whether they actually have the competence — anchored in
 * their CV context where possible ("You led the Salesforce transformation — did that
 * include ERP integration? Which system?"). The answers become the evidence for
 * truthful keyword placement.
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

    const cvContext = (resume_content_json.experience || [])
      .map((e: any) => `${e.title} @ ${e.company}: ${(e.bullets || []).slice(0, 3).join(" | ")}`)
      .join("\n");

    const systemPrompt = `You verify whether a candidate actually has specific competences a job ad asks for.
For EACH keyword, write ONE short, concrete question (max 25 words) that helps the candidate recall real experience with it.
- Anchor the question in the candidate's CV context when something related exists ("Your Salesforce transformation — did it include ERP integration? Which system?").
- Ask for specifics that could go on a CV: which system/tool, what role, what outcome.
- Never suggest the candidate should claim something — the question must make "no" an easy answer.
- Output all text in ${lang}. Return via the verification_questions tool.`;

    const userPrompt = `## KEYWORDS TO VERIFY\n${missing_phrases.slice(0, 10).join("; ")}\n\n## CANDIDATE CV CONTEXT\n${cvContext || "(none)"}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        // Deterministic: same keywords + CV must yield the same questions.
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
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
                    },
                    required: ["keyword", "question"],
                  },
                },
              },
              required: ["questions"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "verification_questions" } },
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
    // Only questions for keywords we actually asked about.
    const asked = new Set(missing_phrases.map((p: string) => p.toLowerCase().trim()));
    result.questions = (result.questions || []).filter((q: any) => asked.has(String(q?.keyword || "").toLowerCase().trim()));

    return new Response(JSON.stringify(result), {
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
