import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Model chain: strongest first; on an unknown-model rejection (400/404) step down,
// so a gateway id rename can never break the app.
const MODEL_CHAIN = ["openai/gpt-5.5", "openai/gpt-5", "google/gemini-3.6-flash", "google/gemini-2.5-flash"];
let lastModelUsed = "";
async function gatewayFetch(build: (model: string) => RequestInit): Promise<Response> {
  let res: Response | null = null;
  for (const m of MODEL_CHAIN) {
    lastModelUsed = m;
    res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", build(m));
    if (res.status !== 400 && res.status !== 404) return res;
  }
  return res as Response;
}

/**
 * Skill inference, honesty preserved: read the CV for competences the experience
 * IMPLIES but never states ("led a CRM replacement" implies data migration and
 * vendor management). The output is QUESTION CANDIDATES — the user confirms or
 * denies in the interview flow; nothing is ever claimed silently.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { resume_content_json, known, locale } = await req.json();
    if (!resume_content_json) {
      return new Response(JSON.stringify({ error: "resume_content_json is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    const lang = locale === "en" ? "English" : "Swedish";
    const knownList: string[] = Array.isArray(known) ? known.map((k: unknown) => String(k || "")).filter(Boolean) : [];

    const cvContext = (resume_content_json.experience || [])
      .map((e: any) => `${e.title} @ ${e.company} (${e.startDate}–${e.isPresent ? "now" : e.endDate}): ${(e.bullets || []).join(" | ")}`)
      .join("\n");

    const systemPrompt = `You read a CV for competences the experience IMPLIES but never states.
Example: "led the replacement of the CRM platform" implies data migration, vendor management, change communication — even though none of those words appear.
RULES:
- Return AT MOST 5 inferred competences. Quality over quantity; zero is a fine answer.
- Each must be anchored in a SPECIFIC line of the CV (quote the fragment in the reason).
- Never infer from job titles alone; only from described work.
- Skip anything in the KNOWN list or literally present in the CV text.
- Skip traits (drive, leadership style); infer only concrete, nameable competences a job ad could require.
- competence: max 4 plain words in ${lang}. reason: one sentence in ${lang}.
Return via the inferred_competences tool.`;

    const userPrompt = `## KNOWN (skip these)\n${knownList.slice(0, 40).join("; ") || "(none)"}\n\n## CV\n${cvContext || "(empty)"}`;

    const response = await gatewayFetch((model) => ({
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        // Deterministic: the same CV must imply the same competences.
        ...(model.startsWith("google/") ? { temperature: 0 } : {}),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "inferred_competences",
            description: "Competences the CV implies but never states",
            parameters: {
              type: "object",
              properties: {
                inferences: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      competence: { type: "string" },
                      reason: { type: "string", description: "One sentence quoting the CV fragment that implies it" },
                    },
                    required: ["competence", "reason"],
                  },
                },
              },
              required: ["inferences"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "inferred_competences" } },
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

    // Deterministic guards: cap at 5, drop anything known or literally in the CV.
    const norm = (s: string) => s.toLowerCase().trim();
    const knownSet = new Set(knownList.map(norm));
    const cvText = norm(JSON.stringify(resume_content_json));
    result.inferences = (result.inferences || [])
      .filter((i: any) => i?.competence && !knownSet.has(norm(i.competence)) && !cvText.includes(norm(i.competence)))
      .slice(0, 5);
    result._meta = { model: lastModelUsed };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("infer-competences error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
