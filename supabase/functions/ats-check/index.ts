import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { resume_content_json, job_posting_text, locale } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const renderedText = buildRenderedText(resume_content_json);
    const bulletList = extractBullets(resume_content_json);
    const lang = locale === "en" ? "en" : "sv";
    const systemPrompt = lang === "sv" ? SYSTEM_PROMPT_SV : SYSTEM_PROMPT_EN;

    let userPrompt = `## CV DATA (JSON)\n\`\`\`json\n${JSON.stringify(resume_content_json, null, 2)}\n\`\`\`\n\n`;
    userPrompt += `## RENDERED PLAIN TEXT (what ATS sees)\n\`\`\`\n${renderedText}\n\`\`\`\n\n`;
    userPrompt += `## BULLETS WITH IDS\n\`\`\`json\n${JSON.stringify(bulletList, null, 2)}\n\`\`\`\n\n`;
    if (job_posting_text) userPrompt += `## JOB POSTING\n\`\`\`\n${job_posting_text}\n\`\`\`\n\n`;
    userPrompt += `Perform the full ATS + Recruiter Scan analysis now. Return the result via the ats_check_result tool. ALL text output MUST be in ${lang === "sv" ? "Swedish" : "English"}.`;

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
            description: "Return the complete ATS + Recruiter Scan analysis result",
            parameters: RESULT_SCHEMA,
          },
        }],
        tool_choice: { type: "function", function: { name: "ats_check_result" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required." }), {
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

// --- Extract bullets ---
function extractBullets(cv: any): { id: string; text: string }[] {
  const bullets: { id: string; text: string }[] = [];
  for (let i = 0; i < (cv.experience?.length || 0); i++) {
    for (let j = 0; j < (cv.experience[i].bullets?.length || 0); j++) {
      if (cv.experience[i].bullets[j]?.trim()) {
        bullets.push({ id: `experience[${i}].bullets[${j}]`, text: cv.experience[i].bullets[j] });
      }
    }
  }
  for (let i = 0; i < (cv.projects?.length || 0); i++) {
    for (let j = 0; j < (cv.projects[i].bullets?.length || 0); j++) {
      if (cv.projects[i].bullets[j]?.trim()) {
        bullets.push({ id: `projects[${i}].bullets[${j}]`, text: cv.projects[i].bullets[j] });
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

const SCORING_MODEL = `
## SCORING MODEL (0–100)

### A) Parse Safety (0–30)
- Standard headings recognized: 0–8
- Contact info in body flow (name + email required): 0–8
- Date consistency (YYYY-MM or similar): 0–6
- Language consistency: 0–4
- No parser noise (emojis, symbol rows, pipes): 0–4

### B) Recruiter Scanability (0–30)
- Single-column flow (no sidebars, no split layout): 0–8
  If multi-column/sidebar detected: FAIL, max 2 points.
  Feedback: "Sidebars break the natural scan path."
- Whitespace & section separation: 0–6
  Feedback if cluttered: "If a recruiter has to work to find your value, they won't."
- Short scannable bullets (90–180 chars ideal): 0–4
- No table-like layout structures: 0–4
  Feedback: "Tables break visual hierarchy."
- Contact info placement (in main body flow, not header-isolated): 0–4
  Feedback: "Headers get skipped on a fast scan. Put name/email where the eye lands first."
- Clean vs cluttered overall impression: 0–4

### C) Relevance to Job Ad (0–25)
If job posting provided:
- Must-have terminology coverage: 0–12
- Nice-to-have coverage: 0–5
- Job-description wording alignment (their words vs generic): 0–5
  Feedback: "Generic language gets glossed over. Use the employer's language where it truthfully reflects your work."
- Title alignment: 0–3
If NO job posting: score out of 15 max, rest N/A.

### D) Evidence & Credibility (0–15)
- Decision-purpose or outcome signal: 0–5
  Penalize bullets that describe activity without consequence.
  Feedback: "This explains activity, but not why it mattered."
- Method/tool specificity: 0–4
- Strong verb start (outcome-first for senior roles): 0–3
- No generic claims or buzzwords: 0–3

## GRADES
90–100=A, 80–89=B, 70–79=C, 60–69=D, <60=F
`;

const FEEDBACK_RULES = `
## FEEDBACK RULES
- NEVER give generic advice: "use stronger verbs", "add more numbers", "improve readability", "consider adding skills"
- Every recommendation MUST be tied to a specific section or bullet
- Every recommendation MUST have a clear motivation and a concrete fix or rewrite
- Tone: sharp, pragmatic, recruiter-grade. Not AI-fluffy, not overly pedagogical.
- Write short, clear, confident.
- DO use: "This section is harder to scan than it needs to be.", "This bullet describes work, but not why it mattered."
- DO NOT use: "Consider…", "You may want to…", "Potentially…", "Try to…"
- Be direct.

## ANTI-HALLUCINATION
- NEVER fabricate numbers, tools, responsibilities, or outcomes.
- If impact is missing, use placeholder: "[FILL IN: ROI / savings / margin / approval / time-to-decision]"
- If scope is missing: "[FILL IN: team / stakeholders / budget]"
- Every finding MUST cite evidence from the CV.

## BULLET-LEVEL FEEDBACK
For each bullet, assess:
1. Is it too generic?
2. Does it describe activity without value?
3. Does it use candidate's own words instead of job ad language?
4. Is it too long or too compact?
5. Does it lack decision-purpose / consequence signal?
6. Is it hard to scan quickly?

Issue type "generic_activity": triggered when bullet starts with neutral verbs (developed, worked on, responsible for, managed, handled, assisted) AND lacks decision-purpose, scope, consequence, or recruiter-relevant framing.

## BULLET REWRITE PRINCIPLES
For senior/commercial/strategic roles, default rewrite pattern:
1. Decision-purpose first
2. Method/how second
3. Outcome third (only if confirmed, otherwise placeholder)

## SCANABILITY CHECK
Return 5 dimensions:
- single_column_flow: pass/warning/fail
- contact_info: pass/warning/fail
- plain_text_layout: pass/warning/fail
- job_language_match: pass/warning/fail (fail if no job posting = warning with note)
- clean_vs_cluttered: pass/warning/fail

## FIRST SCAN ISSUES
Return the 3 most important problems a recruiter would notice in the first 6–10 second scan. These must be high-level, visual/structural observations.
`;

const SYSTEM_PROMPT_SV = `Du är en expert-rekryterare och ATS-specialist. Du bedömer CV:t som BÅDE en maskin (ATS) OCH en stressad rekryterare som skannar i 6–10 sekunder.

${SCORING_MODEL}
${FEEDBACK_RULES}

Svara ALLTID på svenska i alla textfält. Var skarp, konkret och direkt. Ingen fluff.`;

const SYSTEM_PROMPT_EN = `You are an expert recruiter and ATS specialist. You evaluate the CV as BOTH a machine (ATS) AND a stressed recruiter scanning in 6–10 seconds.

${SCORING_MODEL}
${FEEDBACK_RULES}

Always respond in English in all text fields. Be sharp, concrete, and direct. No fluff.`;

// --- Output schema ---

const RESULT_SCHEMA = {
  type: "object",
  properties: {
    overall_score: { type: "number" },
    grade: { type: "string", enum: ["A", "B", "C", "D", "F"] },
    summary: { type: "string", description: "1-2 sentence recruiter-style summary" },
    subscores: {
      type: "object",
      properties: {
        parse: { type: "number", description: "0-30" },
        scanability: { type: "number", description: "0-30" },
        relevance: { type: "number", description: "0-25" },
        evidence: { type: "number", description: "0-15" },
      },
      required: ["parse", "scanability", "relevance", "evidence"],
      additionalProperties: false,
    },
    first_scan_issues: {
      type: "array",
      description: "Top 3 problems a recruiter sees in first 6-10 seconds",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          why_it_matters: { type: "string" },
          fix: { type: "string" },
        },
        required: ["title", "why_it_matters", "fix"],
        additionalProperties: false,
      },
    },
    scanability_check: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dimension: { type: "string", enum: ["single_column_flow", "contact_info", "plain_text_layout", "job_language_match", "clean_vs_cluttered"] },
          status: { type: "string", enum: ["pass", "warning", "fail"] },
          why_it_matters: { type: "string" },
          recommendation: { type: "string" },
        },
        required: ["dimension", "status", "why_it_matters", "recommendation"],
        additionalProperties: false,
      },
    },
    parse_check: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dimension: { type: "string" },
          status: { type: "string", enum: ["pass", "warning", "fail"] },
          why_it_matters: { type: "string" },
          recommendation: { type: "string" },
        },
        required: ["dimension", "status", "why_it_matters", "recommendation"],
        additionalProperties: false,
      },
    },
    job_language_match: {
      type: "object",
      properties: {
        missing_phrases: { type: "array", items: { type: "string" } },
        generic_phrases_to_replace: { type: "array", items: { type: "string" } },
        suggested_replacements: {
          type: "array",
          items: {
            type: "object",
            properties: {
              from: { type: "string" },
              to: { type: "string" },
              where: { type: "string" },
            },
            required: ["from", "to", "where"],
            additionalProperties: false,
          },
        },
      },
      required: ["missing_phrases", "generic_phrases_to_replace", "suggested_replacements"],
      additionalProperties: false,
    },
    bullet_feedback: {
      type: "array",
      items: {
        type: "object",
        properties: {
          bullet_id: { type: "string" },
          score: { type: "number", description: "0-10" },
          issues: { type: "array", items: { type: "string" } },
          recruiter_comment: { type: "string" },
          suggestions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["decision_first", "keyword_alignment", "shorter", "clearer", "language_match"] },
                why: { type: "string" },
                rewrite: { type: "string" },
                estimated_gain: { type: "string" },
              },
              required: ["type", "why", "rewrite", "estimated_gain"],
              additionalProperties: false,
            },
          },
        },
        required: ["bullet_id", "score", "issues", "recruiter_comment", "suggestions"],
        additionalProperties: false,
      },
    },
    next_actions: { type: "array", items: { type: "string" }, description: "Max 5 prioritized actions" },
  },
  required: ["overall_score", "grade", "summary", "subscores", "first_scan_issues", "scanability_check", "parse_check", "job_language_match", "bullet_feedback", "next_actions"],
  additionalProperties: false,
};
