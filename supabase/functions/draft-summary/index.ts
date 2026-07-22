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
    const { resume_content_json, system_language, positioning } = await req.json();
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

    // Positioning kit (optional): what the candidate wants to highlight and how to position.
    const p = positioning || {};
    const posLines = [
      p.targetRole ? `Position for this role: ${p.targetRole}` : null,
      p.specialism ? `Known for / specialism: ${p.specialism}` : null,
      Array.isArray(p.strengths) && p.strengths.length ? `Lead with these strengths: ${p.strengths.join(", ")}` : null,
      p.signatureAchievement ? `Signature achievement to feature (use only if truthful; keep any numbers EXACTLY as given): ${p.signatureAchievement}` : null,
      p.industry ? `Target industry/context + keywords to echo: ${p.industry}` : null,
      p.deemphasize ? `De-emphasise: ${p.deemphasize}` : null,
    ].filter(Boolean).join("\n");

    const systemPrompt = `You are a senior executive-CV writer. Write a POSITIONING-DRIVEN professional summary — a sharp elevator pitch of the value the candidate OFFERS, NOT a recap of their CV.

## STRUCTURE (3–4 sentences, max ~80 words; 2 sentences is fine for very senior profiles)
1. Positioning statement: who they are — seniority + specialism/identity (add domain / P&L / team / geography only if evidenced).
2. Value proposition: the 2–3 strengths they want to lead with, each tied to a concrete outcome — what they DELIVER, never duties.
3. One quantified proof point (their signature achievement).
${posLines ? "Use the POSITIONING guidance provided to decide what to emphasise and how to frame them — it outranks raw CV order for emphasis and de-emphasis." : "No positioning guidance was given — infer the strongest angle from the facts."}

## HARD RULES
- Grounded in real facts ONLY. NEVER invent employers, titles, dates, metrics or claims. Numbers may come only from the CV facts or the candidate's stated signature achievement — keep them exactly as given.
- If a number would strengthen a sentence but isn't provided, omit it or use "${lang === "sv" ? "[FYLL I]" : "[FILL IN]"}". Never fabricate.
- No clichés or buzzwords ("passionate", "results-oriented", "team player", "dynamic", "proven track record").
- Write in ${langName}. Return ONLY the summary text — no preamble, quotes or markdown.`;

    const userPrompt = `${posLines ? `POSITIONING (how to frame the candidate):\n${posLines}\n\n` : ""}CANDIDATE FACTS (the factual base — do not exceed these):\nEXPERIENCE:\n${experiences || "(none)"}\n\nEDUCATION: ${education || "(none)"}\n\nSKILLS: ${skills || "(none)"}\n\nWrite the positioning-driven summary now, in ${langName}.`;

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
