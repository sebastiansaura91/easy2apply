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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { job_posting_text, registry } = await req.json();
    if (!job_posting_text?.trim()) {
      return new Response(JSON.stringify({ error: "job_posting_text is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await gatewayFetch((model) => ({
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        // Deterministic extraction: the same posting must parse the same way every time.
        temperature: 0,
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
Always base seniority on the title, NOT on the job description content.

## COMPETENCE THEMES (how recruiters screen)
Recruiters evaluate candidates on 4–7 CORE COMPETENCE BUCKETS, not keyword lists.
Derive them from the posting (e.g. "Controlling", "Transformation", "Commercial leadership").
Mark each "must" or "nice" by how the posting weights it (title + repeated emphasis +
explicit requirements beat single mentions). For each theme list the posting's own
supporting terms (3–6 short terms, the employer's exact words).

## KNOCKOUT REQUIREMENTS (the only real auto-rejectors)
Extract binary hard requirements that application forms screen on: work authorization,
location/relocation, required languages, mandatory certifications/licenses, non-negotiable
years of experience or degree. Only list requirements the posting states as absolute.
Empty array if none.

## TOOLS & SYSTEMS (exact-match keywords)
List products, technologies, systems and certifications the posting NAMES explicitly (e.g. Salesforce, SAP, Power BI, SQL, PMP). Max 10, exact spelling from the posting. Generic words ("CRM system", "affärssystem") only when no product is named. Empty array if none.${Array.isArray(registry?.competences) && registry.competences.length ? `

## CANONICAL COMPETENCES (the candidate's registry)
For each competence theme, set canonical_id to the id of the registry competence it means,
or null if none matches. Match across languages ("prissättning" maps to a pricing competence).
${registry.competences.slice(0, 30).map((c: any) => `- ${c.id}: ${c.name_sv} / ${c.name_en}${(c.aliases || []).length ? ` (${c.aliases.slice(0, 6).join(", ")})` : ""}`).join("\n")}` : ""}`,
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
                competence_themes: {
                  type: "array",
                  description: "4-7 core competence buckets the role screens for",
                  items: {
                    type: "object",
                    properties: {
                      theme: { type: "string" },
                      importance: { type: "string", enum: ["must", "nice"] },
                      supporting_terms: { type: "array", items: { type: "string" } },
                      canonical_id: { type: ["string", "null"], description: "Id from the candidate's registry this theme maps to, or null" },
                    },
                    required: ["theme", "importance", "supporting_terms"],
                    additionalProperties: false,
                  },
                },
                tools_and_systems: {
                  type: "array",
                  items: { type: "string" },
                  description: "Explicitly named products/technologies/certifications (max 10, exact spelling)",
                },
                knockout_requirements: {
                  type: "array",
                  items: { type: "string" },
                  description: "Binary hard requirements (work authorization, location, required language, certifications) — the only real auto-rejectors",
                },
              },
              required: ["job_title", "company_name", "seniority_level", "key_requirements", "nice_to_have", "core_responsibilities", "key_phrases", "industry", "detected_language", "competence_themes", "knockout_requirements"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "analyze_job_posting" } },
      }),
    }));

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

    // Deterministic fallback: themes the model left unmapped still resolve when a
    // registry name or alias matches by normalized equality or containment.
    if (Array.isArray(registry?.competences) && Array.isArray(result.competence_themes)) {
      const norm = (s: string) => String(s || "").toLowerCase().trim().replace(/\s+/g, " ");
      const validIds = new Set(registry.competences.map((c: any) => c.id));
      for (const t of result.competence_themes) {
        if (t.canonical_id && validIds.has(t.canonical_id)) continue;
        t.canonical_id = null;
        const n = norm(t.theme);
        for (const c of registry.competences) {
          const names = [c.name_sv, c.name_en, ...(c.aliases || [])].map(norm).filter(Boolean);
          if (names.includes(n) || (n.length >= 4 && names.some((a: string) => a.length >= 4 && (a.includes(n) || n.includes(a))))) {
            t.canonical_id = c.id;
            break;
          }
        }
      }
    }

    (result as any)._meta = { model: lastModelUsed };
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
