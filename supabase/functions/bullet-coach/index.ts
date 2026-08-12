import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "chat") return handleChat(body);
    if (action === "generate_suggestions") return handleSuggestions(body);

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("bullet-coach error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Chat: extract facts & ask next question ──
async function handleChat(body: any) {
  const {
    original_bullet,
    role_title,
    profile_id,
    profile_label,
    questions,
    verified_facts,
    messages,
    system_language,
  } = body;

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

  const lang = system_language === "en" ? "en" : "sv";

  const systemPrompt = lang === "sv"
    ? `Du är en senior CV-coach. Du hjälper användaren förbättra EN specifik bullet-point.

ORIGINAL BULLET: "${original_bullet}"
ROLL: ${role_title || "Ej angiven"}
PROFIL: ${profile_label}

DIN UPPGIFT:
1. Läs användarens senaste svar.
2. Extrahera ALLA fakta från svaret till "extracted_facts" (JSON-objekt med nycklar: decision_purpose, stakeholders, method_tool, scope, outcome_metric, seniority). Sätt null om ej nämnt.
3. Bestäm nästa fråga att ställa ELLER säg att du har tillräckligt med info.

TILLGÄNGLIGA FRÅGOR (ställ en i taget, max 4 totalt):
${questions.map((q: string, i: number) => `${i + 1}. ${q}`).join("\n")}

REDAN BESVARADE FRÅGOR: ${messages.filter((m: any) => m.role === "assistant").length}
REDAN KÄNDA FAKTA: ${JSON.stringify(verified_facts)}

REGLER:
- Ställ MAX 4 frågor totalt. Prioritera att fylla decision_purpose + method_tool + stakeholders + outcome.
- Hoppa över frågor som redan besvarats via fakta.
- Om 2+ fakta redan finns OCH 2+ frågor ställts: du FÅR avsluta med "Jag har tillräckligt, genererar förslag nu."
- Var kortfattad och vänlig.
- ALDRIG hitta på fakta. Utgå bara från vad användaren faktiskt säger.`
    : `You are a senior CV coach. You help the user improve ONE specific bullet point.

ORIGINAL BULLET: "${original_bullet}"
ROLE: ${role_title || "Not specified"}
PROFILE: ${profile_label}

YOUR TASK:
1. Read the user's latest response.
2. Extract ALL facts from the response into "extracted_facts" (JSON object with keys: decision_purpose, stakeholders, method_tool, scope, outcome_metric, seniority). Set null if not mentioned.
3. Decide the next question to ask OR say you have enough info.

AVAILABLE QUESTIONS (ask one at a time, max 4 total):
${questions.map((q: string, i: number) => `${i + 1}. ${q}`).join("\n")}

QUESTIONS ALREADY ASKED: ${messages.filter((m: any) => m.role === "assistant").length}
KNOWN FACTS: ${JSON.stringify(verified_facts)}

RULES:
- Ask MAX 4 questions total. Prioritize filling decision_purpose + method_tool + stakeholders + outcome.
- Skip questions already answered via facts.
- If 2+ facts already exist AND 2+ questions asked: you MAY conclude with "I have enough, generating suggestions now."
- Be concise and friendly.
- NEVER fabricate facts. Only use what the user actually says.`;

  const response = await gatewayFetch((model) => ({
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt + HUMAN_WRITING_RULES },
        ...messages,
      ],
      tools: [{
        type: "function",
        function: {
          name: "coach_response",
          description: "Return the coach's response with extracted facts",
          parameters: {
            type: "object",
            properties: {
              message: { type: "string", description: "The coach's response message to show the user" },
              extracted_facts: {
                type: "object",
                properties: {
                  decision_purpose: { type: "string", nullable: true },
                  stakeholders: { type: "string", nullable: true },
                  method_tool: { type: "string", nullable: true },
                  scope: { type: "string", nullable: true },
                  outcome_metric: { type: "string", nullable: true },
                  seniority: { type: "string", nullable: true },
                },
                additionalProperties: false,
              },
              has_enough_facts: { type: "boolean", description: "True if enough facts to generate suggestions" },
            },
            required: ["message", "extracted_facts", "has_enough_facts"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "coach_response" } },
    }),
  }));

  if (!response.ok) {
    const status = response.status;
    const t = await response.text();
    if (status === 429) return jsonResponse({ error: lang === "sv" ? "För många förfrågningar." : "Rate limit exceeded." }, 429);
    if (status === 402) return jsonResponse({ error: lang === "sv" ? "AI-krediter slut." : "AI credits depleted." }, 402);
    console.error("AI error:", status, t);
    return jsonResponse({ error: "AI gateway error" }, 500);
  }

  const aiData = await response.json();
  const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

  if (!toolCall?.function?.arguments) {
    return jsonResponse({ error: "AI did not return structured result" }, 500);
  }

  let result;
  try {
    result = typeof toolCall.function.arguments === "string"
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;
  } catch {
    return jsonResponse({ error: "Failed to parse AI result" }, 500);
  }

  return jsonResponse(stripAiDashes(result));
}

// ── Generate A/B/C suggestions ──
async function handleSuggestions(body: any) {
  const {
    original_bullet,
    role_title,
    profile_id,
    profile_label,
    verified_facts,
    rewrite_templates,
    allowed_verbs,
    system_language,
  } = body;

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

  const lang = system_language === "en" ? "en" : "sv";
  const placeholder = lang === "sv"
    ? "[FYLL I: ROI / besparing / marginal / godkännande / tid-till-beslut]"
    : "[FILL IN: ROI / savings / margin / approval / time-to-decision]";

  const systemPrompt = lang === "sv"
    ? `Du är en expert-CV-coach. Generera EXAKT 3 förbättringsförslag (A, B, C) för en bullet-point.

ORIGINAL BULLET: "${original_bullet}"
ROLL: ${role_title || "Ej angiven"}
PROFIL: ${profile_label}
BEKRÄFTADE FAKTA: ${JSON.stringify(verified_facts)}

MALLAR (inspiration, anpassa fritt):
${rewrite_templates.join("\n")}

TILLÅTNA VERB (outcome/decision-first): ${allowed_verbs.join(", ")}

REGLER:
- Använd ENDAST bekräftade fakta. Hitta ALDRIG på siffror/verktyg/scope.
- Om outcome_metric saknas: använd "${placeholder}"
- Struktur: Outcome/Decision-purpose först → metod → scope → resultat
- A = mest detaljerad, C = kortast
- Ge estimated_gain per förslag
- ALL output på svenska`
    : `You are an expert CV coach. Generate EXACTLY 3 improvement suggestions (A, B, C) for a bullet point.

ORIGINAL BULLET: "${original_bullet}"
ROLE: ${role_title || "Not specified"}
PROFILE: ${profile_label}
VERIFIED FACTS: ${JSON.stringify(verified_facts)}

TEMPLATES (inspiration, adapt freely):
${rewrite_templates.join("\n")}

ALLOWED VERBS (outcome/decision-first): ${allowed_verbs.join(", ")}

RULES:
- Use ONLY verified facts. NEVER fabricate numbers/tools/scope.
- If outcome_metric is missing: use "${placeholder}"
- Structure: Outcome/Decision-purpose first → method → scope → result
- A = most detailed, C = shortest
- Give estimated_gain per suggestion
- ALL output in English`;

  const response = await gatewayFetch((model) => ({
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt + HUMAN_WRITING_RULES },
        { role: "user", content: `Generate 3 suggestions (A/B/C) for this bullet. Use ONLY the verified facts provided.` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "bullet_suggestions",
          description: "Return 3 bullet rewrite suggestions",
          parameters: {
            type: "object",
            properties: {
              suggestions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string", description: "A, B, or C" },
                    text: { type: "string", description: "The rewritten bullet" },
                    estimated_gain: { type: "string", description: "e.g. +2.5 bullet score" },
                  },
                  required: ["label", "text", "estimated_gain"],
                  additionalProperties: false,
                },
              },
            },
            required: ["suggestions"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "bullet_suggestions" } },
    }),
  }));

  if (!response.ok) {
    const status = response.status;
    const t = await response.text();
    if (status === 429) return jsonResponse({ error: lang === "sv" ? "För många förfrågningar." : "Rate limit exceeded." }, 429);
    if (status === 402) return jsonResponse({ error: lang === "sv" ? "AI-krediter slut." : "AI credits depleted." }, 402);
    console.error("AI error:", status, t);
    return jsonResponse({ error: "AI gateway error" }, 500);
  }

  const aiData = await response.json();
  const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

  if (!toolCall?.function?.arguments) {
    return jsonResponse({ error: "AI did not return structured result" }, 500);
  }

  let result;
  try {
    result = typeof toolCall.function.arguments === "string"
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;
  } catch {
    return jsonResponse({ error: "Failed to parse AI result" }, 500);
  }

  return jsonResponse(stripAiDashes(result));
}
