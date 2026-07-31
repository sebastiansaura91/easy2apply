import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { resume_content_json, job_posting_text, locale, demand_profile } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const renderedText = buildRenderedText(resume_content_json, locale === "en" ? "en" : "sv");
    const bulletList = extractBullets(resume_content_json);
    const lang = locale === "en" ? "en" : "sv";
    const systemPrompt = lang === "sv" ? SYSTEM_PROMPT_SV : SYSTEM_PROMPT_EN;

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth() + 1;
    let userPrompt = `## TODAY'S DATE\n${todayStr} (year=${todayYear}, month=${todayMonth})\n\n`;
    userPrompt += `## DATE RULES (STRICT)\n`;
    userPrompt += `- A date is "in the future" ONLY if it is strictly after ${todayStr}.\n`;
    userPrompt += `- Any date with a year < ${todayYear} is in the PAST. Never flag it as future.\n`;
    userPrompt += `- A date in year ${todayYear} is in the future only if its month > ${todayMonth}.\n`;
    userPrompt += `- "Present"/"Pågående"/"Nuvarande" combined with a past start date is NORMAL (current employment). Do NOT flag this as a future employment date.\n`;
    userPrompt += `- Before raising any "future date" issue, recompute: is the start date strictly after ${todayStr}? If not, do NOT include the issue.\n\n`;
    userPrompt += `## RENDERING GUARANTEES (the export engine enforces these — NEVER flag them)\n`;
    userPrompt += `- Strict single-column layout; no tables, text boxes, columns, images, icons or graphics.\n`;
    userPrompt += `- Name + contact details are rendered as plain body text at the very top of page 1 (NOT in a document header/footer). Do not raise "contact info placement" issues.\n`;
    userPrompt += `- Standard fonts, selectable vector text, no embedded objects; the PDF is fully machine-readable.\n`;
    userPrompt += `- Dates are printed in a consistent "mon YYYY – mon YYYY" format; role titles never split across pages.\n`;
    userPrompt += `- Skills render as a scannable bulleted grid with engine-controlled whitespace. Never flag skills density, hierarchy or whitespace. The ONLY skills advice allowed is CONTENT-level: if there are more than ~10 skills, you may suggest grouping them into labeled categories (e.g. "Commercial: pricing, GTM").\n`;
    userPrompt += `- Therefore: only flag CONTENT issues (wording, keywords, metrics, ordering of sections, gaps, inconsistent data) — never layout/whitespace/file-format speculation.\n\n`;
    if (demand_profile?.competence_themes?.length) {
      userPrompt += `## DEMAND PROFILE (ANCHOR — use EXACTLY these themes)\n`;
      userPrompt += `The employer's competence themes were already extracted. In job_language_match.competence_themes you MUST use these exact theme names and importance values — only judge the CV's evidence and supporting terms for each:\n`;
      for (const t of demand_profile.competence_themes) {
        userPrompt += `- ${t.theme} (${t.importance})${t.supporting_terms?.length ? ` — supporting terms: ${t.supporting_terms.join(", ")}` : ""}\n`;
      }
      userPrompt += `\n`;
    }
    userPrompt += `## CV DATA (JSON)\n\`\`\`json\n${JSON.stringify(resume_content_json, null, 2)}\n\`\`\`\n\n`;
    userPrompt += `## RENDERED PLAIN TEXT (what ATS sees)\n\`\`\`\n${renderedText}\n\`\`\`\n\n`;
    userPrompt += `## BULLETS WITH IDS\n\`\`\`json\n${JSON.stringify(bulletList, null, 2)}\n\`\`\`\n\n`;
    if (job_posting_text) userPrompt += `## JOB POSTING\n\`\`\`\n${job_posting_text}\n\`\`\`\n\n`;
    userPrompt += `Perform the full ATS + Recruiter Scan analysis now. Return the result via the ats_check_result tool. ALL text output MUST be in ${lang === "sv" ? "Swedish" : "English"}.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        // Deterministic: the same CV + posting must yield the same score and findings.
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "ats_check_result",
            description: "Return the complete ATS + Recruiter Scan analysis result",
            parameters: RESULT_SCHEMA,
          },
        }],
        tool_choice: { type: "function", function: { name: "ats_check_result" } },
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
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response:", JSON.stringify(aiData));
      return new Response(JSON.stringify({ error: "AI did not return structured result" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result;
    try {
      result = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } catch {
      return new Response(JSON.stringify({ error: "Failed to parse AI result" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deterministic guard: drop "future date" issues when no CV date is actually after
    // today — from the scan issues AND the parse check (the model hallucinates these).
    const hasFutureDate = collectDates(resume_content_json).some(d => d > today);
    if (!hasFutureDate) {
      const isFutureClaim = (txt: string) => txt.includes("future") || txt.includes("framtid");
      if (Array.isArray(result?.first_scan_issues)) {
        result.first_scan_issues = result.first_scan_issues.filter((iss: any) =>
          !isFutureClaim(`${iss?.title || ""} ${iss?.why_it_matters || ""} ${iss?.fix || ""}`.toLowerCase()));
      }
      if (Array.isArray(result?.parse_check)) {
        for (const c of result.parse_check) {
          const hay = `${c?.dimension || ""} ${c?.why_it_matters || ""} ${c?.recommendation || ""}`.toLowerCase();
          if (c?.status && c.status !== "pass" && isFutureClaim(hay)) c.status = "pass";
        }
      }
    }

    // Deterministic guard: the export engine guarantees single-column body-text layout
    // (contact at the very top, no headers/tables/images), so layout speculation from
    // the model is always a false positive. Drop those issues.
    if (Array.isArray(result?.first_scan_issues)) {
      const layoutNoise = /contact info placement|kontaktuppgifternas placering|header or separate block|document header|sidhuvud|multi-?column|flera kolumner|text box|textruta|\btable\b|\btabell\b|image|bild|graphic|grafik|file format|filformat/;
      // Placement/formatting complaints in either language about things the renderer controls.
      const contactPlacement = /(kontaktinformation|kontaktuppgifter|contact info(rmation)?)[\s\S]*?(flytta|placer|skanningsväg|övre|hörn|move|placement|top left|corner|scan path)/;
      const skillsFormatting = /(kompetens|skills)[\s\S]*?(tomt utrymme|whitespace|luft|hierark|hierarchy|punktlist|bullet point|tät|dense|cluttered|belamrad)/;
      result.first_scan_issues = result.first_scan_issues.filter((iss: any) => {
        const hay = `${iss?.title || ""} ${iss?.why_it_matters || ""} ${iss?.fix || ""}`.toLowerCase();
        return !layoutNoise.test(hay) && !contactPlacement.test(hay) && !skillsFormatting.test(hay);
      });
      if (Array.isArray(result?.next_actions)) {
        result.next_actions = result.next_actions.filter((a: string) => {
          const hay = String(a || "").toLowerCase();
          return !layoutNoise.test(hay) && !contactPlacement.test(hay) && !skillsFormatting.test(hay);
        });
      }
    }

    // Renderer-guaranteed format dimensions can never fail: the export engine enforces
    // single-column plain-text layout, so scan/parse checks about it are forced to pass.
    const guaranteedDim = /single_column|plain_text|clean_vs_cluttered|column|layout|font|table|image|header|footer/;
    for (const arr of [result?.scanability_check, result?.parse_check]) {
      if (!Array.isArray(arr)) continue;
      for (const c of arr) {
        if (guaranteedDim.test(String(c?.dimension || "").toLowerCase()) && c?.status && c.status !== "pass") {
          c.status = "pass";
        }
      }
    }
    // contact_info: placement is guaranteed; only flag it when contact data is actually
    // missing. Applies to BOTH scanability and parse checks (dimension wording varies).
    const hasContact = !!(resume_content_json?.contact?.email && resume_content_json?.contact?.phone);
    if (hasContact) {
      for (const arr of [result?.scanability_check, result?.parse_check]) {
        if (!Array.isArray(arr)) continue;
        for (const c of arr) {
          if (/contact|kontakt/.test(String(c?.dimension || "").toLowerCase()) && c?.status && c.status !== "pass") {
            c.status = "pass";
          }
        }
      }
    }

    // A language listed on the CV can never be a "missing language" issue.
    const cvLangs = (resume_content_json?.languages || [])
      .map((l: any) => String(l?.language || "").toLowerCase().trim()).filter(Boolean);
    const LANG_MAP: string[][] = [
      ["svenska", "swedish"], ["engelska", "english"], ["norska", "norwegian"], ["danska", "danish"],
      ["finska", "finnish"], ["tyska", "german"], ["franska", "french"], ["spanska", "spanish"],
      ["italienska", "italian"], ["kinesiska", "chinese", "mandarin"], ["japanska", "japanese"], ["ryska", "russian"],
    ];
    const langAliases = new Set<string>(cvLangs);
    for (const group of LANG_MAP) if (group.some(g => cvLangs.includes(g))) group.forEach(g => langAliases.add(g));
    if (langAliases.size && Array.isArray(result?.first_scan_issues)) {
      const langCtx = /language|språk|proficien|fluen|flytande|modersmål|native|cefr/;
      result.first_scan_issues = result.first_scan_issues.filter((iss: any) => {
        const hay = `${iss?.title || ""} ${iss?.why_it_matters || ""} ${iss?.fix || ""}`.toLowerCase();
        return !(langCtx.test(hay) && [...langAliases].some(a => hay.includes(a)));
      });
    }

    // Deterministic keyword guard: a phrase is not "missing" if the CV contains it
    // verbatim (normalized), or expresses it in the other language / a known variant.
    const SV_EN_TERMS: string[][] = [
      ["ledningsgrupp", "ledningsgruppen", "management team", "executive team", "leadership team"],
      ["affärsutveckling", "business development"],
      ["försäljning", "sales"],
      ["ledarskap", "leadership"],
      ["förhandling", "negotiation"],
      ["upphandling", "procurement"],
      ["intäkt", "intäkter", "revenue"],
      ["lönsamhet", "profitability"],
      ["tillväxt", "growth"],
      ["prissättning", "pricing"],
      ["kundresa", "customer journey"],
      ["kundnöjdhet", "customer satisfaction", "nps"],
      ["marknadsföring", "marketing"],
      ["betalning", "betalningar", "betalningslösningar", "payments", "payment solutions"],
      ["lojalitetsprogram", "loyalty program", "loyalty programs"],
      ["e-handel", "e-commerce", "ecommerce"],
      ["strategi", "strategisk", "strategy", "strategic"],
      ["budgetansvar", "p&l", "profit and loss", "budget responsibility"],
      ["förändringsledning", "change management"],
      ["verksamhetsutveckling", "business transformation", "operational development"],
      ["hållbarhet", "sustainability"],
      ["styrelse", "board of directors", "board"],
      ["personalansvar", "people management", "headcount"],
      ["nyckeltal", "kpi", "kpis", "key performance indicators"],
      ["go-to-market", "gtm"],
      ["abonnemang", "subscription", "subscriptions"],
    ];
    const normalize = (s: string) => s.toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();
    const cvText = normalize(renderedText);
    const isPresent = (phrase: string): boolean => {
      const p = normalize(phrase);
      if (!p) return true;
      if (cvText.includes(p)) return true;
      // singular/definite tolerance: match on a lightly stemmed form of longer words
      const stem = p.replace(/(erna|arna|orna|en|et|er|ar|or|s)$/i, "");
      if (stem.length >= 5 && cvText.includes(stem)) return true;
      for (const group of SV_EN_TERMS) {
        if (group.some(g => p.includes(g)) && group.some(g => cvText.includes(g))) return true;
      }
      return false;
    };
    if (Array.isArray(result?.job_language_match?.missing_phrases)) {
      // Junk filters: soft traits aren't keywords, verb-led requirement sentences aren't
      // keywords, and real ATS keywords are short (≤4 words).
      const SOFT_TRAITS = new Set([
        "resultat", "results", "analytisk", "affärsmässig", "affärsmässig och analytisk",
        "analytical", "business minded", "engagemang", "kommunikativ", "driven", "prestigelös",
        "self starter", "team player", "lagspelare", "högt tempo", "eget driv",
      ]);
      const verbLed = /^(driva|leda|skapa|utveckla|bygga|säkerställa|arbeta|vara|drive|lead|create|develop|build|ensure|work)\b/;
      const keepPhrase = (p: string) => {
        if (isPresent(p)) return false;
        const n = normalize(p);
        if (!n || SOFT_TRAITS.has(n)) return false;
        if (verbLed.test(n)) return false;
        if (n.split(" ").length > 4) return false;
        return true;
      };
      result.job_language_match.missing_phrases = result.job_language_match.missing_phrases.filter(keepPhrase);
      if (Array.isArray(result.job_language_match.competence_themes)) {
        for (const th of result.job_language_match.competence_themes) {
          if (Array.isArray(th?.supporting_terms_missing)) th.supporting_terms_missing = th.supporting_terms_missing.filter(keepPhrase);
          // If nothing is genuinely missing and evidence exists, the theme is effectively covered.
          if (th?.evidence === "partial" && Array.isArray(th.supporting_terms_missing) && th.supporting_terms_missing.length === 0 && (th.supporting_terms_present || []).length > 0) {
            th.evidence = "strong";
          }
        }
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ats-check error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// --- Extract bullets ---
function collectDates(cv: any): Date[] {
  const out: Date[] = [];
  const push = (s: any) => {
    if (typeof s !== "string") return;
    const m = s.match(/(\d{4})[-/\s]?(\d{1,2})?/);
    if (!m) return;
    const y = parseInt(m[1], 10);
    const mo = m[2] ? Math.min(12, Math.max(1, parseInt(m[2], 10))) : 1;
    if (y >= 1900 && y <= 2100) out.push(new Date(y, mo - 1, 1));
  };
  for (const e of cv?.experience || []) { push(e?.startDate); if (!e?.isPresent) push(e?.endDate); }
  for (const e of cv?.education || []) { push(e?.startDate); if (!e?.isPresent) push(e?.endDate); }
  for (const e of cv?.projects || []) { push(e?.startDate); if (!e?.isPresent) push(e?.endDate); }
  return out;
}

function extractBullets(cv: any): { id: string; text: string }[] {
  const bullets: { id: string; text: string }[] = [];
  for (let i = 0; i < (cv.experience?.length || 0); i++) {
    for (let j = 0; j < (cv.experience[i].bullets?.length || 0); j++) {
      if (cv.experience[i].bullets[j]?.trim()) {
        bullets.push({ id: `experience[${i}].bullets[${j}]`, text: cv.experience[i].bullets[j] });
      }
    }
  }
  for (let i = 0; i < (cv.projects?.length || 0); i++) {
    for (let j = 0; j < (cv.projects[i].bullets?.length || 0); j++) {
      if (cv.projects[i].bullets[j]?.trim()) {
        bullets.push({ id: `projects[${i}].bullets[${j}]`, text: cv.projects[i].bullets[j] });
      }
    }
  }
  return bullets;
}

// --- Build plain text ---
function buildRenderedText(cv: any, lang: "sv" | "en" = "sv"): string {
  const H = lang === "en"
    ? { profile: "PROFILE", experience: "EXPERIENCE", present: "Present", education: "EDUCATION", skills: "SKILLS", certifications: "CERTIFICATIONS", projects: "PROJECTS", languages: "LANGUAGES", other: "OTHER" }
    : { profile: "PROFIL", experience: "ARBETSLIVSERFARENHET", present: "Nuvarande", education: "UTBILDNING", skills: "KOMPETENSER", certifications: "CERTIFIERINGAR", projects: "PROJEKT", languages: "SPRÅK", other: "ÖVRIGT" };
  const lines: string[] = [];
  if (cv?.contact) {
    const c = cv.contact;
    if (c.name) lines.push(c.name);
    const parts = [c.email, c.phone, c.city, c.linkedin, c.website].filter(Boolean);
    if (parts.length) lines.push(parts.join(" · "));
    lines.push("");
  }
  const sections = (cv?.sections || []).filter((s: any) => s.enabled).sort((a: any, b: any) => a.order - b.order);
  for (const section of sections) {
    switch (section.type) {
      case "profile":
        if (cv.profile) lines.push(H.profile, cv.profile, "");
        break;
      case "experience":
        if (cv.experience?.length) {
          lines.push(H.experience);
          for (const exp of cv.experience) {
            lines.push(`${exp.title}${exp.company ? ", " + exp.company : ""}${exp.location ? " – " + exp.location : ""}`);
            lines.push(`${exp.startDate} – ${exp.isPresent ? H.present : exp.endDate}`);
            // Executive scope fields render in the PDF — the scanner must see them too.
            const meta = [
              exp.pnlSize ? `P&L: ${exp.pnlSize}` : null,
              exp.headcount ? `${lang === "sv" ? "Personalansvar" : "Team"}: ${exp.headcount}` : null,
              exp.revenueImpact ? `${lang === "sv" ? "Intäktspåverkan" : "Revenue impact"}: ${exp.revenueImpact}` : null,
            ].filter(Boolean).join(" · ");
            if (meta) lines.push(meta);
            if (exp.roleScope) lines.push(exp.roleScope);
            for (const b of exp.bullets || []) if (b.trim()) lines.push(`• ${b}`);
            lines.push("");
          }
        }
        break;
      case "education":
        if (cv.education?.length) {
          lines.push(H.education);
          for (const edu of cv.education) {
            lines.push(`${edu.degree}${edu.field ? ", " + edu.field : ""}`);
            lines.push(`${edu.school} · ${edu.startDate} – ${edu.endDate}`);
            lines.push("");
          }
        }
        break;
      case "skills":
        // Mirrors the actual rendering: a bulleted list (3-column grid visually,
        // linear in the text stream).
        if (cv.skills?.length) {
          lines.push(H.skills);
          for (const s of cv.skills) if (s?.trim()) lines.push(`• ${s}`);
          lines.push("");
        }
        break;
      case "certifications":
        if (cv.certifications?.length) {
          lines.push(H.certifications);
          for (const cert of cv.certifications) lines.push(`${cert.name} – ${cert.issuer} (${cert.date})`);
          lines.push("");
        }
        break;
      case "projects":
        if (cv.projects?.length) {
          lines.push(H.projects);
          for (const p of cv.projects) {
            lines.push(p.name);
            if (p.description) lines.push(p.description);
            for (const b of p.bullets || []) if (b.trim()) lines.push(`• ${b}`);
            lines.push("");
          }
        }
        break;
      case "languages":
        if (cv.languages?.length) {
          lines.push(H.languages);
          for (const l of cv.languages) lines.push(`${l.language} – ${l.level}`);
          lines.push("");
        }
        break;
      case "other":
        if (cv.other) lines.push(H.other, cv.other, "");
        break;
    }
  }
  return lines.join("\n");
}

// --- System prompts ---

const SCORING_MODEL = `
## SCORING MODEL (0–100)

### SENIORITY CLASSIFICATION (use when job posting is provided)
Determine seniority strictly from the job TITLE:
- "Director", "Head of", "VP", "Vice President", "C-level" (CEO, CFO, CTO, COO, etc.) → Upper Management
- "Manager", "Chef" (Swedish for manager) → Management
- "Lead", "Principal", "Staff", "Specialist", "Senior" → Senior
- "Mid-level", no explicit seniority qualifier → Mid-level
- "Junior", "Graduate", "Trainee", "Intern" → Junior

This seniority level MUST influence your evaluation:
- **Upper Management / Management**: Expect strategic framing, decision-purpose bullets, stakeholder scope, business outcomes. Penalize tactical/operational-only bullets heavily.
- **Senior**: Expect outcome-first bullets with method specificity. Some strategic framing expected.
- **Mid-level**: Accept activity-based bullets if they show scope and method. Outcome signals are a plus, not required.
- **Junior**: Accept learning-oriented and task-based bullets. Don't penalize lack of strategic framing.

### A) Parse Safety (0–30)
- Standard headings recognized: 0–8
- Contact info in body flow (name + email required): 0–8
- Date consistency (YYYY-MM or similar): 0–6
  IMPORTANT: Use TODAY'S DATE (provided in the user prompt) to determine if dates are in the future. Only flag dates that are actually after today's date.
- Language consistency: 0–4
- No parser noise (emojis, symbol rows, pipes): 0–4

### B) Recruiter Scanability (0–30)
- Single-column flow (no sidebars, no split layout): 0–8
  If multi-column/sidebar detected: FAIL, max 2 points.
  Feedback: "Sidebars break the natural scan path."
- Whitespace & section separation: 0–6
  Feedback if cluttered: "If a recruiter has to work to find your value, they won't."
- Short scannable bullets (90–180 chars ideal): 0–4
- No table-like layout structures: 0–4
  Feedback: "Tables break visual hierarchy."
- Contact info placement (in main body flow, not header-isolated): 0–4
  Feedback: "Headers get skipped on a fast scan. Put name/email where the eye lands first."
- Clean vs cluttered overall impression: 0–4

### C) Relevance to Job Ad (0–25)
If job posting provided:
- Must-have terminology coverage: 0–12
- Nice-to-have coverage: 0–5
- Job-description wording alignment (their words vs generic): 0–5
  Feedback: "Generic language gets glossed over. Use the employer's language where it truthfully reflects your work."
- Title alignment: 0–3
If NO job posting: score out of 15 max, rest N/A.

### D) Evidence & Credibility (0–15)
Adjust expectations based on seniority level (see above).
- Decision-purpose or outcome signal: 0–5
  Penalize bullets that describe activity without consequence (especially for Management/Upper Management roles).
  Feedback: "This explains activity, but not why it mattered."
- Method/tool specificity: 0–4
- Strong verb start (outcome-first for senior roles): 0–3
- No generic claims or buzzwords: 0–3

## GRADES
90–100=A, 80–89=B, 70–79=C, 60–69=D, <60=F
`;

const FEEDBACK_RULES = `
## TRUTHFUL FRAMING (how rejection actually works)
- NEVER claim or imply the ATS will auto-reject the CV over wording ("will be filtered
  out by ATS" is a debunked myth — ~92% of recruiters do not auto-reject on content).
- Frame keyword work truthfully: matching the employer's terms makes the candidate
  FINDABLE in recruiter searches and LEGIBLE in a 6-10 second human scan.
- The real automatic rejections are knockout questions (work authorization, location,
  certifications, required language) — flag these as "hard requirements to answer
  honestly", never as wording problems.

## FEEDBACK RULES
- NEVER give generic advice: "use stronger verbs", "add more numbers", "improve readability", "consider adding skills"
- Every recommendation MUST be tied to a specific section or bullet
- Every recommendation MUST have a clear motivation and a concrete fix or rewrite
- Tone: sharp, pragmatic, recruiter-grade. Not AI-fluffy, not overly pedagogical.
- Write short, clear, confident.
- DO use: "This section is harder to scan than it needs to be.", "This bullet describes work, but not why it mattered."
- DO NOT use: "Consider…", "You may want to…", "Potentially…", "Try to…"
- Be direct.

## ANTI-HALLUCINATION
- NEVER fabricate numbers, tools, responsibilities, or outcomes.
- If impact is missing, use placeholder: "[FILL IN: ROI / savings / margin / approval / time-to-decision]"
- If scope is missing: "[FILL IN: team / stakeholders / budget]"
- Every finding MUST cite evidence from the CV.

## BULLET-LEVEL FEEDBACK
For each bullet, assess:
1. Is it too generic?
2. Does it describe activity without value?
3. Does it use candidate's own words instead of job ad language?
4. Is it too long or too compact?
5. Does it lack decision-purpose / consequence signal?
6. Is it hard to scan quickly?

Issue type "generic_activity": triggered when bullet starts with neutral verbs (developed, worked on, responsible for, managed, handled, assisted) AND lacks decision-purpose, scope, consequence, or recruiter-relevant framing.

## BULLET REWRITE PRINCIPLES
For senior/commercial/strategic roles, default rewrite pattern:
1. Decision-purpose first
2. Method/how second
3. Outcome third (only if confirmed, otherwise placeholder)

## COMPETENCE THEMES (job_language_match.competence_themes) — how recruiters actually screen
Recruiters do not evaluate keyword lists. They define 4–7 CORE COMPETENCE BUCKETS for the
role (e.g. "Controlling", "Transformation", "Commercial leadership") and judge whether the
CV EVIDENCES each bucket. Keywords are only signals that support a bucket.
- Derive 4–7 competence themes from the posting. Mark each "must" or "nice" by how the
  posting weights it (title + repeated emphasis + must-have list beat single mentions).
- For each theme, judge the CV's evidence: "strong" (quantified achievements clearly in
  this bucket), "partial" (related work, weak framing), "missing" (no honest evidence).
  Cite where in evidence_note.
- supporting_terms_present: the posting's terms for this theme that the CV already uses
  (in any language/form). supporting_terms_missing: the posting's terms that would
  reinforce this theme and are genuinely absent (subject to the matching rules below).
- A theme with strong evidence but missing exact terms needs WORDING, not new content.
  A "must" theme with missing evidence is an honest gap — say so.
- missing_phrases must be consistent with the themes: every missing phrase should belong
  to some theme's supporting_terms_missing. No posting → return an empty themes array.

## KEYWORD MATCHING RULES (job_language_match) — how real ATS matching works
A posting keyword counts as PRESENT on the CV if it appears in ANY of these forms:
1. Exact or lightly inflected form (singular/plural, verb form, hyphen/space variants: "e-commerce" = "ecommerce").
2. Its acronym OR its spelled-out form (P&L = profit and loss; GTM = go-to-market; KPI = key performance indicator).
3. Its TRANSLATION between Swedish and English — the CV and the ad may be in different languages. Examples: "ledningsgrupp" = "management team"/"executive team"; "affärsutveckling" = "business development"; "försäljning" = "sales"; "prissättning" = "pricing"; "förändringsledning" = "change management".
4. An unambiguous synonym for the same competence ("kundresa" = "customer journey").
Before adding ANYTHING to missing_phrases: actively search the rendered CV text for all four forms. If any form is present, the keyword is NOT missing.
- Frequency does not matter — presence does. The strongest pattern is one mention in Skills plus one inside a quantified bullet. Never recommend repeating a term.
- Many ATS still match literally: when a keyword is covered only via translation/synonym, do NOT list it as missing, but you MAY add a suggested_replacement swapping the CV's wording to the posting's exact term (only where truthful).
- If a term is present only as an acronym or only spelled out, suggest writing "Full Term (ACRONYM)" once — do not list it as missing.
- missing_phrases must be concrete competences/tools/terms worth adding — never soft traits or fluff.

## SCANABILITY CHECK
Return 5 dimensions:
- single_column_flow: pass/warning/fail
- contact_info: pass/warning/fail
- plain_text_layout: pass/warning/fail
- job_language_match: pass/warning/fail (fail if no job posting = warning with note)
- clean_vs_cluttered: pass/warning/fail

## FIRST SCAN ISSUES
Return the 3 most important problems a recruiter would notice in the first 6–10 second scan. These must be high-level, visual/structural observations.
`;

const SYSTEM_PROMPT_SV = `Du är en expert-rekryterare och ATS-specialist. Du bedömer CV:t som BÅDE en maskin (ATS) OCH en stressad rekryterare som skannar i 6–10 sekunder.

${SCORING_MODEL}
${FEEDBACK_RULES}

Svara ALLTID på svenska i alla textfält. Var skarp, konkret och direkt. Ingen fluff.`;

const SYSTEM_PROMPT_EN = `You are an expert recruiter and ATS specialist. You evaluate the CV as BOTH a machine (ATS) AND a stressed recruiter scanning in 6–10 seconds.

${SCORING_MODEL}
${FEEDBACK_RULES}

Always respond in English in all text fields. Be sharp, concrete, and direct. No fluff.`;

// --- Output schema ---

const RESULT_SCHEMA = {
  type: "object",
  properties: {
    overall_score: { type: "number" },
    grade: { type: "string", enum: ["A", "B", "C", "D", "F"] },
    summary: { type: "string", description: "1-2 sentence recruiter-style summary" },
    subscores: {
      type: "object",
      properties: {
        parse: { type: "number", description: "0-30" },
        scanability: { type: "number", description: "0-30" },
        relevance: { type: "number", description: "0-25" },
        evidence: { type: "number", description: "0-15" },
      },
      required: ["parse", "scanability", "relevance", "evidence"],
      additionalProperties: false,
    },
    first_scan_issues: {
      type: "array",
      description: "Top 3 problems a recruiter sees in first 6-10 seconds",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          why_it_matters: { type: "string" },
          fix: { type: "string" },
        },
        required: ["title", "why_it_matters", "fix"],
        additionalProperties: false,
      },
    },
    scanability_check: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dimension: { type: "string", enum: ["single_column_flow", "contact_info", "plain_text_layout", "job_language_match", "clean_vs_cluttered"] },
          status: { type: "string", enum: ["pass", "warning", "fail"] },
          why_it_matters: { type: "string" },
          recommendation: { type: "string" },
        },
        required: ["dimension", "status", "why_it_matters", "recommendation"],
        additionalProperties: false,
      },
    },
    parse_check: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dimension: { type: "string" },
          status: { type: "string", enum: ["pass", "warning", "fail"] },
          why_it_matters: { type: "string" },
          recommendation: { type: "string" },
        },
        required: ["dimension", "status", "why_it_matters", "recommendation"],
        additionalProperties: false,
      },
    },
    job_language_match: {
      type: "object",
      properties: {
        competence_themes: {
          type: "array",
          description: "4-7 core competence buckets the role screens for (recruiter lens), each with CV evidence strength and supporting terms",
          items: {
            type: "object",
            properties: {
              theme: { type: "string", description: "The competence bucket, e.g. 'Controlling' or 'Transformation'" },
              importance: { type: "string", enum: ["must", "nice"] },
              evidence: { type: "string", enum: ["strong", "partial", "missing"] },
              evidence_note: { type: "string", description: "One short sentence: where the CV evidences this (or that it doesn't)" },
              supporting_terms_present: { type: "array", items: { type: "string" } },
              supporting_terms_missing: { type: "array", items: { type: "string" } },
            },
            required: ["theme", "importance", "evidence", "evidence_note", "supporting_terms_present", "supporting_terms_missing"],
            additionalProperties: false,
          },
        },
        missing_phrases: { type: "array", items: { type: "string" } },
        generic_phrases_to_replace: { type: "array", items: { type: "string" } },
        suggested_replacements: {
          type: "array",
          items: {
            type: "object",
            properties: {
              from: { type: "string" },
              to: { type: "string" },
              where: { type: "string" },
            },
            required: ["from", "to", "where"],
            additionalProperties: false,
          },
        },
      },
      required: ["competence_themes", "missing_phrases", "generic_phrases_to_replace", "suggested_replacements"],
      additionalProperties: false,
    },
    bullet_feedback: {
      type: "array",
      items: {
        type: "object",
        properties: {
          bullet_id: { type: "string" },
          score: { type: "number", description: "0-10" },
          issues: { type: "array", items: { type: "string" } },
          recruiter_comment: { type: "string" },
          suggestions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["decision_first", "keyword_alignment", "shorter", "clearer", "language_match"] },
                why: { type: "string" },
                rewrite: { type: "string" },
                estimated_gain: { type: "string" },
              },
              required: ["type", "why", "rewrite", "estimated_gain"],
              additionalProperties: false,
            },
          },
        },
        required: ["bullet_id", "score", "issues", "recruiter_comment", "suggestions"],
        additionalProperties: false,
      },
    },
    next_actions: { type: "array", items: { type: "string" }, description: "Max 5 prioritized actions" },
  },
  required: ["overall_score", "grade", "summary", "subscores", "first_scan_issues", "scanability_check", "parse_check", "job_language_match", "bullet_feedback", "next_actions"],
  additionalProperties: false,
};
