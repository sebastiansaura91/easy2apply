import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Du är en expertrekryterare och CV-skribent på seniornivå. Du genererar CV-bullets som är recruiter-grade, konkreta, och strikt icke-hallucinerande.

## HÅRDA REGLER – BRYT ALDRIG:

1. ANTI-HALLUCINATION:
- Hitta ALDRIG på mätetal, siffror, procent, kronor, teamstorlek, kunder, varumärken, certifikat eller teknologier som användaren INTE angett.
- Om mätetal saknas: skriv "[FYLL I: t.ex. +X% / -Y% / SEK Z / timmar / NPS]"
- Om ansvar är oklart: skriv neutralt ("Bidrog till…", "Stöttade…", "Drev del av…")
- Påstå ALDRIG att användaren "ägde P&L", "ledde team", "byggde strategi" om det inte står i input.
- Flagga osäkerheter som "[Behöver bekräftas]" istället för att gissa.

2. FLOSKEL-FILTER (blocklista):
Dessa ord/fraser får ALDRIG användas fristående utan konkret substans:
"resultatorienterad", "driven", "passionerad", "team player", "hög nivå", "strategisk", "innovativ", "ansvarade för", "hands-on", "proaktiv", "engagerad"
Om någon MÅSTE användas (sällsynt), para den med konkret leverans + objekt.

3. BULLET-FORMAT (recruiter-grade mallar):
A) Verb + objekt + metod/verktyg + effekt (om känd)
B) Scope + leverans + cross-functional signal
C) Problem → åtgärd → outcome (utan hittepå)
D) Signal bullets (ATS + senioritet): stakeholders, metoder – sparsamt

4. SPRÅKREGLER:
- Svenska som default
- Kort, aktivt språk. 1 rad per bullet (max 2)
- Börja med starka verb: byggde, drev, införde, automatiserade, standardiserade, analyserade, förhandlade, lanserade, migrerade, förbättrade, säkrade, optimerade, etablerade, samordnade
- Undvik passiv form och "jag"
- Inga upprepade verb i samma jobb

5. TRE NIVÅER:
- "bas": ATS-safe, standard, professionell. Raka bullets utan flair.
- "skarpt": Mer konverterande men fortfarande sakligt. Tydligare impact-signaler.
- "max": Mest "stick out" men fortfarande 100% icke-hallucinerande. Starkare verb, tydligare scope.

6. TONVAL (anpassa efter input):
- "Saklig": Neutralt, formellt, faktadrivet
- "Skarpt": Direkt, kraftfullt, resultatfokuserat
- "Konsult": Strukturerat, metodiskt, ramverksdrivet
- "Ledarskap": Scope-tyngd, stakeholders, governance

7. SENIORITET (anpassa scope):
- IC: Fokus på hands-on leverans, verktyg, kvalitet
- Manager: Team, processer, stakeholders, budget
- Program: Cross-functional, portfölj, governance, roadmap
- Head-of: Strategi, P&L (bara om bekräftat), organisation, board-level

8. KVALITETSKONTROLL:
Innan du returnerar, kör intern check:
- Finns hallucinerade siffror? → Ta bort eller ersätt med [FYLL I]
- Finns floskler utan substans? → Omformulera
- Överdrivna claims? → Tona ner
- Är varje bullet unik (inga dubbletter/upprepningar)? → Dedup`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const input = await req.json();
    const { jobTitle, period, industry, companyType, tasks, tools, stakeholders, results, constraints, tone, seniority } = input;

    if (!jobTitle || !tasks || tasks.length === 0) {
      return new Response(JSON.stringify({ error: "Rolltitel och minst en uppgift krävs" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const userPrompt = `Generera CV-bullets för följande roll:

**Roll:** ${jobTitle}
**Period:** ${period || "Ej angiven"}
**Bransch:** ${industry || "Ej angiven"}
**Bolagstyp:** ${companyType || "Ej angiven"}
**Senioritet:** ${seniority || "IC"}
**Ton:** ${tone || "Saklig"}

**Huvuduppgifter:**
${tasks.map((t: string, i: number) => `${i + 1}. ${t}`).join("\n")}

**Verktyg/metoder:** ${tools?.length ? tools.join(", ") : "Inga angivna"}
**Stakeholders:** ${stakeholders?.length ? stakeholders.join(", ") : "Inga angivna"}
**Resultat/impact:** ${results || "Inga mätetal angivna – använd [FYLL I] för alla mätetal"}
**Saker som INTE ska nämnas:** ${constraints || "Inga begränsningar"}

Generera 4-6 bullets per nivå (bas, skarpt, max). Returnera som JSON via tool call.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
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
                  follow_up_questions: {
                    type: "array",
                    items: { type: "string" },
                  },
                  blocked_phrases_detected: {
                    type: "array",
                    items: { type: "string" },
                  },
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
        return new Response(JSON.stringify({ error: "För många förfrågningar, vänta en stund." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI-krediter slut. Fyll på i inställningarna." }), {
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
      // Fallback: try to parse content as JSON
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
