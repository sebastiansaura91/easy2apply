import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { jobTitle, company, selectedAreas, context, language } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const isSv = language === "sv";

    const systemPrompt = isSv
      ? `Du är en senior CV-skribent specialiserad på att hjälpa yrkesverksamma artikulera sina bidrag. Du genererar CV-punkter (bullets) baserat på användarens valda arbetsområden och kontextuella svar.

REGLER:
- Generera 4-6 bullet points
- Använd "outcome-first"-struktur där möjligt: Resultat → Metod → Omfattning
- Hitta ALDRIG PÅ specifika siffror, KPI:er eller resultat – använd [FYLL I] som platshållare
- Var konservativ i ordval – använd "bidrog till", "stöttade", "deltog i" när rollens nivå är oklar
- Om beslutsfattare: använd starkare verb som "ledde", "drev", "beslutade om"
- Om utförare: använd "genomförde", "levererade", "ansvarade för"
- Varje punkt ska vara 1-2 meningar
- Skriv på svenska
- Returnera BARA en JSON-array med strängar, inget annat`
      : `You are a senior CV writer specializing in helping professionals articulate their contributions. You generate CV bullet points based on the user's selected work areas and contextual answers.

RULES:
- Generate 4-6 bullet points
- Use "outcome-first" structure where possible: Result → Method → Scope
- NEVER invent specific numbers, KPIs, or results – use [FILL IN] as placeholder
- Be conservative in wording – use "supported", "contributed to", "participated in" when role level is unclear
- If decision-maker: use stronger verbs like "led", "drove", "decided on"
- If executor: use "executed", "delivered", "was responsible for"
- Each bullet should be 1-2 sentences
- Write in English
- Return ONLY a JSON array of strings, nothing else`;

    const userPrompt = isSv
      ? `Roll: ${jobTitle}${company ? ` på ${company}` : ""}

Arbetsområden: ${(selectedAreas || []).join(", ")}

Kontext:
- Beslutsnivå: ${context?.decisionLevel || "ej angett"}
- Scope: ${context?.scope || "ej angett"}
- Samarbete med: ${context?.stakeholders || "ej angett"}
- Typ av arbete: ${context?.workType || "ej angett"}

Generera 4-6 relevanta CV-bullets baserat på ovanstående. Returnera som JSON-array.`
      : `Role: ${jobTitle}${company ? ` at ${company}` : ""}

Work areas: ${(selectedAreas || []).join(", ")}

Context:
- Decision level: ${context?.decisionLevel || "not specified"}
- Scope: ${context?.scope || "not specified"}
- Collaboration with: ${context?.stakeholders || "not specified"}
- Type of work: ${context?.workType || "not specified"}

Generate 4-6 relevant CV bullets based on the above. Return as JSON array.`;

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
              name: "return_bullets",
              description: "Return generated CV bullet points",
              parameters: {
                type: "object",
                properties: {
                  bullets: {
                    type: "array",
                    items: { type: "string" },
                    description: "Array of CV bullet point strings",
                  },
                },
                required: ["bullets"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_bullets" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited – try again shortly" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    let bullets: string[] = [];

    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      bullets = parsed.bullets || [];
    } else {
      // Fallback: try parsing content as JSON
      const content = result.choices?.[0]?.message?.content || "[]";
      const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      bullets = JSON.parse(cleaned);
    }

    return new Response(JSON.stringify({ bullets }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("explain-role error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
