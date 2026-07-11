// Role-fit analysis. Given the user's canonical profile, a target role (grounded by the
// curated role rubric from the client) and an OPTIONAL specific job posting, it returns
// a structured, suggestion-only analysis: a fit score, keyword coverage, which existing
// experiences to lead with vs. mute, truthful reframes of existing bullets, and honest
// gaps. It NEVER invents facts — it only reorders, reframes and flags. The client applies
// each suggestion on the user's explicit accept.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { resume_content_json, role, job_posting_text, job_analysis, system_language } = await req.json();
    if (!resume_content_json) {
      return new Response(JSON.stringify({ error: "resume_content_json is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!role?.label) {
      return new Response(JSON.stringify({ error: "role is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const lang = system_language === "en" ? "en" : "sv";
    const langName = lang === "sv" ? "Swedish" : "English";

    const rubric = [
      `TARGET ROLE: ${role.label}`,
      role.focus ? `ANGLE: ${role.focus}` : "",
      role.emphasize?.length ? `THE ROLE EMPHASISES: ${role.emphasize.join("; ")}` : "",
      role.deemphasize?.length ? `LESS RELEVANT FOR THIS ROLE: ${role.deemphasize.join("; ")}` : "",
      role.keywords?.length ? `ATS KEYWORDS THE ROLE SCREENS FOR: ${role.keywords.join(", ")}` : "",
      role.metrics?.length ? `METRICS THAT RESONATE: ${role.metrics.join("; ")}` : "",
    ].filter(Boolean).join("\n");

    const systemPrompt = `You are a senior executive-CV strategist. You analyse how well a candidate's REAL profile fits a target role and advise how to re-angle it — WITHOUT ever changing the facts.

## HARD RULES (NON-NEGOTIABLE)
- NEVER invent facts, metrics, employers, technologies, dates or responsibilities.
- Reframes must preserve the exact underlying truth of the original bullet. You may only reorder emphasis and change wording/framing.
- If a stronger framing would need a number the candidate did not provide, keep the claim honest and insert "${lang === "sv" ? "[FYLL I]" : "[FILL IN]"}" instead of a fabricated figure.
- "gaps" are things the role wants that the candidate's profile does NOT currently evidence. State them honestly. Do NOT paper over them and do NOT invent evidence.
- Every suggestion must be traceable to a specific experience or requirement.
- Weight WORK EXPERIENCE heaviest. For senior roles, formal education carries little weight — factor it into the fit score only when it is genuinely relevant (e.g. an MBA for a strategy role) and never let it dominate or rescue an otherwise weak fit.
- ALL human-readable text you output MUST be in ${langName}.

## WHAT TO PRODUCE
- fit_score (0–100): how well the candidate's ACTUAL experience covers what the role (and posting, if given) screens for.
- keyword_coverage: which rubric/posting keywords the candidate already demonstrably evidences vs. which are missing.
- experience_emphasis: for each experience, whether to "lead" (foreground), "keep" (retain, neutral) or "mute" (keep but downplay) for this role, with a one-line reason.
- reframes: truthful rewrites of specific existing bullets, angled for the role. Include the original text so it can be matched.
- gaps: role requirements not evidenced, each with why it matters and a concrete, honest next step.
Return everything via the role_fit_result tool.`;

    const experiences = (resume_content_json.experience || []).map((e: any) => ({
      id: e.id, title: e.title, company: e.company, bullets: e.bullets || [],
    }));
    const education = (resume_content_json.education || []).map((e: any) => ({
      degree: e.degree, field: e.field, school: e.school, endDate: e.endDate,
    }));

    let userPrompt = `## TARGET ROLE RUBRIC\n${rubric}\n\n`;
    if (job_analysis) {
      // Preferred: a structured breakdown from analyze-job-posting. Drive the fit against
      // THESE concrete requirements/keywords rather than re-parsing raw text.
      const ja = job_analysis;
      userPrompt += `## SPECIFIC JOB POSTING — STRUCTURED (analyse the fit against THIS)\n`;
      if (ja.job_title) userPrompt += `Title: ${ja.job_title}${ja.company_name ? ` @ ${ja.company_name}` : ""}\n`;
      if (ja.seniority_level) userPrompt += `Seniority: ${ja.seniority_level}\n`;
      if (ja.key_requirements?.length) userPrompt += `Must-have requirements: ${ja.key_requirements.join("; ")}\n`;
      if (ja.nice_to_have?.length) userPrompt += `Nice-to-have: ${ja.nice_to_have.join("; ")}\n`;
      if (ja.core_responsibilities?.length) userPrompt += `Core responsibilities: ${ja.core_responsibilities.join("; ")}\n`;
      if (ja.key_phrases?.length) userPrompt += `Key phrases the CV should echo: ${ja.key_phrases.join("; ")}\n`;
      userPrompt += `\nWeight the posting's must-have requirements above the generic rubric where they conflict.\n\n`;
    } else if (job_posting_text?.trim()) {
      userPrompt += `## SPECIFIC JOB POSTING (sharpen the analysis against THIS)\n\`\`\`\n${job_posting_text.trim()}\n\`\`\`\n\n`;
    } else {
      userPrompt += `## NO SPECIFIC POSTING\nAnalyse against the role in general, using the rubric above.\n\n`;
    }
    userPrompt += `## CANDIDATE PROFILE\nProfile summary:\n${resume_content_json.profile || "(none)"}\n\n`;
    userPrompt += `Skills: ${(resume_content_json.skills || []).join(", ") || "(none)"}\n\n`;
    userPrompt += `Education (weigh lightly for senior roles — only relevant when it clearly maps to the role): ${education.length ? JSON.stringify(education) : "(none)"}\n\n`;
    userPrompt += `Experience (with ids and bullets) — this is the primary basis for the fit:\n\`\`\`json\n${JSON.stringify(experiences, null, 2)}\n\`\`\`\n\n`;
    userPrompt += `Analyse the fit and return the result via the tool. Remember: suggestions only, never fabricate. Output all text in ${langName}.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "role_fit_result",
            description: "Return the structured role-fit analysis",
            parameters: {
              type: "object",
              properties: {
                fit_score: { type: "number", description: "0–100 fit of actual experience to the role/posting" },
                summary: { type: "string", description: "2–3 sentence honest read of the fit" },
                keyword_coverage: {
                  type: "object",
                  properties: {
                    covered: { type: "array", items: { type: "string" } },
                    missing: { type: "array", items: { type: "string" } },
                  },
                  required: ["covered", "missing"],
                  additionalProperties: false,
                },
                experience_emphasis: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      experience_id: { type: "string" },
                      title: { type: "string" },
                      action: { type: "string", enum: ["lead", "keep", "mute"] },
                      reason: { type: "string" },
                    },
                    required: ["experience_id", "title", "action", "reason"],
                    additionalProperties: false,
                  },
                },
                reframes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      experience_id: { type: "string" },
                      original: { type: "string", description: "Exact existing bullet text" },
                      suggested: { type: "string", description: "Truthful role-angled rewrite" },
                      reason: { type: "string" },
                    },
                    required: ["experience_id", "original", "suggested", "reason"],
                    additionalProperties: false,
                  },
                },
                gaps: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      requirement: { type: "string" },
                      why: { type: "string" },
                      suggestion: { type: "string" },
                    },
                    required: ["requirement", "why", "suggestion"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["fit_score", "summary", "keyword_coverage", "experience_emphasis", "reframes", "gaps"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "role_fit_result" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: response.status === 429 ? 429 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "AI did not return structured result" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = typeof toolCall.function.arguments === "string"
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-role-fit error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
