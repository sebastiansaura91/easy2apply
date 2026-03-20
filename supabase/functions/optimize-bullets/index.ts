import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { resume_content_json, job_posting_text, system_language } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const lang = system_language === "en" ? "en" : "sv";

    // Extract all bullets with IDs
    const bulletList = extractBullets(resume_content_json);
    if (bulletList.length === 0) {
      return new Response(JSON.stringify({ overall_potential_gain: "+0", bullets: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const renderedText = buildRenderedText(resume_content_json);
    const systemPrompt = lang === "sv" ? SYSTEM_PROMPT_SV : SYSTEM_PROMPT_EN;

    let userPrompt = `## BULLETS TO ANALYZE\n\`\`\`json\n${JSON.stringify(bulletList, null, 2)}\n\`\`\`\n\n`;
    userPrompt += `## FULL CV (for context)\n\`\`\`json\n${JSON.stringify(resume_content_json, null, 2)}\n\`\`\`\n\n`;
    userPrompt += `## RENDERED PLAIN TEXT\n\`\`\`\n${renderedText}\n\`\`\`\n\n`;
    if (job_posting_text) userPrompt += `## JOB POSTING\n\`\`\`\n${job_posting_text}\n\`\`\`\n\n`;
    userPrompt += `System language: ${lang}\nAnalyze ALL ${bulletList.length} bullets and return via the optimize_bullets_result tool. ALL output text MUST be in ${lang === "sv" ? "Swedish" : "English"}.`;

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
            name: "optimize_bullets_result",
            description: "Return the complete bullet optimization analysis",
            parameters: RESULT_SCHEMA,
          },
        }],
        tool_choice: { type: "function", function: { name: "optimize_bullets_result" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: lang === "sv" ? "För många förfrågningar, vänta en stund." : "Rate limit exceeded. Try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: lang === "sv" ? "AI-krediter slut." : "AI credits depleted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response:", JSON.stringify(aiData));
      return new Response(JSON.stringify({ error: "AI did not return structured result" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result;
    try {
      result = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } catch {
      return new Response(JSON.stringify({ error: "Failed to parse AI result" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("optimize-bullets error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// --- Extract bullets with path IDs ---
function extractBullets(cv: any): { id: string; text: string; role?: string; company?: string }[] {
  const bullets: { id: string; text: string; role?: string; company?: string }[] = [];

  for (let i = 0; i < (cv.experience?.length || 0); i++) {
    const exp = cv.experience[i];
    for (let j = 0; j < (exp.bullets?.length || 0); j++) {
      if (exp.bullets[j]?.trim()) {
        bullets.push({
          id: `experience[${i}].bullets[${j}]`,
          text: exp.bullets[j],
          role: exp.title,
          company: exp.company,
        });
      }
    }
  }

  for (let i = 0; i < (cv.projects?.length || 0); i++) {
    const proj = cv.projects[i];
    for (let j = 0; j < (proj.bullets?.length || 0); j++) {
      if (proj.bullets[j]?.trim()) {
        bullets.push({
          id: `projects[${i}].bullets[${j}]`,
          text: proj.bullets[j],
          role: proj.name,
        });
      }
    }
  }

  return bullets;
}

// --- Build plain text ---
function buildRenderedText(cv: any): string {
  const lines: string[] = [];
  if (cv?.contact) {
    const c = cv.contact;
    if (c.name) lines.push(c.name);
    const parts = [c.email, c.phone, c.city, c.linkedin, c.website].filter(Boolean);
    if (parts.length) lines.push(parts.join(" · "));
    lines.push("");
  }
  const sections = (cv?.sections || []).filter((s: any) => s.enabled).sort((a: any, b: any) => a.order - b.order);
  for (const section of sections) {
    if (section.type === "experience" && cv.experience?.length) {
      lines.push("EXPERIENCE");
      for (const exp of cv.experience) {
        lines.push(`${exp.title}${exp.company ? ", " + exp.company : ""}`);
        lines.push(`${exp.startDate} – ${exp.isPresent ? "Present" : exp.endDate}`);
        for (const b of exp.bullets || []) if (b.trim()) lines.push(`• ${b}`);
        lines.push("");
      }
    }
    if (section.type === "projects" && cv.projects?.length) {
      lines.push("PROJECTS");
      for (const p of cv.projects) {
        lines.push(p.name);
        for (const b of p.bullets || []) if (b.trim()) lines.push(`• ${b}`);
        lines.push("");
      }
    }
  }
  return lines.join("\n");
}

// --- System prompts ---

const HARD_RULES = `
## HARD RULES
- NEVER fabricate numbers, tools, responsibilities, team sizes, P&L, or outcomes.
- If metrics are missing AND the bullet is outcome-driven, use placeholder: "[FYLL I: % / SEK / timmar / volym / NPS / churn / ARPU / konvertering]" (Swedish) or "[FILL IN: % / $ / hours / volume / NPS / churn / ARPU / conversion]" (English).
- If scope is unclear, use neutral phrasing: "contributed to", "drove part of", "coordinated" — never overclaim.
- Every issue MUST cite the bullet text as evidence.
- Suggestions must be small, controlled improvements — not total rewrites.
- Blocklist words (flag as buzzwords): "results-oriented", "driven", "passionate", "team player", "innovative", "responsible for", "strategic thinker", "resultatorienterad", "driven", "passionerad", "lagspelare", "innovativ", "ansvarig för", "strategisk tänkare"
`;

const BULLET_TYPE_RULES = `
## BULLET TYPE CLASSIFICATION
Classify each bullet as one of:
- "outcome" — The bullet describes a result, decision, achievement, or measurable impact. These SHOULD have metrics or outcome signals.
- "support" — The bullet describes enabling work, support functions, coordination, context-setting, or process maintenance. Examples: "Supported the sales team with...", "Coordinated onboarding for...", "Maintained compliance documentation..."
- "context" — The bullet provides organizational context, scope framing, or role description. Examples: "Reported to the VP of Engineering", "Part of a cross-functional team of 12..."

IMPORTANT SCORING ADJUSTMENT:
- "support" and "context" bullets should NOT be penalized for lacking metrics or outcome signals.
- For support bullets: focus on CLARITY, SCOPE, and METHOD rather than forcing outcome/impact.
- Do NOT add [FILL IN] placeholders for metrics on support/context bullets unless the user explicitly describes an outcome.
- A well-written support bullet that clearly explains WHAT was supported, HOW, and for WHOM can score 7-8/10 without any numbers.
`;

const SCORING_RULES = `
## BULLET SCORING (0–10)
- Structure (0–3): strong verb start + clear object + readable length
  - SENIOR RULE: +1 bonus if bullet begins with Outcome/Decision-Purpose (what it enabled) rather than a generic activity verb. Penalize generic activity-first bullets (Developed/Worked/Responsible) unless the activity is unusually specific.
- Concreteness (0–3): specific activity + named tools/methods/processes
- Evidence/Impact (0–2): outcome signal or mechanism described (numbers NOT required — especially for support/context bullets)
- Keyword alignment (0–2): relevant industry/role terms in context (if job posting provided)

## ATS RISK LEVELS
- high: missing verb start, buzzwords only, no substance
- medium: weak verb, vague object, no outcome signal
- low: solid structure, concrete, has evidence
`;

const SENIOR_BULLET_RULE = `
## SENIOR BULLET ORDERING (Outcome/Decision First)
Default pattern for senior-level bullets:
1. Start with Outcome or Decision-Purpose (what it enabled/supported/improved)
2. Then: method/how (modeling, analysis, workshops, tools)
3. Then: scope (business area/region/stakeholders)
4. End with result metric ONLY if provided; otherwise use placeholder ONLY for outcome-type bullets.

If bullet starts with a generic activity verb (Developed, Worked, Responsible, Managed, Handled, Led):
- Rewrite suggestion MUST reframe into outcome-first phrasing.
- Examples: "Supported investment decisions by modeling...", "Enabled prioritization by building...", "Improved forecast accuracy by redesigning..."

Anti-hallucination for outcomes:
- If no measurable outcome is provided, do NOT fabricate it.
- For outcome-type bullets: use placeholders: "[FILL IN: ROI / savings / margin / approval / time-to-decision]" (EN) or "[FYLL I: ROI / besparing / marginal / godkännande / tid-till-beslut]" (SV)
- For support/context-type bullets: do NOT add metric placeholders. Instead, focus on making scope/method/stakeholders clearer.
`;

const CLARIFYING_QUESTIONS_RULE = `
## CLARIFYING QUESTIONS (MANDATORY)
For EACH bullet, generate 1-3 short clarifying questions that would help improve the bullet.
Questions should:
- Focus on WHAT the person actually did (not generic "add metrics")
- Ask about decision-making, scope, stakeholders, and method
- Be multiple-choice when possible (provide 2-3 options)
- Be contextual to the bullet content — not generic

Examples:
- "What was the purpose of this work? a) Cost reduction b) Revenue growth c) Risk mitigation d) Other"
- "Who used the output? a) Executive team b) Clients c) Internal team d) External stakeholders"
- "What tools/methods did you use?"
- "How large was the scope? (team size, budget, geographic reach)"

Do NOT ask "What was the measurable outcome?" for support/context bullets.
`;

const SUGGESTION_TYPES = `
## SUGGESTION TYPES (choose 2–4 most relevant per bullet)
A) "stronger_verb_start" — Replace with a stronger, more distinct verb. For senior roles, reframe generic activity verbs into outcome/decision-purpose verbs (enabled, supported, improved, drove, accelerated).
B) "add_how" — Add method/tools/process details
C) "add_outcome" — Add outcome signal with placeholder if needed (ONLY for outcome-type bullets)
D) "split" — Split long bullet into 2 shorter ones
E) "keyword_alignment" — Insert 1 relevant keyword from job posting naturally
F) "language_fix" — Translate bullet to match system language
`;

const SYSTEM_PROMPT_SV = `Du är en expert-CV-coach och ATS-specialist. Analysera VARJE bullet och ge konkreta förbättringsförslag.

${BULLET_TYPE_RULES}
${SCORING_RULES}
${SENIOR_BULLET_RULE}
${CLARIFYING_QUESTIONS_RULE}
${SUGGESTION_TYPES}
${HARD_RULES}

ALL output MUST be in Swedish. Var saklig, konkret och floskelfri. Ge alltid 2–4 förslag per bullet. Prioritera outcome-first-struktur för seniora roller. Ställ alltid förtydligande frågor.`;

const SYSTEM_PROMPT_EN = `You are an expert CV coach and ATS specialist. Analyze EVERY bullet and provide concrete improvement suggestions.

${BULLET_TYPE_RULES}
${SCORING_RULES}
${SENIOR_BULLET_RULE}
${CLARIFYING_QUESTIONS_RULE}
${SUGGESTION_TYPES}
${HARD_RULES}

ALL output MUST be in English. Be factual, concrete, and buzzword-free. Always give 2–4 suggestions per bullet. Prioritize outcome-first structure for senior roles. Always include clarifying questions.`;

// --- Output schema ---
const RESULT_SCHEMA = {
  type: "object",
  properties: {
    overall_potential_gain: { type: "string", description: "Estimated total ATS score gain, e.g. '+8 ATS points (estimated)'" },
    bullets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Path like experience[0].bullets[2]" },
          original: { type: "string" },
          detected_language: { type: "string", enum: ["sv", "en", "mixed"] },
          bullet_score: { type: "number", description: "0-10" },
          ats_risk_level: { type: "string", enum: ["low", "medium", "high"] },
          issues: { type: "array", items: { type: "string" } },
          suggestions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["stronger_verb_start", "add_how", "add_outcome", "split", "keyword_alignment", "language_fix"] },
                why: { type: "string" },
                suggested_rewrite: { type: "string" },
                needs_user_input: { type: "array", items: { type: "string" } },
                estimated_gain: {
                  type: "object",
                  properties: {
                    bullet_score: { type: "string" },
                    ats_score: { type: "string" },
                  },
                  required: ["bullet_score", "ats_score"],
                  additionalProperties: false,
                },
              },
              required: ["type", "why", "suggested_rewrite", "needs_user_input", "estimated_gain"],
              additionalProperties: false,
            },
          },
        },
        required: ["id", "original", "detected_language", "bullet_score", "ats_risk_level", "issues", "suggestions"],
        additionalProperties: false,
      },
    },
  },
  required: ["overall_potential_gain", "bullets"],
  additionalProperties: false,
};
