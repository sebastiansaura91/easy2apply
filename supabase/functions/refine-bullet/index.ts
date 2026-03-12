import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REFINEMENT_PROMPTS_SV: Record<string, string> = {
  shorter: `Gör denna CV-bullet kortare. Max en rad. Behåll kärnan och starkaste verbet. Svara BARA med den nya texten.`,
  concrete: `Gör denna CV-bullet mer konkret. Lägg till specifika detaljer om vad som gjordes, vilka verktyg/metoder som användes. Hitta INTE på – använd [FYLL I] om du inte vet. Svara BARA med den nya texten.`,
  impact: `Gör denna CV-bullet mer impact-driven. Lyft scope, stakeholders, eller affärsnytta tydligare. Hitta INTE på mätetal – använd [FYLL I: t.ex. +X%] om de saknas. Svara BARA med den nya texten.`,
  verb: `Byt starterverbet i denna CV-bullet till ett starkare, mer distinkt verb. Välj bland: byggde, drev, införde, automatiserade, standardiserade, analyserade, förhandlade, lanserade, migrerade, förbättrade, säkrade, optimerade, etablerade, samordnade, formade, skalade. Svara BARA med den nya texten.`,
  metrics: `Lägg till realistiska platshållare för mätetal i denna CV-bullet. Använd formatet [FYLL I: t.ex. +X% / -Y% / SEK Z / timmar / NPS] på de ställen där mätetal vore naturliga. Svara BARA med den nya texten.`,
  ats: `Gör denna CV-bullet mer ATS-keyword friendly. Infoga relevanta bransch-/rollspecifika nyckelord naturligt i texten. Hitta INTE på – behåll sanningen. Svara BARA med den nya texten.`,
};

const REFINEMENT_PROMPTS_EN: Record<string, string> = {
  shorter: `Make this CV bullet shorter. Max one line. Keep the core and strongest verb. Reply with ONLY the new text.`,
  concrete: `Make this CV bullet more concrete. Add specific details about what was done, tools/methods used. Do NOT fabricate – use [FILL IN] if unknown. Reply with ONLY the new text.`,
  impact: `Make this CV bullet more impact-driven. Highlight scope, stakeholders, or business value more clearly. Do NOT fabricate metrics – use [FILL IN: e.g. +X%] if missing. Reply with ONLY the new text.`,
  verb: `Replace the starting verb in this CV bullet with a stronger, more distinct verb. Choose from: built, drove, implemented, automated, standardized, analyzed, negotiated, launched, migrated, improved, secured, optimized, established, coordinated, shaped, scaled. Reply with ONLY the new text.`,
  metrics: `Add realistic metric placeholders to this CV bullet. Use format [FILL IN: e.g. +X% / -Y% / $Z / hours / NPS] where metrics would be natural. Reply with ONLY the new text.`,
  ats: `Make this CV bullet more ATS-keyword friendly. Insert relevant industry/role-specific keywords naturally. Do NOT fabricate – keep it truthful. Reply with ONLY the new text.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bullet, action, context, language } = await req.json();
    const lang = language === "en" ? "en" : "sv";

    if (!bullet || !action) {
      return new Response(JSON.stringify({ error: "bullet och action krävs" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompts = lang === "en" ? REFINEMENT_PROMPTS_EN : REFINEMENT_PROMPTS_SV;
    const prompt = prompts[action];
    if (!prompt) {
      return new Response(JSON.stringify({ error: `Okänd action: ${action}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const contextLabel = lang === "en" ? "Context" : "Kontext";
    const roleLabel = lang === "en" ? "Role" : "Roll";
    const atLabel = lang === "en" ? "at" : "på";
    const contextStr = context ? `\n${contextLabel}: ${roleLabel} "${context.jobTitle}" ${atLabel} "${context.company}"` : "";

    const systemContent = lang === "en"
      ? `You are an expert CV writer. You must NEVER fabricate facts, metrics, technologies, or responsibilities. Use [FILL IN] for unknown info. No buzzwords. ALWAYS respond in English only.`
      : `Du är en expert-CV-skribent. Du får ALDRIG hitta på fakta, mätetal, teknologier eller ansvar. Använd [FYLL I] för okänd info. Inga floskler. Svara ALLTID på svenska.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: `${prompt}${contextStr}\n\nBullet: "${bullet}"` },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: lang === "en" ? "Too many requests, please wait." : "För många förfrågningar, vänta." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: lang === "en" ? "AI credits depleted." : "AI-krediter slut." }), {
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
