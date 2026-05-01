import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CVCandidate {
  id: string;
  title: string;
  content_json: any;
}

function flattenCV(cv: any): string {
  if (!cv) return "";
  const parts: string[] = [];
  if (cv.profile) parts.push(String(cv.profile));
  for (const exp of cv.experience || []) {
    parts.push([exp.title, exp.company, exp.location].filter(Boolean).join(" "));
    for (const b of exp.bullets || []) parts.push(String(b));
  }
  for (const edu of cv.education || []) {
    parts.push([edu.degree, edu.field, edu.school].filter(Boolean).join(" "));
  }
  if (Array.isArray(cv.skills)) parts.push(cv.skills.join(", "));
  for (const p of cv.projects || []) {
    parts.push(p.name || "");
    if (p.description) parts.push(p.description);
    for (const b of p.bullets || []) parts.push(String(b));
  }
  for (const c of cv.certifications || []) parts.push([c.name, c.issuer].filter(Boolean).join(" "));
  return parts.join("\n").toLowerCase();
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9åäöéèüß+#./\s-]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

function scoreCV(cvText: string, jobAnalysis: any): { score: number; matched: string[]; missing: string[] } {
  const required: string[] = (jobAnalysis?.key_requirements || []).map((s: string) => String(s));
  const nice: string[] = (jobAnalysis?.nice_to_have || []).map((s: string) => String(s));
  const phrases: string[] = (jobAnalysis?.key_phrases || []).map((s: string) => String(s));
  const respo: string[] = (jobAnalysis?.core_responsibilities || []).map((s: string) => String(s));

  const cvLower = cvText;
  const cvTokens = new Set(tokenize(cvText));

  const matchTerm = (term: string): boolean => {
    const t = term.toLowerCase().trim();
    if (!t) return false;
    if (t.length > 25 || t.includes(" ")) {
      // multi-word phrase: check token overlap
      const ts = tokenize(t);
      if (ts.length === 0) return false;
      const hits = ts.filter((x) => cvTokens.has(x)).length;
      return hits / ts.length >= 0.6;
    }
    return cvLower.includes(t) || cvTokens.has(t);
  };

  let reqHits = 0;
  const matched: string[] = [];
  const missing: string[] = [];
  for (const r of required) {
    if (matchTerm(r)) { reqHits++; matched.push(r); } else missing.push(r);
  }
  let niceHits = 0;
  for (const n of nice) if (matchTerm(n)) { niceHits++; matched.push(n); }
  let phraseHits = 0;
  for (const p of phrases) if (matchTerm(p)) { phraseHits++; }
  let respHits = 0;
  for (const r of respo) if (matchTerm(r)) { respHits++; }

  const reqScore = required.length ? (reqHits / required.length) * 60 : 40;
  const niceScore = nice.length ? (niceHits / nice.length) * 15 : 10;
  const phraseScore = phrases.length ? (phraseHits / phrases.length) * 15 : 10;
  const respScore = respo.length ? (respHits / respo.length) * 10 : 5;

  const total = Math.round(reqScore + niceScore + phraseScore + respScore);
  return { score: Math.max(0, Math.min(100, total)), matched: matched.slice(0, 8), missing: missing.slice(0, 6) };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { cvs, job_analysis } = await req.json() as { cvs: CVCandidate[]; job_analysis: any };
    if (!Array.isArray(cvs) || cvs.length === 0) {
      return new Response(JSON.stringify({ ranked: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!job_analysis) {
      return new Response(JSON.stringify({ error: "job_analysis required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ranked = cvs.map((cv) => {
      const text = flattenCV(cv.content_json);
      const { score, matched, missing } = scoreCV(text, job_analysis);
      return { id: cv.id, title: cv.title, score, matched, missing };
    }).sort((a, b) => b.score - a.score);

    return new Response(JSON.stringify({ ranked, best_id: ranked[0]?.id || null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-best-cv error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});