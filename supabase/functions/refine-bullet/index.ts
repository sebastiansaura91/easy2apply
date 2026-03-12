import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REFINEMENT_PROMPTS: Record<string, string> = {
  shorter: `Gör denna CV-bullet kortare. Max en rad. Behåll kärnan och starkaste verbet. Svara BARA med den nya texten.`,
  concrete: `Gör denna CV-bullet mer konkret. Lägg till specifika detaljer om vad som gjordes, vilka verktyg/metoder som användes. Hitta INTE på – använd [FYLL I] om du inte vet. Svara BARA med den nya texten.`,
  impact: `Gör denna CV-bullet mer impact-driven. Lyft scope, stakeholders, eller affärsnytta tydligare. Hitta INTE på mätetal – använd [FYLL I: t.ex. +X%] om de saknas. Svara BARA med den nya texten.`,
  verb: `Byt starterverbet i denna CV-bullet till ett starkare, mer distinkt verb. Välj bland: byggde, drev, införde, automatiserade, standardiserade, analyserade, förhandlade, lanserade, migrerade, förbättrade, säkrade, optimerade, etablerade, samordnade, formade, skalade. Svara BARA med den nya texten.`,
  metrics: `Lägg till realistiska platshållare för mätetal i denna CV-bullet. Använd formatet [FYLL I: t.ex. +X% / -Y% / SEK Z / timmar / NPS] på de ställen där mätetal vore naturliga. Svara BARA med den nya texten.`,
  ats: `Gör denna CV-bullet mer ATS-keyword friendly. Infoga relevanta bransch-/rollspecifika nyckelord naturligt i texten. Hitta INTE på – behåll sanningen. Svara BARA med den nya texten.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bullet, action, context } = await req.json();

    if (!bullet || !action) {
      return new Response(JSON.stringify({ error: "bullet och action krävs" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = REFINEMENT_PROMPTS[action];
    if (!prompt) {
      return new Response(JSON.stringify({ error: `Okänd action: ${action}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const contextStr = context ? `\nKontext: Roll "${context.jobTitle}" på "${context.company}"` : "";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Du är en expert-CV-skribent. Du får ALDRIG hitta på fakta, mätetal, teknologier eller ansvar. Använd [FYLL I] för okänd info. Inga floskler.`,
          },
          {
            role: "user",
            content: `${prompt}${contextStr}\n\nBullet: "${bullet}"`,
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "För många förfrågningar, vänta." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI-krediter slut." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const result = await response.json();
    const improved = result.choices?.[0]?.message?.content?.trim()?.replace(/^["']|["']$/g, "");

    if (!improved) throw new Error("No response from AI");

    return new Response(JSON.stringify({ improved }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error refining bullet:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
