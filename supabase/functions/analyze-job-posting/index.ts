import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { job_posting_text } = await req.json();
    if (!job_posting_text?.trim()) {
      return new Response(JSON.stringify({ error: "job_posting_text is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a job posting analyst. Extract structured information from job postings. Be precise and concise. Return results via the analyze_job_posting tool.

## LANGUAGE DETECTION (MANDATORY)
Detect the primary language of the job posting text. Use ISO 639-1 codes: "sv" for Swedish, "en" for English, etc.

## SENIORITY LEVEL RULES (MANDATORY)
Determine seniority strictly from the job TITLE using these rules:
- "Director", "Head of", "VP", "Vice President", "C-level" (CEO, CFO, CTO, COO, etc.) → "Upper Management"
- "Manager", "Chef" (Swedish for manager) → "Management"  
- "Lead", "Principal", "Staff", "Specialist", "Senior" → "Senior"
- "Mid-level", no explicit seniority qualifier → "Mid-level"
- "Junior", "Graduate", "Trainee", "Intern" → "Junior"

Use ONLY these five levels: Junior, Mid-level, Senior, Management, Upper Management.
Always base seniority on the title, NOT on the job description content.`,
          },
          {
            role: "user",
            content: `Analyze this job posting and extract the key information:\n\n${job_posting_text}\n\nReturn the structured analysis via the tool.`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "analyze_job_posting",
            description: "Return structured analysis of a job posting",
            parameters: {
              type: "object",
              properties: {
                job_title: { type: "string", description: "The job title" },
                company_name: { type: "string", description: "Company name (or 'Unknown' if not found)" },
                seniority_level: { type: "string", enum: ["Junior", "Mid-level", "Senior", "Management", "Upper Management"], description: "Determined strictly from job title keywords" },
                key_requirements: { type: "array", items: { type: "string" }, description: "Must-have requirements and skills (max 10)" },
                nice_to_have: { type: "array", items: { type: "string" }, description: "Nice-to-have skills (max 5)" },
                core_responsibilities: { type: "array", items: { type: "string" }, description: "Main responsibilities (max 6)" },
                key_phrases: { type: "array", items: { type: "string" }, description: "Important phrases from the posting that a CV should echo (max 8)" },
                industry: { type: "string", description: "Industry or sector" },
                detected_language: { type: "string", description: "ISO 639-1 language code of the job posting (e.g. 'sv' for Swedish, 'en' for English)" },
              },
              required: ["job_title", "company_name", "seniority_level", "key_requirements", "nice_to_have", "core_responsibilities", "key_phrases", "industry", "detected_language"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "analyze_job_posting" } },
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: response.status === 429 ? 429 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "AI did not return structured result" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = typeof toolCall.function.arguments === "string"
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-job-posting error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
