import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { resume_content_json, job_posting_text, locale, target_role_title, target_industry } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build rendered plain text from CV JSON (simulates what ATS sees)
    const renderedText = buildRenderedText(resume_content_json);
    const lang = locale === "en" ? "en" : "sv";

    const systemPrompt = lang === "sv" ? SYSTEM_PROMPT_SV : SYSTEM_PROMPT_EN;

    const userPrompt = buildUserPrompt({
      resume_content_json,
      rendered_plain_text: renderedText,
      job_posting_text,
      target_role_title,
      target_industry,
      lang,
    });

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
        tools: [
          {
            type: "function",
            function: {
              name: "ats_check_result",
              description: "Return the complete ATS check analysis result",
              parameters: ATS_RESULT_SCHEMA,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "ats_check_result" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Försök igen om en stund." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Betalning krävs. Lägg till krediter i din workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response:", JSON.stringify(aiData));
      return new Response(JSON.stringify({ error: "AI did not return structured result" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result;
    try {
      result = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } catch {
      return new Response(JSON.stringify({ error: "Failed to parse AI result" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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

function buildRenderedText(cv: any): string {
  const lines: string[] = [];
  if (cv?.contact) {
    const c = cv.contact;
    if (c.name) lines.push(c.name);
    const contactParts = [c.email, c.phone, c.city, c.linkedin, c.website].filter(Boolean);
    if (contactParts.length) lines.push(contactParts.join(" · "));
    lines.push("");
  }

  const sectionOrder = (cv?.sections || [])
    .filter((s: any) => s.enabled)
    .sort((a: any, b: any) => a.order - b.order);

  for (const section of sectionOrder) {
    switch (section.type) {
      case "contact":
        break;
      case "profile":
        if (cv.profile) {
          lines.push("PROFIL", cv.profile, "");
        }
        break;
      case "experience":
        if (cv.experience?.length) {
          lines.push("ARBETSLIVSERFARENHET");
          for (const exp of cv.experience) {
            lines.push(`${exp.title}${exp.company ? ", " + exp.company : ""}${exp.location ? " – " + exp.location : ""}`);
            lines.push(`${exp.startDate} – ${exp.isPresent ? "Nuvarande" : exp.endDate}`);
            for (const b of exp.bullets || []) {
              if (b.trim()) lines.push(`• ${b}`);
            }
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
        if (cv.skills?.length) {
          lines.push("KOMPETENSER", cv.skills.join(", "), "");
        }
        break;
      case "certifications":
        if (cv.certifications?.length) {
          lines.push("CERTIFIERINGAR");
          for (const cert of cv.certifications) {
            lines.push(`${cert.name} – ${cert.issuer} (${cert.date})`);
          }
          lines.push("");
        }
        break;
      case "projects":
        if (cv.projects?.length) {
          lines.push("PROJEKT");
          for (const p of cv.projects) {
            lines.push(p.name);
            if (p.description) lines.push(p.description);
            for (const b of p.bullets || []) {
              if (b.trim()) lines.push(`• ${b}`);
            }
            lines.push("");
          }
        }
        break;
      case "languages":
        if (cv.languages?.length) {
          lines.push("SPRÅK");
          for (const l of cv.languages) {
            lines.push(`${l.language} – ${l.level}`);
          }
          lines.push("");
        }
        break;
      case "other":
        if (cv.other) {
          lines.push("ÖVRIGT", cv.other, "");
        }
        break;
    }
  }
  return lines.join("\n");
}

function buildUserPrompt(opts: {
  resume_content_json: any;
  rendered_plain_text: string;
  job_posting_text?: string;
  target_role_title?: string;
  target_industry?: string;
  lang: string;
}) {
  let prompt = `## CV DATA (JSON)\n\`\`\`json\n${JSON.stringify(opts.resume_content_json, null, 2)}\n\`\`\`\n\n`;
  prompt += `## RENDERED PLAIN TEXT (what ATS sees)\n\`\`\`\n${opts.rendered_plain_text}\n\`\`\`\n\n`;

  if (opts.job_posting_text) {
    prompt += `## JOB POSTING\n\`\`\`\n${opts.job_posting_text}\n\`\`\`\n\n`;
  }
  if (opts.target_role_title) {
    prompt += `## TARGET ROLE: ${opts.target_role_title}\n`;
  }
  if (opts.target_industry) {
    prompt += `## TARGET INDUSTRY: ${opts.target_industry}\n`;
  }

  prompt += `\nPerform the full ATS analysis now. Return the result via the ats_check_result tool.`;
  return prompt;
}

const SYSTEM_PROMPT_SV = `Du är en expert-rekryterare och ATS-specialist som analyserar CV:n med extrem noggrannhet.

DIN UPPGIFT: Analysera ett CV end-to-end och returnera en detaljerad ATS-score med tre profiler.

## SCORINGMODELL (0–100)

### A) ParseSafety (0–40)
- Enkolumn & läsordning: 0–12 (BLOCKER om multi-column/tabell)
- Standardiserade rubriker (sv/en whitelist): 0–8
- Kontaktuppgifter parse-säkerhet: 0–8 (BLOCKER om email eller namn saknas)
- Datumformat & konsekvens (YYYY-MM): 0–8
- Noise & parser-traps (emojis, symbolrader, pipes): 0–4

### B) Relevance (0–30)
Om jobbannons finns:
- Must-have skills coverage (viktad med kontext + recency): 0–16
- Nice-to-have coverage: 0–6
- Titelalignment: 0–4
- Domain fit: 0–4
Penalties: Keyword stuffing -0..6, Wrong-domain signals -0..4
Om jobbannons saknas: max 18, resten N/A.

### C) EvidenceQuality (0–20)
- Action clarity (starkt verb + objekt): 0–6
- Method/tool specificity: 0–5
- Outcome signal: 0–5
- Seniority signal: 0–4
Penalties: Floskel-density -0..6, Overclaim -0..8

### D) Readability (0–10)
- Bullet-längd (ideal 90–180 tecken): 0–3
- Repetition: 0–3
- Sektionsdensitet: 0–2
- Formateringshygien: 0–2

## TRE ATS-PROFILER
1) EnterpriseStrict (Workday/Taleo/SAP): hård på parse + rubriker + datum
2) ModernSaaS (Greenhouse/Lever/Teamtailor): tolerant men viktar relevans/skill-in-context
3) SMBBasic: primärt keyword match + grundläggande parse
Overall = Enterprise 0.45 + Modern 0.40 + SMB 0.15

## RECENCY-WEIGHTING
- 0–2 år: 1.0, 2–5 år: 0.7, 5–10 år: 0.4, 10+ år: 0.2
- Skills-sektion: ×0.6, Summary/Profil: ×0.8

## SKILL DEPTH
- depth 1: nämnd en gång
- depth 2: i minst 2 roller
- depth 3: kopplad till verb+objekt i Experience
- depth 4: kopplad till outcome-signal

## HÅRDA REGLER
- INGA hallucinationer. Hitta ALDRIG på siffror, system, certifikat, kunder.
- Varje finding MÅSTE ha evidence: utdrag från text ELLER path (t.ex. Experience[1].bullets[2])
- Rekommendationer ska vara konkreta och snabba att åtgärda.
- Om impact saknas: föreslå mätetal-TYPER med "[FYLL I: % / SEK / timmar / volym / NPS]"
- Om scope saknas: föreslå "[FYLL I: team / stakeholders / budget]"
- Blocklist-ord utan substans: "resultatorienterad", "driven", "passionerad", "team player", "hög nivå", "innovativ", "ansvarade för"
- Career progression: flagga som medium issue om titlar hoppar utan förklaring, men döm aldrig.

## HEADING WHITELIST
Acceptera (case-insensitive): Kontakt/Contact, Profil/Summary/Professional Summary, Arbetslivserfarenhet/Erfarenhet/Experience/Work Experience/Employment, Utbildning/Education, Kompetenser/Skills/Technical Skills, Certifieringar/Certifications, Projekt/Projects, Språk/Languages, Övrigt/Additional/Other

## BETYG
A: 85–100, B: 70–84, C: 55–69, D: 40–54, F: 0–39

Svara ALLTID på svenska i alla text-fält.`;

const SYSTEM_PROMPT_EN = `You are an expert recruiter and ATS specialist who analyzes CVs with extreme accuracy.

YOUR TASK: Analyze a CV end-to-end and return a detailed ATS score with three profiles.

## SCORING MODEL (0–100)

### A) ParseSafety (0–40)
- Single-column & reading order: 0–12 (BLOCKER if multi-column/table)
- Standard headings (sv/en whitelist): 0–8
- Contact parse reliability: 0–8 (BLOCKER if email or name missing)
- Date normalization & consistency (YYYY-MM): 0–8
- Noise & parser-traps (emojis, symbol rows, pipes): 0–4

### B) Relevance (0–30)
If job posting provided:
- Must-have skills coverage (context + recency weighted): 0–16
- Nice-to-have coverage: 0–6
- Title alignment: 0–4
- Domain fit: 0–4
Penalties: Keyword stuffing -0..6, Wrong-domain signals -0..4
If no job posting: max 18, rest N/A.

### C) EvidenceQuality (0–20)
- Action clarity (strong verb + object): 0–6
- Method/tool specificity: 0–5
- Outcome signal: 0–5
- Seniority signal: 0–4
Penalties: Buzzword density -0..6, Overclaim -0..8

### D) Readability (0–10)
- Bullet length (ideal 90–180 chars): 0–3
- Repetition: 0–3
- Section density: 0–2
- Formatting hygiene: 0–2

## THREE ATS PROFILES
1) EnterpriseStrict (Workday/Taleo/SAP): strict on parse + headings + dates
2) ModernSaaS (Greenhouse/Lever/Teamtailor): tolerant but weights relevance/skill-in-context
3) SMBBasic: primarily keyword match + basic parse
Overall = Enterprise 0.45 + Modern 0.40 + SMB 0.15

## RECENCY WEIGHTING
- 0–2 years: 1.0, 2–5: 0.7, 5–10: 0.4, 10+: 0.2
- Skills section: ×0.6, Summary/Profile: ×0.8

## SKILL DEPTH
- depth 1: mentioned once
- depth 2: in at least 2 roles
- depth 3: linked to verb+object in Experience
- depth 4: linked to outcome signal

## HARD RULES
- NO hallucinations. NEVER invent numbers, systems, certificates, clients.
- Every finding MUST have evidence: text excerpt OR path (e.g. Experience[1].bullets[2])
- Recommendations must be concrete and quick to fix.
- If impact missing: suggest metric TYPES with "[FILL IN: % / $ / hours / volume / NPS]"
- If scope missing: suggest "[FILL IN: team / stakeholders / budget]"
- Blocklist words without substance: "results-oriented", "driven", "passionate", "team player", "high level", "innovative", "responsible for"
- Career progression: flag as medium issue if titles jump without explanation, never judge.

## HEADING WHITELIST
Accept (case-insensitive): Kontakt/Contact, Profil/Summary/Professional Summary, Arbetslivserfarenhet/Erfarenhet/Experience/Work Experience/Employment, Utbildning/Education, Kompetenser/Skills/Technical Skills, Certifieringar/Certifications, Projekt/Projects, Språk/Languages, Övrigt/Additional/Other

## GRADES
A: 85–100, B: 70–84, C: 55–69, D: 40–54, F: 0–39

Always respond in English in all text fields.`;

const ATS_RESULT_SCHEMA = {
  type: "object",
  properties: {
    overall: {
      type: "object",
      properties: {
        ats_score: { type: "number" },
        grade: { type: "string", enum: ["A", "B", "C", "D", "F"] },
        summary: { type: "string" },
      },
      required: ["ats_score", "grade", "summary"],
      additionalProperties: false,
    },
    profiles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", enum: ["EnterpriseStrict", "ModernSaaS", "SMBBasic"] },
          score: { type: "number" },
          grade: { type: "string", enum: ["A", "B", "C", "D", "F"] },
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
                id: { type: "string" },
                title: { type: "string" },
                why_it_matters: { type: "string" },
                evidence: { type: "string" },
                fix: { type: "string" },
                fix_action: { type: "string" },
              },
              required: ["id", "title", "why_it_matters", "evidence", "fix"],
              additionalProperties: false,
            },
          },
          issues: {
            type: "array",
            items: {
              type: "object",
              properties: {
                severity: { type: "string", enum: ["high", "medium", "low"] },
                category: { type: "string", enum: ["parse_safety", "dates", "headings", "contact", "keywords", "evidence", "readability"] },
                title: { type: "string" },
                evidence: { type: "string" },
                recommendation: { type: "string" },
                example_rewrite: { type: "string" },
                fix_action: { type: "string" },
              },
              required: ["severity", "category", "title", "evidence", "recommendation"],
              additionalProperties: false,
            },
          },
        },
        required: ["name", "score", "grade", "subscores", "blockers", "issues"],
        additionalProperties: false,
      },
    },
    keyword_report: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["job_posting", "baseline", "none"] },
        taxonomy: {
          type: "object",
          properties: {
            must_have: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  term: { type: "string" },
                  depth: { type: "number" },
                  coverage: { type: "string", enum: ["missing", "weak", "ok", "strong"] },
                  evidence: { type: "array", items: { type: "string" } },
                },
                required: ["term", "depth", "coverage", "evidence"],
                additionalProperties: false,
              },
            },
            nice_to_have: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  term: { type: "string" },
                  depth: { type: "number" },
                  coverage: { type: "string", enum: ["missing", "weak", "ok", "strong"] },
                  evidence: { type: "array", items: { type: "string" } },
                },
                required: ["term", "depth", "coverage", "evidence"],
                additionalProperties: false,
              },
            },
            domain_terms: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  term: { type: "string" },
                  depth: { type: "number" },
                  coverage: { type: "string", enum: ["missing", "weak", "ok", "strong"] },
                  evidence: { type: "array", items: { type: "string" } },
                },
                required: ["term", "depth", "coverage", "evidence"],
                additionalProperties: false,
              },
            },
            seniority_cues: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  term: { type: "string" },
                  depth: { type: "number" },
                  coverage: { type: "string", enum: ["missing", "weak", "ok", "strong"] },
                  evidence: { type: "array", items: { type: "string" } },
                },
                required: ["term", "depth", "coverage", "evidence"],
                additionalProperties: false,
              },
            },
          },
          required: ["must_have", "nice_to_have", "domain_terms", "seniority_cues"],
          additionalProperties: false,
        },
        missing_must_have: { type: "array", items: { type: "string" } },
        missing_nice_to_have: { type: "array", items: { type: "string" } },
        overused_terms: { type: "array", items: { type: "string" } },
        suggested_insertion_points: {
          type: "array",
          items: {
            type: "object",
            properties: {
              term: { type: "string" },
              where: { type: "string" },
              safe_phrase: { type: "string" },
            },
            required: ["term", "where", "safe_phrase"],
            additionalProperties: false,
          },
        },
      },
      required: ["mode", "taxonomy", "missing_must_have", "missing_nice_to_have", "overused_terms", "suggested_insertion_points"],
      additionalProperties: false,
    },
    section_health: {
      type: "array",
      items: {
        type: "object",
        properties: {
          section: { type: "string" },
          status: { type: "string", enum: ["ok", "warn", "fail"] },
          notes: { type: "string" },
        },
        required: ["section", "status", "notes"],
        additionalProperties: false,
      },
    },
    next_actions: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["overall", "profiles", "keyword_report", "section_health", "next_actions"],
  additionalProperties: false,
};
