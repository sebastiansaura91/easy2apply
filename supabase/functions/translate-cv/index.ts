import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { resume_content_json, target_language } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const lang = target_language === "en" ? "en" : "sv";

    const systemPrompt = lang === "sv"
      ? `Du är en professionell CV-översättare. Översätt hela CV:t till svenska.

REGLER:
- Behåll EXAKT samma JSON-struktur
- Behåll alla datum oförändrade (YYYY-MM format)
- Behåll tekniska termer, verktygsnamn och proper nouns på originalspråk (t.ex. Salesforce, Power BI, Agile, Scrum)
- Behåll personnamn, företagsnamn och platsnamn oförändrade
- Behåll [FYLL I]-platshållare oförändrade
- Översätt rolltitlar till svenska motsvarigheter
- Översätt kompetensbeskrivningar naturligt
- Använd professionellt CV-språk
- Inga floskler eller tillagda formuleringar
- Returnera ENBART via tool call`
      : `You are a professional CV translator. Translate the entire CV to English.

RULES:
- Keep EXACTLY the same JSON structure
- Keep all dates unchanged (YYYY-MM format)
- Keep technical terms, tool names and proper nouns in original language (e.g. Salesforce, Power BI, Agile, Scrum)
- Keep person names, company names and place names unchanged
- Keep [FILL IN] / [FYLL I] placeholders unchanged (convert [FYLL I] to [FILL IN])
- Translate job titles to English equivalents
- Translate skill descriptions naturally
- Use professional CV language
- No buzzwords or added phrasing
- Return ONLY via tool call`;

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
          {
            role: "user",
            content: `Translate this CV to ${lang === "sv" ? "Swedish" : "English"}. Return the translated CV via the tool call.\n\n${JSON.stringify(resume_content_json, null, 2)}`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_translated_cv",
            description: "Return the translated CV content",
            parameters: {
              type: "object",
              properties: {
                contact: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    email: { type: "string" },
                    phone: { type: "string" },
                    city: { type: "string" },
                    linkedin: { type: "string" },
                    website: { type: "string" },
                  },
                  required: ["name", "email", "phone", "city", "linkedin", "website"],
                  additionalProperties: false,
                },
                profile: { type: "string" },
                experience: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      title: { type: "string" },
                      company: { type: "string" },
                      location: { type: "string" },
                      startDate: { type: "string" },
                      endDate: { type: "string" },
                      isPresent: { type: "boolean" },
                      bullets: { type: "array", items: { type: "string" } },
                    },
                    required: ["id", "title", "company", "location", "startDate", "endDate", "isPresent", "bullets"],
                    additionalProperties: false,
                  },
                },
                education: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      degree: { type: "string" },
                      school: { type: "string" },
                      field: { type: "string" },
                      startDate: { type: "string" },
                      endDate: { type: "string" },
                    },
                    required: ["id", "degree", "school", "field", "startDate", "endDate"],
                    additionalProperties: false,
                  },
                },
                skills: { type: "array", items: { type: "string" } },
                certifications: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      name: { type: "string" },
                      issuer: { type: "string" },
                      date: { type: "string" },
                    },
                    required: ["id", "name", "issuer", "date"],
                    additionalProperties: false,
                  },
                },
                projects: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      name: { type: "string" },
                      description: { type: "string" },
                      bullets: { type: "array", items: { type: "string" } },
                    },
                    required: ["id", "name", "description", "bullets"],
                    additionalProperties: false,
                  },
                },
                languages: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      language: { type: "string" },
                      level: { type: "string" },
                    },
                    required: ["id", "language", "level"],
                    additionalProperties: false,
                  },
                },
                other: { type: "string" },
              },
              required: ["contact", "profile", "experience", "education", "skills", "certifications", "projects", "languages", "other"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_translated_cv" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      throw new Error("AI did not return structured result");
    }

    const translated = typeof toolCall.function.arguments === "string"
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;

    return new Response(JSON.stringify(translated), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("translate-cv error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
