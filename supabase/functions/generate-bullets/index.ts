import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT_SV = `Du är en expertrekryterare och CV-skribent på seniornivå. Du genererar CV-bullets som är recruiter-grade, konkreta, och strikt icke-hallucinerande.

## HÅRDA REGLER – BRYT ALDRIG:

1. ANTI-HALLUCINATION:
- Hitta ALDRIG på mätetal, siffror, procent, kronor, teamstorlek, kunder, varumärken, certifikat eller teknologier som användaren INTE angett.
- Om mätetal saknas: skriv "[FYLL I: t.ex. +X% / -Y% / SEK Z / timmar / NPS]"
- Om ansvar är oklart: skriv neutralt ("Bidrog till…", "Stöttade…", "Drev del av…")
- Påstå ALDRIG att användaren "ägde P&L", "ledde team", "byggde strategi" om det inte står i input.

2. FLOSKEL-FILTER (blocklista):
"resultatorienterad", "driven", "passionerad", "team player", "hög nivå", "strategisk", "innovativ", "ansvarade för", "hands-on", "proaktiv", "engagerad"

3. BULLET-FORMAT (recruiter-grade):
A) Verb + objekt + metod/verktyg + effekt (om känd)
B) Scope + leverans + cross-functional signal
C) Problem → åtgärd → outcome (utan hittepå)

4. SENIOR BULLET ORDERING (Outcome/Decision First):
- Standardmönster för seniora roller: börja med Outcome eller Decision-Purpose (vad det möjliggjorde), sedan metod/hur, sedan scope, avsluta med mätetal om angivet annars placeholder.
- Om bullet börjar med generiskt aktivitetsverb (Utvecklade, Arbetade, Ansvarade): omformulera till outcome-first ("Möjliggjorde X genom att...", "Förbättrade X genom att...", "Stöttade beslut om X genom att...")
- Ge +1 struktur om bullet börjar med outcome/decision-purpose och är saklig.
- Straffa generiska aktivitets-first-bullets om aktiviteten inte är ovanligt specifik.
- Om inget mätbart utfall finns: använd [FYLL I: ROI / besparing / marginal / godkännande / tid-till-beslut]

5. SPRÅK: Skriv ALLT på svenska. Aldrig engelska.
- Kort, aktivt språk. 1 rad per bullet (max 2)
- Starka verb: byggde, drev, införde, automatiserade, standardiserade, analyserade, förhandlade, lanserade, migrerade, förbättrade, säkrade, optimerade, etablerade, samordnade
- Outcome-first verb: möjliggjorde, stöttade, förbättrade, accelererade, säkerställde, effektiviserade

5. TRE NIVÅER:
- "bas": ATS-safe, standard, professionell.
- "skarpt": Mer konverterande, tydligare impact-signaler.
- "max": Mest "stick out" men fortfarande 100% icke-hallucinerande.

6. KVALITETSKONTROLL:
- Finns hallucinerade siffror? → Ta bort eller ersätt med [FYLL I]
- Finns floskler utan substans? → Omformulera
- Överdrivna claims? → Tona ner
- Är varje bullet unik? → Dedup`;

const SYSTEM_PROMPT_EN = `You are a senior-level expert recruiter and CV writer. You generate recruiter-grade, concrete, strictly non-hallucinating CV bullets.

## HARD RULES – NEVER BREAK:

1. ANTI-HALLUCINATION:
- NEVER fabricate metrics, numbers, percentages, currency, team size, clients, brands, certifications, or technologies the user has NOT provided.
- If metrics are missing: write "[FILL IN: e.g. +X% / -Y% / $Z / hours / NPS]"
- If responsibility is unclear: write neutrally ("Contributed to…", "Supported…", "Drove part of…")
- NEVER claim the user "owned P&L", "led team", "built strategy" unless stated in input.

2. BUZZWORD FILTER (blocklist):
"results-oriented", "driven", "passionate", "team player", "high level", "strategic", "innovative", "responsible for", "hands-on", "proactive", "engaged"

3. BULLET FORMAT (recruiter-grade):
A) Verb + object + method/tool + effect (if known)
B) Scope + deliverable + cross-functional signal
C) Problem → action → outcome (without fabrication)

4. LANGUAGE: Write EVERYTHING in English. Never Swedish.
- Concise, active language. 1 line per bullet (max 2)
- Strong verbs: built, drove, implemented, automated, standardized, analyzed, negotiated, launched, migrated, improved, secured, optimized, established, coordinated

5. THREE LEVELS:
- "bas": ATS-safe, standard, professional.
- "skarpt": More converting, clearer impact signals.
- "max": Most "stand out" but still 100% non-hallucinating.

6. QUALITY CONTROL:
- Hallucinated numbers? → Remove or replace with [FILL IN]
- Buzzwords without substance? → Rephrase
- Overclaimed? → Tone down
- Every bullet unique? → Dedup`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const input = await req.json();
    const { jobTitle, period, industry, companyType, tasks, tools, stakeholders, results, constraints, tone, seniority, language } = input;
    const lang = language === "en" ? "en" : "sv";

    if (!jobTitle || !tasks || tasks.length === 0) {
      return new Response(JSON.stringify({ error: lang === "en" ? "Job title and at least one task required" : "Rolltitel och minst en uppgift krävs" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = lang === "en" ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_SV;

    const labels = lang === "en" ? {
      generate: "Generate CV bullets for the following role:",
      role: "Role", period: "Period", industry: "Industry", company_type: "Company type",
      seniority: "Seniority", tone: "Tone", tasks: "Key tasks", tools: "Tools/methods",
      stakeholders: "Stakeholders", results: "Results/impact", constraints: "Do NOT mention",
      none: "None specified", no_metrics: "No metrics provided – use [FILL IN] for all metrics",
    } : {
      generate: "Generera CV-bullets för följande roll:",
      role: "Roll", period: "Period", industry: "Bransch", company_type: "Bolagstyp",
      seniority: "Senioritet", tone: "Ton", tasks: "Huvuduppgifter", tools: "Verktyg/metoder",
      stakeholders: "Stakeholders", results: "Resultat/impact", constraints: "Saker som INTE ska nämnas",
      none: "Inga angivna", no_metrics: "Inga mätetal angivna – använd [FYLL I] för alla mätetal",
    };

    const userPrompt = `${labels.generate}

**${labels.role}:** ${jobTitle}
**${labels.period}:** ${period || labels.none}
**${labels.industry}:** ${industry || labels.none}
**${labels.company_type}:** ${companyType || labels.none}
**${labels.seniority}:** ${seniority || "IC"}
**${labels.tone}:** ${tone || (lang === "en" ? "Factual" : "Saklig")}

**${labels.tasks}:**
${tasks.map((t: string, i: number) => `${i + 1}. ${t}`).join("\n")}

**${labels.tools}:** ${tools?.length ? tools.join(", ") : labels.none}
**${labels.stakeholders}:** ${stakeholders?.length ? stakeholders.join(", ") : labels.none}
**${labels.results}:** ${results || labels.no_metrics}
**${labels.constraints}:** ${constraints || (lang === "en" ? "No constraints" : "Inga begränsningar")}

${lang === "en" ? "Generate 4-6 bullets per level (bas, skarpt, max). Return as JSON via tool call." : "Generera 4-6 bullets per nivå (bas, skarpt, max). Returnera som JSON via tool call."}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.5,
        tools: [
          {
            type: "function",
            function: {
              name: "return_bullets",
              description: "Return the generated CV bullets in structured format",
              parameters: {
                type: "object",
                properties: {
                  bullets: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        level: { type: "string", enum: ["bas", "skarpt", "max"] },
                        bullet: { type: "string" },
                        tags: { type: "array", items: { type: "string" } },
                        confidence: { type: "string", enum: ["high", "medium", "low"] },
                        needs_user_input: { type: "array", items: { type: "string" } },
                      },
                      required: ["level", "bullet", "tags", "confidence", "needs_user_input"],
                      additionalProperties: false,
                    },
                  },
                  follow_up_questions: { type: "array", items: { type: "string" } },
                  blocked_phrases_detected: { type: "array", items: { type: "string" } },
                },
                required: ["bullets", "follow_up_questions", "blocked_phrases_detected"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_bullets" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: lang === "en" ? "Too many requests, please wait." : "För många förfrågningar, vänta en stund." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: lang === "en" ? "AI credits depleted." : "AI-krediter slut." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      const content = result.choices?.[0]?.message?.content;
      if (content) {
        let jsonStr = content.trim();
        if (jsonStr.startsWith("```")) {
          jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
        }
        const parsed = JSON.parse(jsonStr);
        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("No structured output from AI");
    }

    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error generating bullets:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
