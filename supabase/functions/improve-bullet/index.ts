import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};


// Model chain: strongest first; on an unknown-model rejection (400/404) step down,
// so a gateway id rename can never break the app.
const MODEL_CHAIN = ["openai/gpt-5.5", "openai/gpt-5-5", "google/gemini-3.6-flash", "google/gemini-2.5-flash"];
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

const SYSTEM_PROMPT_SV = `Du är en expert-CV-skribent. Din uppgift är att förbättra en enskild punkt (bullet point) i ett CV.

Regler:
- Klassificera bulleten först: är den "outcome" (resultat/beslut), "support" (stödjande/koordinerande) eller "context" (rollbeskrivning/kontext)?
- För outcome-bullets: gör punkten mer resultatfokuserad med aktiva verb
- För support/context-bullets: fokusera på tydlighet, scope och metod – tvinga INTE in siffror eller [FYLL I]-placeholders
- Använd aktiva verb i början (Ledde, Utvecklade, Implementerade, Stöttade, Koordinerade, Möjliggjorde, etc.)
- Lägg till [FYLL I] BARA för outcome-bullets där mätetal faktiskt skulle tillföra värde
- Skriv på svenska
- Hitta ALDRIG på fakta
- Behåll samma grundbetydelse, men gör den starkare och tydligare
- En välskriven support-bullet som förklarar VAD, HUR och för VEM är fullt godkänd utan siffror
- Max 2 meningar
- Svara på svenska, inklusive reason-fältet

Returnera ALLTID via tool call.`;

const SYSTEM_PROMPT_EN = `You are an expert CV writer. Your task is to improve a single bullet point in a CV/resume.

Rules:
- First classify the bullet: is it "outcome" (result/decision), "support" (enabling/coordinating), or "context" (role description/scope)?
- For outcome bullets: make them more results-focused with strong action verbs
- For support/context bullets: focus on clarity, scope, and method – do NOT force metrics or [FILL IN] placeholders
- Use strong action verbs at the start (Led, Developed, Implemented, Supported, Coordinated, Enabled, etc.)
- Add [FILL IN] placeholders ONLY for outcome bullets where metrics would genuinely add value
- Write in English
- NEVER fabricate facts
- Keep the same core meaning, but make it stronger and clearer
- A well-written support bullet that explains WHAT, HOW, and for WHOM is perfectly valid without numbers
- Max 2 sentences
- Respond in English, including the reason field

ALWAYS return via tool call.`;

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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bullet, jobTitle, company, language } = await req.json();
    const lang = language === "en" ? "en" : "sv";
    const systemPrompt = lang === "en" ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_SV;

    if (!bullet || bullet.trim().length === 0) {
      return new Response(JSON.stringify({ error: "No bullet provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const contextParts = [];
    if (jobTitle) contextParts.push(`Roll: ${jobTitle}`);
    if (company) contextParts.push(`Företag: ${company}`);
    const context = contextParts.length > 0 ? `\n\nKontext:\n${contextParts.join("\n")}` : "";

    const response = await gatewayFetch((model) => ({
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt + HUMAN_WRITING_RULES },
          { role: "user", content: `${lang === "en" ? "Improve this bullet point" : "Förbättra denna punkt"}:${context}\n\n${lang === "en" ? "Bullet" : "Punkt"}: "${bullet}"` },
        ],
        temperature: 0.4,
        tools: [
          {
            type: "function",
            function: {
              name: "return_improvement",
              description: "Return the improved bullet and a short explanation of what changed and why",
              parameters: {
                type: "object",
                properties: {
                  improved: {
                    type: "string",
                    description: "The improved bullet text",
                  },
                  reason: {
                    type: "string",
                    description: "1-2 korta meningar på svenska som förklarar vad som ändrades och varför det är bättre. T.ex. 'Starkare verb och tydligare scope. Lade till platshållare för mätetal.'",
                  },
                },
                required: ["improved", "reason"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_improvement" } },
      }),
    }));

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "För många förfrågningar, vänta en stund och försök igen." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI-krediter slut. Fyll på i inställningarna." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall) {
      const parsed = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify({
        improved: stripAiDashes(parsed.improved.replace(/^["']|["']$/g, "")),
        reason: parsed.reason,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback if no tool call
    const content = result.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("No response from AI");
    const cleaned = content.replace(/^["']|["']$/g, "");

    return new Response(JSON.stringify({ improved: stripAiDashes(cleaned), reason: "Förbättrad formulering." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error improving bullet:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
