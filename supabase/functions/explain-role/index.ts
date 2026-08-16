import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};


// Model chain: strongest first; on an unknown-model rejection (400/404) step down,
// so a gateway id rename can never break the app.
const MODEL_CHAIN = ["google/gemini-3.6-flash", "google/gemini-2.5-flash"];
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
- Hitta ALDRIG PÅ verktyg, system, teknologier, certifieringar, teamstorlekar, budgetar eller företagsnamn – bara det användaren själv angett i områden/kontext får bli konkret
- Aldrig första person ("jag") – CV-punkter är subjektlösa
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
- NEVER invent tools, systems, technologies, certifications, team sizes, budgets or company names – only what the user stated in areas/context may become concrete
- Never first person ("I") – CV bullets are subjectless
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

    const response = await gatewayFetch((model) => ({
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
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
    }));

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
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        bullets = Array.isArray(parsed.bullets) ? parsed.bullets : [];
      } catch { bullets = []; }
    } else {
      // Fallback: try parsing content as JSON — guarded, a malformed reply is an
      // empty result, never a 500 with internals.
      try {
        const content = result.choices?.[0]?.message?.content || "[]";
        const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        bullets = Array.isArray(parsed) ? parsed : [];
      } catch { bullets = []; }
    }

    // Deterministic fabrication guards: these bullets are built from a role title and
    // checkboxes, with NO CV as ground truth — so nothing concrete the user didn't
    // state may survive. Digits and proper nouns must come from the user's own input;
    // placeholders ([FYLL I]/[FILL IN]) are exempt. First person is a model failure.
    const userText = [jobTitle, company, ...(selectedAreas || []), ...Object.values(context || {})].map(v => String(v || "")).join(" ");
    const noPh = (s: string) => s.replace(/\[[^\]]*\]/g, " ");
    const userDigits = new Set(userText.match(/\d+(?:[.,]\d+)?/g) || []);
    const userWords = new Set(noPh(userText).toLowerCase().split(/[^a-zåäöéü]+/).filter(Boolean));
    const ok = (b: unknown): b is string => {
      if (typeof b !== "string" || !b.trim() || b.length > 240) return false;
      if (/\bjag\b/i.test(b) || /\bI\b/.test(b)) return false;
      const clean = noPh(b);
      if ((clean.match(/\d+(?:[.,]\d+)?/g) || []).some(d => !userDigits.has(d))) return false;
      const toks = clean.split(/\s+/);
      for (let i = 1; i < toks.length; i++) {
        if (/[.:!?]$/.test(toks[i - 1])) continue;
        const t = toks[i].replace(/^[^A-Za-zÅÄÖåäö]+|[^A-Za-zÅÄÖåäö]+$/g, "");
        if (!/^[A-ZÅÄÖ]/.test(t)) continue;
        const subs = t.toLowerCase().split(/[^a-zåäö]+/).filter(Boolean);
        if (subs.length && subs.some(s => !userWords.has(s))) return false;
      }
      return true;
    };
    bullets = bullets.filter(ok).slice(0, 6);

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
