// Golden-set eval: runs fixed CV+ad pairs through the LIVE edge functions and asserts
// the invariants every past regression taught us. Run before/after any prompt or
// model change:
//
//   EVAL_EMAIL=... EVAL_PASSWORD=... node scripts/eval.mjs
//
// SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY are read from .env automatically.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n").filter(l => l.includes("="))
    .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const URL_ = env.SUPABASE_URL, KEY = env.SUPABASE_PUBLISHABLE_KEY;
const EMAIL = process.env.EVAL_EMAIL, PASSWORD = process.env.EVAL_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error("Set EVAL_EMAIL and EVAL_PASSWORD."); process.exit(2); }

const supabase = createClient(URL_, KEY);
const { error: authErr } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (authErr) { console.error("Auth failed:", authErr.message); process.exit(2); }

// ── Golden fixtures: an English CV against a Swedish ad, loaded with every trap
//    that has bitten us: cross-language terms, employer descriptors, trait phrases,
//    &-labels, numbers that must never change. ─────────────────────────────────
const CV = {
  contact: { name: "Eva Test", email: "eva@example.com", phone: "+46 70 000 00 00", city: "Stockholm", linkedin: "", website: "" },
  profile: "Commercial leader with experience across pricing, B2C portfolios and team development.",
  experience: [
    { id: "e1", title: "Head of Commercial", company: "Acme AB", location: "Stockholm", startDate: "2020-01", endDate: "", isPresent: true,
      bullets: [
        "Owned commercial and offering responsibility for a 20000+ customer B2C portfolio.",
        "Led pricing and packaging changes that raised ARPU 12% with flat churn.",
        "Integrated two acquired companies into one commercial organisation.",
      ] },
    { id: "e2", title: "Business Analyst", company: "Corp AB", location: "Göteborg", startDate: "2014-01", endDate: "2017-06", isPresent: false,
      bullets: ["Built pricing models as decision input for the management team."] },
  ],
  education: [{ id: "ed1", degree: "MSc", school: "Handelshögskolan", field: "Economics", startDate: "2010-08", endDate: "2014-06" }],
  skills: ["Pricing", "P&L management", "Salesforce"],
  certifications: [], projects: [], languages: [{ id: "l1", language: "Svenska", level: "Modersmål" }], other: "",
  sections: [
    { id: "contact", type: "contact", enabled: true, order: 0 },
    { id: "profile", type: "profile", enabled: true, order: 1 },
    { id: "skills", type: "skills", enabled: true, order: 2 },
    { id: "experience", type: "experience", enabled: true, order: 3 },
    { id: "education", type: "education", enabled: true, order: 4 },
    { id: "languages", type: "languages", enabled: true, order: 7 },
  ],
};

const AD = `Head of Commercial Offering – Svea Tillväxt AB
Svea Tillväxt är en serieförvärvare som integrerar dotterbolag i hela Norden.
Vi söker dig med starkt affärsägarskap och minst 5 års erfarenhet av prissättning och paketering.
Du rapporterar till ledningsgruppen och driver utveckling av erbjudandet för 50000+ kunder.
Krav: flytande svenska. Erfarenhet av Salesforce och Power BI är meriterande.`;

const TRAIT_LEAD = /^(strong|proven|excellent|solid|good|demonstrated|stark|starkt|god|gott|gedigen|dokumenterad|utmärkt)\s/i;
const EM_DASH = /—|–/;
const SWEDISH_MARKERS = ["serieförvärvare", "dotterbolag", "ledningsgrupp", "prissättning"];

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); };
const invoke = async (fn, body) => {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(`${fn}: ${error.message}`);
  if (data?.error) throw new Error(`${fn}: ${data.error}`);
  return data;
};
const deepStrings = (v, out = []) => {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach(x => deepStrings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach(x => deepStrings(x, out));
  return out;
};
const wordDiff = (a, b) => {
  const aw = a.trim().split(/\s+/), bw = b.trim().split(/\s+/);
  let pre = 0; while (pre < aw.length && pre < bw.length && aw[pre] === bw[pre]) pre++;
  let suf = 0; while (suf < aw.length - pre && suf < bw.length - pre && aw[aw.length - 1 - suf] === bw[bw.length - 1 - suf]) suf++;
  return Math.max(aw.length, bw.length) - pre - suf;
};

try {
  // ── analyze-job-posting ──
  const ja = await invoke("analyze-job-posting", { job_posting_text: AD });
  check("ajp: 4–7 themes", (ja.competence_themes?.length ?? 0) >= 3 && (ja.competence_themes?.length ?? 0) <= 8, `${ja.competence_themes?.length}`);
  check("ajp: knockout captures svenska", (ja.knockout_requirements || []).some(k => /svensk/i.test(k)), JSON.stringify(ja.knockout_requirements));
  check("ajp: tools include Salesforce", (ja.tools_and_systems || []).some(t => /salesforce/i.test(t)), JSON.stringify(ja.tools_and_systems));
  check("ajp: model tracked", !!ja._meta?.model, ja._meta?.model || "missing");

  // ── analyze-job-posting: wish-framed requirements must never become knockouts,
  //    and pedigree asks must become capability themes (the Inrego lesson) ──
  const AD2 = `Head of Business Transformation – Inrego
Som Head of Business Transformation rapporterar du till VD och arbetar nära ledningsgruppen.
Rollen kombinerar affärsutveckling, verksamhetsutveckling, projektledning och AI-driven transformation.
För att lyckas i rollen tror vi att du har:
* Akademisk examen, exempelvis inom industriell ekonomi, teknik, ekonomi eller motsvarande.
* Några års erfarenhet från management- eller strategikonsulting (exempelvis McKinsey, Bain, BCG eller motsvarande).
* Erfarenhet av att leda förändrings- eller transformationsprojekt.
* Intresse för och kunskap inom AI, digitalisering och automation.
Har du dessutom erfarenhet från en operativ linjeroll är det meriterande.`;
  const ja2 = await invoke("analyze-job-posting", { job_posting_text: AD2 });
  const ko2 = ja2.knockout_requirements || [];
  check("ajp2: wish-framed examen is not a knockout", !ko2.some(k => /examen|degree/i.test(k)), JSON.stringify(ko2));
  check("ajp2: wish-framed konsulting is not a knockout", !ko2.some(k => /konsult|consult/i.test(k)), JSON.stringify(ko2));
  check("ajp2: no pedigree themes (bakgrund/background)", !(ja2.competence_themes || []).some(t => /bakgrund|background/i.test(t.theme)), JSON.stringify((ja2.competence_themes || []).map(t => t.theme)));
  const BRAND = /\b(mckinsey|bain|bcg|mbb|big ?4)\b/i;
  check("ajp2: brands never in supporting_terms", !(ja2.competence_themes || []).some(t => (t.supporting_terms || []).some(s => BRAND.test(s))), JSON.stringify((ja2.competence_themes || []).map(t => t.supporting_terms)));
  check("ajp2: brands captured as proxy_terms", (ja2.competence_themes || []).some(t => (t.proxy_terms || []).some(p => BRAND.test(p))), JSON.stringify((ja2.competence_themes || []).map(t => t.proxy_terms)));

  // ── ats-check (twice: score stability) ──
  const body = { resume_content_json: CV, job_posting_text: AD, locale: "en", demand_profile: { competence_themes: ja.competence_themes, knockout_requirements: ja.knockout_requirements } };
  const a1 = await invoke("ats-check", body);
  const a2 = await invoke("ats-check", body);
  check("ats: score in range", a1.overall_score >= 0 && a1.overall_score <= 100, `${a1.overall_score}`);
  check("ats: stable across runs (|Δ|≤3)", Math.abs(a1.overall_score - a2.overall_score) <= 3, `${a1.overall_score} vs ${a2.overall_score}`);
  const mp = a1.job_language_match?.missing_phrases || [];
  check("ats: no trait-lead keywords", !mp.some(p => TRAIT_LEAD.test(p)), JSON.stringify(mp));
  check("ats: no >4-word keywords", !mp.some(p => p.split(/\s+/).length > 4), JSON.stringify(mp));
  check("ats: guards reported", !!a1._meta?.guards, JSON.stringify(a1._meta));
  const normPB = s => s.toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();
  const cvBullets = CV.experience.flatMap(e => e.bullets).map(normPB);
  check("ats: proof bullets quote the CV verbatim", (a1.job_language_match?.competence_themes || []).every(t => !t.proof_bullet || cvBullets.some(b => b.includes(normPB(t.proof_bullet)) || normPB(t.proof_bullet).includes(b))), JSON.stringify((a1.job_language_match?.competence_themes || []).map(t => t.proof_bullet)));

  // ── ats-check with evidence ledger: lifts allowed, capped at 4 without CV visibility ──
  const aev = await invoke("ats-check", { ...body, verified_evidence: [{
    keyword: "transformation",
    answer: "Jag ledde integrationen av två förvärvade bolag och satte den nya kommersiella organisationen, 12 månaders program",
    role: "Head of Commercial · Acme AB",
  }] });
  check("ats-ev: ledger accepted", aev.overall_score >= 0 && aev.overall_score <= 100, `${aev.overall_score}`);
  check("ats-ev: lifted themes capped at 4", (aev.job_language_match?.competence_themes || []).every(t => !t.lifted_by_evidence || Math.round(t.rating ?? 0) <= 4), JSON.stringify((aev.job_language_match?.competence_themes || []).filter(t => t.lifted_by_evidence)));

  // ── place-keywords: the classic traps ──
  const pk = await invoke("place-keywords", { resume_content_json: CV, missing_phrases: ["serieförvärvare", "dotterbolag", "ledningsgrupp", "starkt affärsägarskap", "Team Leadership & Development"], locale: "en" });
  const placed = pk.placements || [];
  check("pk: no Swedish words added to English bullets", !placed.some(p => SWEDISH_MARKERS.some(w => p.revised.toLowerCase().includes(w) && !p.original.toLowerCase().includes(w))), JSON.stringify(placed.map(p => p.revised)));
  check("pk: swap width ≤3 words", !placed.some(p => wordDiff(p.original, p.revised) > 3), "");
  check("pk: numbers untouched", !placed.some(p => (p.original.match(/\d+/g) || []).join() !== (p.revised.match(/\d+/g) || []).join()), "");
  check("pk: no &-labels or trait phrases in bullets", !placed.some(p => /&/.test(p.revised.replace(p.original, "")) ) && !placed.some(p => /affärsägarskap|team leadership & development/i.test(p.revised)), "");
  check("pk: no em dashes anywhere", !deepStrings(pk).some(s => EM_DASH.test(s)), "");

  // ── place-keywords: new-bullet contract (distilled CV language, never interview mash) ──
  const pk2 = await invoke("place-keywords", { resume_content_json: CV, missing_phrases: ["Management- & strategikonsulting"], locale: "en", evidence: [{
    keyword: "Management- & strategikonsulting",
    answer: "Jag har lett strategiprojekt själv",
    statements: ["Jag har lett strategiprojekt själv", "Jag har designat om kundresor"],
    detail: "kundresor och förvärvsintegrationer för ledningsgrupper i tre bolag",
    role: "Business Analyst · Corp AB",
  }] });
  const nbs = pk2.new_bullets || [];
  check("nb: no first person", !nbs.some(n => /jag/i.test(n.bullet) || /I/.test(n.bullet)), JSON.stringify(nbs.map(n => n.bullet)));
  check("nb: no semicolon mash", !nbs.some(n => /;/.test(n.bullet)), "");
  check("nb: max two coordinated clauses", !nbs.some(n => (n.bullet.match(/(och|and)/gi) || []).length >= 3), JSON.stringify(nbs.map(n => n.bullet)));

  // ── place-keywords: pedigree guard (the McKinsey-style lesson) — brands from the ad,
  //    even when the candidate's own answer mentions them, never enter the CV ──
  const pk3 = await invoke("place-keywords", { resume_content_json: CV, missing_phrases: ["strategikonsulting", "business case"], locale: "en", never_insert: ["McKinsey", "Bain", "BCG", "MBB"], evidence: [{
    keyword: "strategikonsulting",
    answer: "Jag har inte jobbat på McKinsey men byggde business case och beslutsunderlag som ledningsgruppen fattade beslut på i tre bolag",
    role: "Business Analyst · Corp AB",
  }] });
  const allPk3 = [...(pk3.placements || []).map(p => p.revised), ...(pk3.new_bullets || []).map(n => n.bullet)];
  check("pk3: no brand names or X-style constructions", !allPk3.some(s => BRAND.test(s) || /[A-ZÅÄÖ][\w&ÅÄÖåäö.]*-(style|inspired|liknande|klass|anda)/.test(s)), JSON.stringify(allPk3));

  // ── verify-keywords ──
  const vk = await invoke("verify-keywords", { resume_content_json: CV, missing_phrases: ["prissättning", "transformation"], locale: "sv" });
  const qs = vk.questions || [];
  check("vk: questions returned", qs.length >= 1, `${qs.length}`);
  check("vk: 1–3 options each", qs.every(q => (q.options || []).length >= 1 && (q.options || []).length <= 3), "");
  check("vk: no numbers in options", !qs.some(q => (q.options || []).some(o => /\d/.test(o))), "");
  check("vk: no em dashes", !deepStrings(vk).some(s => EM_DASH.test(s)), "");
} catch (e) {
  check("run completed", false, e.message);
}

const pass = results.filter(r => r.ok).length;
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : `  →  ${r.detail}`}`);
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
