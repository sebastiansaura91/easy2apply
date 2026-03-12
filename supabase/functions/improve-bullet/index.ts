import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Du är en expert-CV-skribent. Din uppgift är att förbättra en enskild punkt (bullet point) i ett CV.

Regler:
- Gör punkten mer kvantifierbar och resultatfokuserad
- Använd aktiva verb i början (Ledde, Utvecklade, Implementerade, Ökade, Reducerade, etc.)
- Lägg till platshållare [FYLL I] för siffror/KPI:er som du inte vet, t.ex. [FYLL I antal], [FYLL I %], [FYLL I MSEK]
- Behåll samma språk som originalet
- Hitta ALDRIG på fakta - använd [FYLL I] istället
- Behåll samma grundbetydelse, men gör den starkare och mer professionell
- Avvik INTE för långt från originalet – förbättra, omformulera inte helt
- Nämn gärna personalansvar, budget, verktyg/metoder om det är relevant
- Max 2 meningar

Returnera ALLTID via tool call.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bullet, jobTitle, company } = await req.json();

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
          { role: "user", content: `Förbättra denna punkt:${context}\n\nPunkt: "${bullet}"` },
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
    });

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
        improved: parsed.improved.replace(/^["']|["']$/g, ""),
        reason: parsed.reason,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback if no tool call
    const content = result.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("No response from AI");
    const cleaned = content.replace(/^["']|["']$/g, "");

    return new Response(JSON.stringify({ improved: cleaned, reason: "Förbättrad formulering." }), {
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
