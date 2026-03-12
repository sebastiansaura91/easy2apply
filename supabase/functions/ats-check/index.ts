import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { resume_content_json, job_posting_text, locale, target_role_title } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const renderedText = buildRenderedText(resume_content_json);
    const lang = locale === "en" ? "en" : "sv";
    const systemPrompt = lang === "sv" ? SYSTEM_PROMPT_SV : SYSTEM_PROMPT_EN;

    let userPrompt = `## CV DATA (JSON)\n\`\`\`json\n${JSON.stringify(resume_content_json, null, 2)}\n\`\`\`\n\n`;
    userPrompt += `## RENDERED PLAIN TEXT (what ATS sees)\n\`\`\`\n${renderedText}\n\`\`\`\n\n`;
    if (job_posting_text) userPrompt += `## JOB POSTING\n\`\`\`\n${job_posting_text}\n\`\`\`\n\n`;
    if (target_role_title) userPrompt += `## TARGET ROLE: ${target_role_title}\n\n`;
    userPrompt += `Perform the full ATS analysis now. Return the result via the ats_check_result tool.`;

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
            name: "ats_check_result",
            description: "Return the complete ATS check analysis result",
            parameters: RESULT_SCHEMA,
          },
        }],
        tool_choice: { type: "function", function: { name: "ats_check_result" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Försök igen om en stund." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Betalning krävs." }), {
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
    console.error("ats-check error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// --- Build plain text from CV JSON ---

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
    switch (section.type) {
      case "profile":
        if (cv.profile) lines.push("PROFIL", cv.profile, "");
        break;
      case "experience":
        if (cv.experience?.length) {
          lines.push("ARBETSLIVSERFARENHET");
          for (const exp of cv.experience) {
            lines.push(`${exp.title}${exp.company ? ", " + exp.company : ""}${exp.location ? " – " + exp.location : ""}`);
            lines.push(`${exp.startDate} – ${exp.isPresent ? "Nuvarande" : exp.endDate}`);
            for (const b of exp.bullets || []) if (b.trim()) lines.push(`• ${b}`);
            lines.push("");
          }
        }
        break;
      case "education":
        if (cv.education?.length) {
          lines.push("UTBILDNING");
          for (const edu of cv.education) {
            lines.push(`${edu.degree}${edu.field ? ", " + edu.field : ""}`);
            lines.push(`${edu.school} · ${edu.startDate} – ${edu.endDate}`);
            lines.push("");
          }
        }
        break;
      case "skills":
        if (cv.skills?.length) lines.push("KOMPETENSER", cv.skills.join(", "), "");
        break;
      case "certifications":
        if (cv.certifications?.length) {
          lines.push("CERTIFIERINGAR");
          for (const cert of cv.certifications) lines.push(`${cert.name} – ${cert.issuer} (${cert.date})`);
          lines.push("");
        }
        break;
      case "projects":
        if (cv.projects?.length) {
          lines.push("PROJEKT");
          for (const p of cv.projects) {
            lines.push(p.name);
            if (p.description) lines.push(p.description);
            for (const b of p.bullets || []) if (b.trim()) lines.push(`• ${b}`);
            lines.push("");
          }
        }
        break;
      case "languages":
        if (cv.languages?.length) {
          lines.push("SPRÅK");
          for (const l of cv.languages) lines.push(`${l.language} – ${l.level}`);
          lines.push("");
        }
        break;
      case "other":
        if (cv.other) lines.push("ÖVRIGT", cv.other, "");
        break;
    }
  }
  return lines.join("\n");
}

// --- System prompts ---

const SCORING_RULES = `
## SCORING (0–100)

### A) Parse Safety (0–40)
- Single-column & reading order: 0–12 (BLOCKER if multi-column/table)
- Standard headings: 0–8
- Contact info present (name + email required): 0–8 (BLOCKER if email missing)
- Date consistency (YYYY-MM or similar): 0–8
- No parser noise (emojis, symbol rows, pipes): 0–4

### B) Relevance (0–30)
If job posting provided:
- Must-have skills coverage (weighted by recency + context): 0–16
- Nice-to-have coverage: 0–6
- Title alignment: 0–4
- Domain fit: 0–4
Penalties: keyword stuffing -0..6, repetition without context -0..4
If NO job posting: max 20, rest marked N/A.

### C) Evidence Quality (0–20)
- Strong verb + clear object: 0–6
- Method/tool specificity: 0–5
- Effect described (numbers optional): 0–5
- Scope/seniority signal without overclaim: 0–4
Penalties: buzzwords -0..6, overclaim without support -0..8

### D) Readability (0–10)
- Bullet length (ideal 90–180 chars): 0–3
- Repeated verbs/openers: 0–3
- Dense profile text: 0–2
- Line break hygiene: 0–2

## GRADES
90–100=A, 80–89=B, 70–79=C, 60–69=D, <60=F

## RECENCY WEIGHTING
Skills in recent roles (0–2y) weight 1.0, 2–5y: 0.7, 5–10y: 0.4, 10+: 0.2
Skills in Skills-section only: ×0.6, in Summary: ×0.8

## HEADING WHITELIST (case-insensitive)
Profil/Summary, Arbetslivserfarenhet/Experience, Utbildning/Education, Kompetenser/Skills, Certifieringar/Certifications, Projekt/Projects, Språk/Languages, Övrigt/Other
`;

const HARD_RULES = `
## HARD RULES
- NO hallucinations. NEVER invent numbers, tools, responsibilities, or outcomes.
- Every finding MUST cite evidence: text excerpt or JSON path (e.g. Experience[1].bullets[2]).
- Recommendations must be concrete and immediately actionable.
- If impact is missing, suggest metric TYPES with placeholder: "[FILL IN: % / $ / hours / volume / NPS]"
- If scope is missing: "[FILL IN: team / stakeholders / budget]"
- Blocklist words (flag as buzzwords): "results-oriented", "driven", "passionate", "team player", "innovative", "responsible for", "strategic thinker"
- Never require numbers in bullets. Effect without numbers is valid.
`;

const SYSTEM_PROMPT_SV = `Du är en expert-rekryterare och ATS-specialist. Analysera CV:t och returnera en realistisk ATS-score med prioriterade åtgärder.

${SCORING_RULES}
${HARD_RULES}

Svara ALLTID på svenska i alla textfält. Var saklig, konkret och floskelfri.`;

const SYSTEM_PROMPT_EN = `You are an expert recruiter and ATS specialist. Analyze the CV and return a realistic ATS score with prioritized actions.

${SCORING_RULES}
${HARD_RULES}

Always respond in English in all text fields. Be factual, concrete, and buzzword-free.`;

// --- Output schema ---

const RESULT_SCHEMA = {
  type: "object",
  properties: {
    ats_score: { type: "number" },
    grade: { type: "string", enum: ["A", "B", "C", "D", "F"] },
    summary: { type: "string" },
    subscores: {
      type: "object",
      properties: {
        parse: { type: "number" },
        relevance: { type: "number" },
        evidence: { type: "number" },
        readability: { type: "number" },
      },
      required: ["parse", "relevance", "evidence", "readability"],
      additionalProperties: false,
    },
    blockers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          why_it_matters: { type: "string" },
          evidence: { type: "string" },
          fix: { type: "string" },
        },
        required: ["title", "why_it_matters", "evidence", "fix"],
        additionalProperties: false,
      },
    },
    top_issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string", enum: ["parse", "relevance", "evidence", "readability"] },
          severity: { type: "string", enum: ["high", "medium", "low"] },
          problem: { type: "string" },
          evidence: { type: "string" },
          fix: { type: "string" },
          example_rewrite: { type: "string" },
        },
        required: ["category", "severity", "problem", "evidence", "fix"],
        additionalProperties: false,
      },
    },
    keyword_gap: {
      type: "object",
      properties: {
        must_have_missing: { type: "array", items: { type: "string" } },
        nice_to_have_missing: { type: "array", items: { type: "string" } },
        suggested_insertions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              keyword: { type: "string" },
              where: { type: "string" },
              safe_phrase: { type: "string" },
            },
            required: ["keyword", "where", "safe_phrase"],
            additionalProperties: false,
          },
        },
      },
      required: ["must_have_missing", "nice_to_have_missing", "suggested_insertions"],
      additionalProperties: false,
    },
    next_actions: { type: "array", items: { type: "string" } },
  },
  required: ["ats_score", "grade", "summary", "subscores", "blockers", "top_issues", "keyword_gap", "next_actions"],
  additionalProperties: false,
};
