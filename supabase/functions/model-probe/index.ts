import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * One-shot diagnostics (v2): ask the gateway which model ids actually resolve, with a
 * 1-token prompt per candidate. Exists because the docs and the gateway disagree
 * on id format and guessing costs a redeploy cycle each time.
 */
const CANDIDATES = [
  "openai/gpt-5.6-sol", "openai/gpt-5-6-sol",
  "openai/gpt-5.5-pro", "openai/gpt-5.5", "openai/gpt-5-5",
  "openai/gpt-5.4", "openai/gpt-5-4",
  "openai/gpt-5.2", "openai/gpt-5", "openai/gpt-5-mini",
  "google/gemini-3.1-pro-preview", "google/gemini-3-1-pro-preview",
  "google/gemini-3.6-flash",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const results: { model: string; status: number; note: string }[] = [];
    for (const model of CANDIDATES) {
      try {
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: "user", content: "Hi" }] }),
        });
        let note = "";
        if (!res.ok) note = (await res.text()).slice(0, 120);
        else await res.body?.cancel();
        results.push({ model, status: res.status, note });
      } catch (e) {
        results.push({ model, status: 0, note: e instanceof Error ? e.message : "fetch failed" });
      }
    }
    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
