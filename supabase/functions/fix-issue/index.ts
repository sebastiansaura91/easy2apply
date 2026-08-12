import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    const { issue, cv, job_posting_text, answers, target_section, target_index, locale } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const isSv = locale !== "en";

    // Build context about the target
    let targetContext = "";
    if (target_section === "profile") {
      targetContext = `Current profile text: "${cv.profile || "(empty)"}"`;
    } else if (target_section === "experience" && target_index !== undefined) {
      const exp = cv.experience?.[target_index];
      if (exp) {
        targetContext = `Target role: ${exp.title} at ${exp.company} (${exp.startDate}–${exp.isPresent ? "present" : exp.endDate})\nCurrent bullets:\n${exp.bullets?.map((b: string, i: number) => `${i + 1}. ${b}`).join("\n") || "(none)"}`;
      }
    } else if (target_section === "skills") {
      targetContext = `Current skills: ${cv.skills?.join(", ") || "(none)"}`;
    }

    // Build answers context
    const answersText = answers?.map((a: { question: string; answer: string }) =>
      `Q: ${a.question}\nA: ${a.answer}`
    ).join("\n\n") || "";

    const systemPrompt = `You are a senior CV optimization expert. You help candidates fix specific issues identified during an ATS/recruiter review.

RULES:
- Generate text that is ready to paste into the CV
- PLAIN TEXT ONLY. The CV renderer prints content literally: NEVER use markdown (** * # _ backticks), bullet characters or emojis — they would appear verbatim in the PDF and break ATS parsing.
- Follow decision-first / outcome-first structure: Result → Method → Scope → Metric
- NEVER invent facts. Use [FYLL I] placeholders for any specific numbers, company names, or details you don't know
- Match the CV's existing tone and language (${isSv ? "Swedish" : "English"})
- Be concise and professional
- For profile text: 3-4 sentences max
- For bullets: outcome-first structure, max 2 lines each
- For skills: either a comma-separated list of skills, or 3–6 grouped lines in the exact plain format "Category: skill, skill, skill" (one group per line, no formatting characters)

OUTPUT FORMAT (JSON):
{
  "suggestion_text": "The actual text to insert/replace in the CV",
  "explanation": "Brief explanation of why this fixes the issue (1-2 sentences)",
  "estimated_impact": {
    "relevance": "+3 to +8",
    "scanability": "+2 to +5", 
    "overall": "+3 to +7"
  },
  "alternative_text": "A slightly different version for the user to choose from"
}`;

    const userPrompt = `ISSUE TO FIX:
Title: ${issue.title}
Why it matters: ${issue.why_it_matters}
Recommended fix: ${issue.fix}

TARGET SECTION: ${target_section}${target_index !== undefined ? ` (item #${target_index + 1})` : ""}
${targetContext}

${job_posting_text ? `JOB POSTING CONTEXT:\n${job_posting_text.substring(0, 2000)}` : ""}

USER'S ANSWERS TO CLARIFYING QUESTIONS:
${answersText}

FULL CV CONTEXT:
- Name: ${cv.contact?.name || "N/A"}
- Experience roles: ${cv.experience?.map((e: any) => `${e.title} at ${e.company}`).join(", ") || "none"}
- Skills: ${cv.skills?.join(", ") || "none"}

Generate a concrete, ready-to-use text suggestion that fixes this issue. Return valid JSON.`;

    const response = await gatewayFetch((model) => ({
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt + HUMAN_WRITING_RULES },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "provide_fix_suggestion",
            description: "Provide a concrete text suggestion to fix a CV issue",
            parameters: {
              type: "object",
              properties: {
                suggestion_text: { type: "string", description: "The actual text to insert/replace" },
                explanation: { type: "string", description: "Why this fixes the issue" },
                estimated_impact: {
                  type: "object",
                  properties: {
                    relevance: { type: "string" },
                    scanability: { type: "string" },
                    overall: { type: "string" },
                  },
                  required: ["relevance", "scanability", "overall"],
                },
                alternative_text: { type: "string", description: "Alternative version" },
              },
              required: ["suggestion_text", "explanation", "estimated_impact"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "provide_fix_suggestion" } },
      }),
    }));

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again shortly" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const parsed = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(stripAiDashes(parsed)), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("fix-issue error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
