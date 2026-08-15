import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};


// Model chain: strongest first; on an unknown-model rejection (400/404) step down,
// so a gateway id rename can never break the app.
const MODEL_CHAIN = ["openai/gpt-5.5", "openai/gpt-5", "google/gemini-3.6-flash", "google/gemini-2.5-flash"];
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

/**
 * Given missing keywords and the CV's bullets, propose MINIMAL edits: for each keyword,
 * pick the one existing bullet where it fits naturally and swap/insert one or two words.
 * The bullet's claim, numbers and length must stay intact — this is word-level tailoring,
 * never rewriting.
 */
// Distilled human-writing rules (from the "signs of AI writing" guide): suggested
// text must read like a person wrote it. Recruiters discard obvious AI wording.
const HUMAN_WRITING_RULES = `

HUMAN WRITING RULES for every piece of suggested text:
- Plain verbs, plain claims: led/built/increased (ledde/byggde/ökade). Banned CV-slop verbs: spearheaded, leveraged, utilized, orchestrated, championed, pioneered.
- Banned buzzwords (EN): passionate, dynamic, results-driven, proven track record, synergy, seamless, cutting-edge, vibrant, pivotal, crucial, testament, showcase, delve, robust, holistic, "landscape"/"tapestry" (figurative).
- Banned (SV): brinner för, passionerad, dynamisk, visionär, spjutspetskompetens, "mervärde" och "framgångsrikt" som utfyllnad.
- No "-ing"/"vilket" tails that fake depth ("...driving growth, enhancing efficiency" / "...vilket skapade synergier"). One bullet, one concrete claim.
- No rule-of-three padding: two facts get two items, not a forced third. No "not only... but also" / "inte bara... utan även".
- Never use em dashes (—) or en dashes (–). Use a comma, period or colon instead.
- Cut filler: "in order to" -> "to", "responsible for ensuring" -> "ensured", "i syfte att" -> "för att", "ansvarade för att säkerställa" -> "säkerställde".
- Every word must carry a checkable fact (what, scale, outcome) or be cut. Vary sentence length; never end on a generic upbeat close.`;

// Em dashes are the most reliable AI tell: strip them from every suggested string
// no matter what the model returns. Hyphens and digit ranges stay untouched;
// values under an "original" key quote the CV verbatim and must survive for matching.
const stripAiDashes = (v: unknown): unknown =>
  typeof v === "string" ? v.replace(/\s*—\s*/g, ", ")
    : Array.isArray(v) ? v.map(stripAiDashes)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, k === "original" ? x : stripAiDashes(x)])) : v;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { resume_content_json, missing_phrases, locale, evidence, never_insert } = await req.json();
    if (!resume_content_json || !Array.isArray(missing_phrases) || missing_phrases.length === 0) {
      return new Response(JSON.stringify({ error: "resume_content_json and missing_phrases are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const lang = locale === "en" ? "English" : "Swedish";
    const bullets: { exp_index: number; bullet_index: number; text: string }[] = [];
    (resume_content_json.experience || []).forEach((e: any, ei: number) => {
      (e.bullets || []).forEach((b: string, bi: number) => {
        if (b && b.trim()) bullets.push({ exp_index: ei, bullet_index: bi, text: b });
      });
    });
    if (bullets.length === 0) {
      return new Response(JSON.stringify({ placements: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hasEvidence = Array.isArray(evidence) && evidence.length > 0;

    // Bucket labels ("Team Leadership & Development") and trait phrases ("strong
    // business ownership") are ad/category language, never CV language: they may
    // motivate a NEW bullet built from the candidate's answer, but must never be
    // pasted into an existing sentence.
    const TRAIT_LEAD = /^(strong|proven|excellent|solid|good|demonstrated|stark|starkt|god|gott|gedigen|dokumenterad|utm\u00e4rkt)\s/i;
    const isLabel = (ph: string) => /&/.test(ph) || TRAIT_LEAD.test(ph) || ph.split(/\s+/).length > 4;
    const allPhrases: string[] = (missing_phrases as unknown[]).map(ph => String(ph || "").trim()).filter(Boolean);
    const placeable = allPhrases.filter(ph => !isLabel(ph));
    const labelTopics = hasEvidence ? allPhrases.filter(ph => isLabel(ph)) : [];
    if (!placeable.length && !labelTopics.length) {
      return new Response(JSON.stringify({ placements: [], new_bullets: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const systemPrompt = `You place missing ATS keywords into existing CV bullets with MINIMAL edits.
STRICT RULES:
- For each keyword, choose the ONE bullet where it fits most naturally (a synonym or related phrasing already exists there).
- The revised bullet must be the SAME bullet with only 1–2 words swapped or inserted. Same claim, same numbers, same structure, roughly the same length.
- NEVER invent achievements, numbers, tools or scope. If a keyword has no honest home in any bullet${hasEvidence ? " and no candidate evidence covers it" : ""}, OMIT it (do not force it).
- Never place two keywords in the same bullet.${hasEvidence ? `
- CANDIDATE EVIDENCE: the candidate has answered verification questions confirming real experience. Use their answers to pick the right bullet and wording.
- NEW BULLET CONTRACT (when a confirmed keyword has NO honest home in any existing bullet):
  * DISTILL, never quote. The evidence is interview language ("Jag har lett strategiprojekt...") and must be completely rewritten into CV language. Copying evidence phrasing, or chaining its clauses ("...redesigning customer journeys and managing acquisition and reorganization transformations"), is FORBIDDEN.
  * ONE claim per bullet: pick the STRONGEST single achievement in the evidence and drop the rest.
  * Shape: action verb + task + result (CAR). Use "${locale === "en" ? "[FILL IN]" : "[FYLL I]"}" for any number the evidence does not state. Facts come ONLY from the evidence.
  * Target the experience whose title/company matches the evidence role field; match that experience's existing bullet style and tense.
  * No first person. CV bullets are subjectless. Max 180 characters.` : ""}
- LANGUAGE PURITY: every revised bullet must be written entirely in ${lang}. When a keyword comes from a job ad in the other language, place its natural ${lang} equivalent instead (Swedish "serieförvärvare" → English "serial acquirer"; "ledningsgrupp" → "management team"; "dotterbolag" → "subsidiaries"). Inserting the ad's word verbatim into a bullet of the other language ("...integrating acquired dotterbolag") is ALWAYS wrong. Recruiters and scanners match translations — never mix two languages inside one bullet.
- EMPLOYER-CONTEXT TERMS: some keywords describe the COMPANY, not the person ("serieförvärvare"/"serial acquirer", "PE-backed", "family-owned", industry labels). Place these only as environment context ("…within a serial acquirer" / "…i en serieförvärvarkoncern") — never as a role or trait of the candidate ("as a serial acquirer" would be false). If no bullet can carry that context naturally, omit the keyword.
- PRESERVE FACTS: a swap must never replace concrete words (ownership, scope, responsibilities, numbers) with vaguer phrasing. "Owned commercial and offering responsibility" → "Demonstrated strong business ownership" destroys information and is FORBIDDEN.
- PEDIGREE PROXIES: never insert the name of a company, consultancy or institution the candidate's CV does not already contain ("McKinsey", "BCG", "Big 4"), and never constructions like "McKinsey-style"/"BCG-liknande" — writing "Developed McKinsey-style business cases" is borrowed prestige a recruiter reads as gaming, and it is FORBIDDEN. Brand names in a job ad are proxies for a capability: place the capability evidence instead ("built the business case approved by the executive team"). Exception: a firm the CV or the candidate's evidence names as a REAL relationship (employer, client, partner program) may be stated factually.
- NEVER paste a category label or trait phrase into a sentence ("...services, including Team Leadership & Development" is nonsense). Labels prove themselves through new evidence bullets, or not at all.
- Output all text in ${lang}.
Return via the keyword_placements tool.`;

    let userPrompt = `## PLACEABLE KEYWORDS (may be swapped into bullets)\n${placeable.slice(0, 10).join("; ") || "(none)"}\n\n`;
    if (labelTopics.length) {
      userPrompt += `## EVIDENCE-ONLY TOPICS (category labels: NEW bullets from the evidence only — the label text itself must NOT appear in any bullet)\n${labelTopics.slice(0, 6).join("; ")}\n\n`;
    }
    userPrompt += `## BULLETS (with indices)\n\`\`\`json\n${JSON.stringify(bullets, null, 2)}\n\`\`\`\n\n`;
    if (hasEvidence) {
      userPrompt += `## CANDIDATE EVIDENCE (verified answers — the only source of new facts)\n`;
      for (const ev of evidence.slice(0, 10)) {
        const parts: string[] = [];
        if (Array.isArray(ev.statements) && ev.statements.length) parts.push(`kinds of experience confirmed: ${ev.statements.join(" | ")}`);
        if (ev.detail) parts.push(`SPECIFICS (the only concrete content): ${String(ev.detail).slice(0, 300)}`);
        if (ev.role) parts.push(`role it belongs to: ${ev.role}`);
        userPrompt += `- ${ev.keyword}: ${parts.length ? parts.join(" ;; ") : String(ev.answer || "").slice(0, 400)}\n`;
      }
      userPrompt += `\n`;
    }
    userPrompt += `Propose minimal placements now.`;

    const response = await gatewayFetch((model) => ({
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        // Deterministic: same CV + keywords must yield the same placements.
        ...(model.startsWith("google/") ? { temperature: 0 } : {}),
        messages: [
          { role: "system", content: systemPrompt + HUMAN_WRITING_RULES },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "keyword_placements",
            description: "Minimal keyword placements into existing bullets",
            parameters: {
              type: "object",
              properties: {
                placements: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      keyword: { type: "string" },
                      exp_index: { type: "number" },
                      bullet_index: { type: "number" },
                      original: { type: "string", description: "The bullet text exactly as given" },
                      revised: { type: "string", description: "Same bullet with 1-2 words swapped/inserted to include the keyword" },
                      note: { type: "string", description: "One short sentence: what was swapped and why it stays truthful" },
                    },
                    required: ["keyword", "exp_index", "bullet_index", "original", "revised", "note"],
                  },
                },
                new_bullets: {
                  type: "array",
                  description: "Only when evidence confirms a keyword that has no honest home in existing bullets",
                  items: {
                    type: "object",
                    properties: {
                      keyword: { type: "string" },
                      exp_index: { type: "number" },
                      bullet: { type: "string", description: "New bullet built ONLY from the candidate's answer" },
                      note: { type: "string" },
                    },
                    required: ["keyword", "exp_index", "bullet", "note"],
                  },
                },
              },
              required: ["placements"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "keyword_placements" } },
      }),
    }));

    if (response.status === 429 || response.status === 402) {
      return new Response(JSON.stringify({ error: response.status === 429 ? "Rate limit reached. Try again shortly." : "AI credits exhausted." }), {
        status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!response.ok) {
      console.error("place-keywords gateway error:", response.status);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "AI did not return structured result" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let result: any;
    try {
      result = typeof toolCall.function.arguments === "string" ? JSON.parse(toolCall.function.arguments) : toolCall.function.arguments;
    } catch {
      return new Response(JSON.stringify({ error: "Failed to parse AI result" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Observability: every guard rejection is a model-failure signal worth counting.
    const guardHits: Record<string, number> = {};
    const _pb = (result.placements || []).length;
    const _nb = (result.new_bullets || []).length;

    // Deterministic guards: the original must actually match the CV bullet, and the
    // revision must stay a minimal edit (no ballooning, no new digits).
    const norm = (s: string) => String(s || "").trim().toLowerCase();
    const digits = (s: string) => (String(s).match(/\d+/g) || []).join(",");
    result.placements = (result.placements || []).filter((p: any) => {
      const actual = bullets.find(b => b.exp_index === p.exp_index && b.bullet_index === p.bullet_index);
      if (!actual || norm(actual.text) !== norm(p.original)) return false;
      if (!p.revised || norm(p.revised) === norm(p.original)) return false;
      if (p.revised.length > p.original.length * 1.25 + 20) return false;
      if (digits(p.revised) !== digits(p.original)) return false; // numbers must be untouched
      // The design is a 1-2 word swap: enforce it. Wide rewrites (5 words traded for
      // an ad phrase) are exactly the keyword-stuffing this feature must never do.
      const aw = String(p.original).trim().split(/\s+/), bw = String(p.revised).trim().split(/\s+/);
      let pre = 0; while (pre < aw.length && pre < bw.length && aw[pre] === bw[pre]) pre++;
      let suf = 0; while (suf < aw.length - pre && suf < bw.length - pre && aw[aw.length - 1 - suf] === bw[bw.length - 1 - suf]) suf++;
      if (aw.length - pre - suf > 3 || bw.length - pre - suf > 3) return false;
      return true;
    });

    // New bullets are allowed ONLY with evidence, and every number in them must come
    // from the candidate's own answer (or be a [FYLL I]/[FILL IN] placeholder).
    const evidenceText = (Array.isArray(evidence) ? evidence : []).map((e: any) => String(e?.answer || "")).join(" ");
    const evidenceDigits = new Set((evidenceText.match(/\d+/g) || []));
    result.new_bullets = (result.new_bullets || []).filter((nb: any) => {
      if (!hasEvidence) return false;
      // Interview language and clause-mashing are model failures, not suggestions:
      // no first person, no semicolon chains, max two coordinated clauses.
      if (/\bjag\b/i.test(nb.bullet) || /\bI\b/.test(nb.bullet) || /;/.test(nb.bullet)) return false;
      if ((nb.bullet.match(/\b(och|and)\b/gi) || []).length >= 3) return false;
      if (typeof nb?.exp_index !== "number" || !(resume_content_json.experience || [])[nb.exp_index]) return false;
      if (!nb.bullet || nb.bullet.length > 220) return false;
      const nums = String(nb.bullet).match(/\d+/g) || [];
      return nums.every((n: string) => evidenceDigits.has(n));
    });

    // Language guard: an English CV must never pick up Swedish words through a placement —
    // a Swedish ad's keyword has to arrive translated. Two tells on the ADDED words only
    // (text already in the bullet or the user's own answer is never penalised):
    // Swedish-specific letters, plus common Swedish business words that carry no åäö
    // ("dotterbolag" proved the letter check alone is porous).
    if (locale === "en") {
      const sv = /[åäöÅÄÖ]/;
      const SV_WORDS = new Set([
        "dotterbolag", "koncern", "koncernen", "ledningsgrupp", "ledningsgruppen", "verksamhet",
        "verksamheten", "upphandling", "bemanning", "redovisning", "styrelse", "styrelsen",
        "budgetansvar", "personalansvar", "resultatansvar", "utveckling", "utvecklingen",
        "medarbetare", "ledarskap", "arbetsledning", "effektivisering", "digitalisering",
        "kunder", "kunderna", "tjänster", "avtal", "offerter", "prissättning", "lönsamhet",
      ]);
      const addedWords = (orig: string, rev: string) => {
        const seen = new Set(orig.toLowerCase().split(/[^a-zA-ZåäöÅÄÖ]+/));
        return rev.toLowerCase().split(/[^a-zA-ZåäöÅÄÖ]+/).filter(w => w && !seen.has(w));
      };
      const introducesSwedish = (orig: string, rev: string) =>
        (sv.test(rev) && !sv.test(orig)) || addedWords(orig, rev).some(w => SV_WORDS.has(w) || sv.test(w));
      result.placements = result.placements.filter((p: any) => !introducesSwedish(p.original, p.revised));
      result.new_bullets = result.new_bullets.filter((nb: any) => !introducesSwedish(evidenceText, nb.bullet));
    }

    // Pedigree guard: borrowed prestige never enters a CV. Three layers: the ad's own
    // proxy terms (never_insert), "X-style" constructions on any proper noun, and
    // brand-new proper nouns absent from the CV, the evidence and the keyword list.
    const banned = (Array.isArray(never_insert) ? never_insert : [])
      .map((t: unknown) => String(t || "").toLowerCase().trim()).filter((t: string) => t.length >= 2);
    const STYLE_RE = /[A-ZÅÄÖ][\w&ÅÄÖåäö.]*[-‐‑](style|inspired|caliber|level|liknande|klass|anda|aktig\w*|mässig\w*)\b/;
    const wordsOf = (s: string) => s.toLowerCase().split(/[^a-zåäö]+/).filter(Boolean);
    const knownWords = new Set([
      ...wordsOf(JSON.stringify(resume_content_json)),
      ...wordsOf(evidenceText),
      ...wordsOf(allPhrases.join(" ")),
    ]);
    const pedigreeViolation = (sentence: string, origWords: Set<string>) => {
      const clean = String(sentence || "").replace(/\[[^\]]*\]/g, " "); // [FYLL I]/[FILL IN] placeholders
      const low = clean.toLowerCase();
      if (banned.some((b: string) => low.includes(b))) return true;
      if (STYLE_RE.test(clean)) return true;
      const toks = clean.split(/\s+/);
      for (let i = 1; i < toks.length; i++) {
        if (/[.:!?]$/.test(toks[i - 1])) continue; // sentence-initial capitals are fine
        const t = toks[i].replace(/^[^A-Za-zÅÄÖåäö]+|[^A-Za-zÅÄÖåäö]+$/g, "");
        if (!/^[A-ZÅÄÖ]/.test(t)) continue;
        const subs = wordsOf(t);
        if (!subs.length || subs.every(s => origWords.has(s))) continue;
        if (subs.some(s => !knownWords.has(s))) return true;
      }
      return false;
    };
    const _pp = result.placements.length, _pn = result.new_bullets.length;
    result.placements = result.placements.filter((p: any) => !pedigreeViolation(p.revised, new Set(wordsOf(p.original))));
    result.new_bullets = result.new_bullets.filter((nb: any) => !pedigreeViolation(nb.bullet, new Set<string>()));
    guardHits["pedigree_rejected"] = (_pp - result.placements.length) + (_pn - result.new_bullets.length);

    guardHits["placements_rejected"] = _pb - (result.placements || []).length;
    guardHits["new_bullets_rejected"] = _nb - (result.new_bullets || []).length;
    (result as any)._meta = { model: lastModelUsed, guards: guardHits };
    return new Response(JSON.stringify(stripAiDashes(result)), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("place-keywords error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
