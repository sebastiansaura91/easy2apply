// Draft an executive summary from the candidate's OWN experience, education and skills.
// Grounded strictly in what's already in the CV — it summarises, it never invents new
// facts, employers, metrics or claims. Especially useful when starting from scratch.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { resume_content_json, system_language } = await req.json();
    if (!resume_content_json) {
      return new Response(JSON.stringify({ error: "resume_content_json is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const lang = system_language === "en" ? "en" : "sv";
    const langName = lang === "sv" ? "Swedish" : "English";

    const experiences = (resume_content_json.experience || []).map((e: any) =>
      `${e.title}${e.company ? ` @ ${e.company}` : ""} (${e.startDate}–${e.isPresent ? "present" : e.endDate})`
      + (e.bullets?.length ? `\n  - ${e.bullets.filter(Boolean).join("\n  - ")}` : "")
    ).join("\n");
    const education = (resume_content_json.education || []).map((e: any) =>
      `${e.degree}${e.field ? `, ${e.field}` : ""}${e.school ? ` — ${e.school}` : ""}`).join("; ");
    const skills = (resume_content_json.skills || []).join(", ");

    const systemPrompt = `You are a senior executive-CV writer. Write a concise professional summary from the candidate's OWN material only.

## HARD RULES
- Use ONLY facts present in the experience, education and skills provided. NEVER invent employers, metrics, titles, dates or claims.
- 3–4 sentences. Lead with scope (seniority, domain, P&L/team/geography if evidenced). No buzzwords or clichés ("passionate", "results-oriented", "team player").
- If a compelling number would strengthen it but isn't provided, do NOT fabricate one — write the sentence without it or use "${lang === "sv" ? "[FYLL I]" : "[FILL IN]"}".
- Write in ${langName}. Return ONLY the summary text — no preamble, no quotes, no markdown.`;

    const userPrompt = `EXPERIENCE:\n${experiences || "(none)"}\n\nEDUCATION: ${education || "(none)"}\n\nSKILLS: ${skills || "(none)"}\n\nWrite the summary now, in ${langName}.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(JSON.stringify({ error: "AI draft failed" }), {
        status: response.status === 429 ? 429 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const summary = (aiData.choices?.[0]?.message?.content || "").trim();
    if (!summary) {
      return new Response(JSON.stringify({ error: "AI returned no summary" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("draft-summary error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
