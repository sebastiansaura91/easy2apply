import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, makeGateway, HUMAN_WRITING_RULES, stripAiDashes } from "../_shared/gateway.ts";






serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action } = body;
    const gw = makeGateway(req, "bullet-coach", "wording");

    if (action === "chat") return handleChat(body, gw);
    if (action === "generate_suggestions") return handleSuggestions(body, gw);

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

// ── Fencing: the client supplies coaching config and chat history, and NONE of it may
// steer the model's instructions. Client text is data. Strings are clamped and stripped
// of control characters; chat roles are restricted to user/assistant (a client-supplied
// "system" entry is dropped, never forwarded); caps bound the context size. ──
const cleanStr = (v: unknown, max: number) =>
  String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const cleanList = (v: unknown, maxItems: number, maxLen: number): string[] =>
  (Array.isArray(v) ? v : []).map((x) => cleanStr(x, maxLen)).filter(Boolean).slice(0, maxItems);
const cleanMessages = (v: unknown, maxItems: number): { role: "user" | "assistant"; content: string }[] =>
  (Array.isArray(v) ? v : [])
    .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-maxItems)
    .map((m: any) => ({ role: m.role, content: m.content.slice(0, 2000) }));
const cleanFacts = (v: unknown) => JSON.stringify(v && typeof v === "object" ? v : {}).slice(0, 1500);

// ── Chat: extract facts & ask next question ──
async function handleChat(body: any, gw: ReturnType<typeof makeGateway>) {
  const lang = body.system_language === "en" ? "en" : "sv";
  const original_bullet = cleanStr(body.original_bullet, 400);
  const role_title = cleanStr(body.role_title, 120);
  const profile_label = cleanStr(body.profile_label, 120);
  const questions = cleanList(body.questions, 6, 200);
  const messages = cleanMessages(body.messages, 12);
  const verified_facts = cleanFacts(body.verified_facts);
  if (!original_bullet) return jsonResponse({ error: "original_bullet is required" }, 400);

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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

REDAN BESVARADE FRÅGOR: ${messages.filter((m) => m.role === "assistant").length}
REDAN KÄNDA FAKTA: ${verified_facts}

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

QUESTIONS ALREADY ASKED: ${messages.filter((m) => m.role === "assistant").length}
KNOWN FACTS: ${verified_facts}

RULES:
- Ask MAX 4 questions total. Prioritize filling decision_purpose + method_tool + stakeholders + outcome.
- Skip questions already answered via facts.
- If 2+ facts already exist AND 2+ questions asked: you MAY conclude with "I have enough, generating suggestions now."
- Be concise and friendly.
- NEVER fabricate facts. Only use what the user actually says.`;

  const response = await gw.fetch((model) => ({
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
async function handleSuggestions(body: any, gw: ReturnType<typeof makeGateway>) {
  const lang = body.system_language === "en" ? "en" : "sv";
  const original_bullet = cleanStr(body.original_bullet, 400);
  const role_title = cleanStr(body.role_title, 120);
  const profile_label = cleanStr(body.profile_label, 120);
  const rewrite_templates = cleanList(body.rewrite_templates, 6, 200);
  const allowed_verbs = cleanList(body.allowed_verbs, 30, 40);
  const verified_facts = cleanFacts(body.verified_facts);
  if (!original_bullet) return jsonResponse({ error: "original_bullet is required" }, 400);

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  const placeholder = lang === "sv"
    ? "[FYLL I: ROI / besparing / marginal / godkännande / tid-till-beslut]"
    : "[FILL IN: ROI / savings / margin / approval / time-to-decision]";

  const systemPrompt = lang === "sv"
    ? `Du är en expert-CV-coach. Generera EXAKT 3 förbättringsförslag (A, B, C) för en bullet-point.

ORIGINAL BULLET: "${original_bullet}"
ROLL: ${role_title || "Ej angiven"}
PROFIL: ${profile_label}
BEKRÄFTADE FAKTA: ${verified_facts}

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
VERIFIED FACTS: ${verified_facts}

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

  const response = await gw.fetch((model) => ({
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
