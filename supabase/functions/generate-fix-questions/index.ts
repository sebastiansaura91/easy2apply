import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { issue, cv, job_posting_text, target_section, target_index, locale } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const isSv = locale !== "en";

    let targetContext = "";
    if (target_section === "profile") {
      targetContext = `Profile: "${cv.profile || "(empty)"}"`;
    } else if (target_section === "experience" && target_index !== undefined) {
      const exp = cv.experience?.[target_index];
      if (exp) targetContext = `Role: ${exp.title} at ${exp.company}\nBullets: ${exp.bullets?.join(" | ") || "(none)"}`;
    } else if (target_section === "skills") {
      targetContext = `Skills: ${cv.skills?.join(", ") || "(none)"}`;
    }

    const systemPrompt = `You are a CV optimization expert. Generate 2-4 contextual clarifying questions to help fix a specific CV issue. 

RULES:
- Questions should help uncover MISSING INFORMATION needed to write a strong CV entry
- Focus on: decision-making authority, scope/scale, stakeholders, measurable outcomes, tools/methods
- Each question should have 3-4 multiple choice options PLUS a short free-text option
- Questions must be in ${isSv ? "Swedish" : "English"}
- Be specific to the role/issue, not generic
- Never copy text from the job description directly`;

    const userPrompt = `ISSUE: ${issue.title}
Why it matters: ${issue.why_it_matters}
Fix hint: ${issue.fix}

TARGET: ${target_section}${target_index !== undefined ? ` #${target_index + 1}` : ""}
${targetContext}

${job_posting_text ? `JOB AD CONTEXT (first 1000 chars): ${job_posting_text.substring(0, 1000)}` : "No job ad provided"}

CV roles: ${cv.experience?.map((e: any) => `${e.title} @ ${e.company}`).join(", ") || "none"}

Generate contextual questions.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "provide_questions",
            description: "Return clarifying questions for fixing a CV issue",
            parameters: {
              type: "object",
              properties: {
                questions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      question: { type: "string" },
                      options: {
                        type: "array",
                        items: { type: "string" },
                      },
                      allow_freetext: { type: "boolean" },
                    },
                    required: ["question", "options"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["questions"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "provide_questions" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-fix-questions error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
