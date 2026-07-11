/**
 * Role advice library.
 *
 * The premise behind role templates: your facts as a person don't change — what you
 * emphasize does. When you angle the same base profile toward "Head of Commercial" one
 * day and "Head of Product" the next, a recruiter for each is scanning for a different
 * story. This library encodes, per role, what to foreground, what to play down, the
 * competencies and ATS keywords that role screens for, and the metrics that resonate.
 *
 * Nothing here invents experience. It only tells you which of YOUR real achievements to
 * lead with, and how to frame them, for a given target role.
 */

export type Lang = "sv" | "en";

export interface RoleAdvice {
  /** Stable id stored in CVMeta.targetRole. */
  id: string;
  label: Record<Lang, string>;
  /** One-line summary of the angle for this role. */
  focus: Record<Lang, string>;
  /** Achievements/skills to lead with (foreground in the top third of the CV). */
  emphasize: Record<Lang, string[]>;
  /** True but off-target for this role — keep, but don't lead with it. */
  deemphasize: Record<Lang, string[]>;
  /** ATS keywords the role tends to screen for. Kept role-generic and mostly bilingual-safe. */
  keywords: string[];
  /** Metrics a recruiter for this role expects to see quantified. */
  metrics: Record<Lang, string[]>;
}

export const ROLE_PRESETS: RoleAdvice[] = [
  {
    id: "head-of-commercial",
    label: { sv: "Head of Commercial", en: "Head of Commercial" },
    focus: {
      sv: "Äg intäkten. Rama in dig som den som kopplar pris, paketering och go-to-market till lönsam tillväxt.",
      en: "Own the revenue. Frame yourself as the person who connects pricing, packaging and go-to-market to profitable growth.",
    },
    emphasize: {
      sv: [
        "Intäkts- och marginalansvar (P&L, ARPU, tillväxt) med siffror",
        "Pris- och paketeringsstrategi och konkreta utfall",
        "Go-to-market, kommersiella modeller och abonnemang/upsell",
        "Kommersiella synergier vid förvärv och harmonisering",
      ],
      en: [
        "Revenue & margin ownership (P&L, ARPU, growth) with numbers",
        "Pricing & packaging strategy and concrete outcomes",
        "Go-to-market, commercial models and subscription/upsell",
        "Commercial synergies from M&A and harmonisation",
      ],
    },
    deemphasize: {
      sv: ["Djup teknisk leverans", "Detaljerad backlog-/sprinthantering"],
      en: ["Deep technical delivery", "Detailed backlog/sprint mechanics"],
    },
    keywords: [
      "P&L", "ARPU", "pricing", "packaging", "go-to-market", "GTM", "churn",
      "retention", "upsell", "revenue growth", "commercial strategy", "margin",
    ],
    metrics: {
      sv: ["Intäktstillväxt %", "ARPU-förändring", "Churn/retention", "Marginal/lönsamhet", "Upsell/merförsäljning %"],
      en: ["Revenue growth %", "ARPU change", "Churn/retention", "Margin/profitability", "Upsell rate %"],
    },
  },
  {
    id: "head-of-product",
    label: { sv: "Head of Product", en: "Head of Product" },
    focus: {
      sv: "Äg utfallet, inte outputen. Rama in dig kring discovery, prioritering och mätbar produktimpact.",
      en: "Own outcomes, not output. Frame yourself around discovery, prioritisation and measurable product impact.",
    },
    emphasize: {
      sv: [
        "Produktstrategi och roadmap kopplad till affärsmål",
        "Discovery-lett arbetssätt och tvärfunktionella squads",
        "Kundinsikt → designbeslut → mätbart utfall",
        "Aktivering, retention och produktdriven tillväxt",
      ],
      en: [
        "Product strategy & roadmap tied to business goals",
        "Discovery-led ways of working and cross-functional squads",
        "Customer insight → design decision → measurable outcome",
        "Activation, retention and product-led growth",
      ],
    },
    deemphasize: {
      sv: ["Ren säljexekvering", "Kampanj-/mediaköp-detaljer"],
      en: ["Pure sales execution", "Campaign/media-buying detail"],
    },
    keywords: [
      "product strategy", "roadmap", "discovery", "product-led growth", "PLG",
      "activation", "retention", "OKR", "cross-functional", "user research", "A/B test",
    ],
    metrics: {
      sv: ["Aktivering/onboarding %", "Retention/churn", "Feature-adoption", "NPS/CSAT", "Time-to-value"],
      en: ["Activation/onboarding %", "Retention/churn", "Feature adoption", "NPS/CSAT", "Time-to-value"],
    },
  },
  {
    id: "head-of-sales",
    label: { sv: "Head of Sales", en: "Head of Sales" },
    focus: {
      sv: "Äg pipeline och quota. Rama in dig kring team, förutsägbarhet och avslut.",
      en: "Own pipeline and quota. Frame yourself around team, predictability and closing.",
    },
    emphasize: {
      sv: [
        "Quota-uppfyllnad och intäktsmål med siffror",
        "Pipeline, konvertering och säljcykel",
        "Bygga, coacha och skala säljteam",
        "Nyckelaffärer, förhandling och nyckelkunder",
      ],
      en: [
        "Quota attainment and revenue targets with numbers",
        "Pipeline, conversion and sales-cycle length",
        "Building, coaching and scaling sales teams",
        "Key deals, negotiation and named accounts",
      ],
    },
    deemphasize: {
      sv: ["Teknisk produktdetalj", "Långsiktig FoU"],
      en: ["Technical product detail", "Long-horizon R&D"],
    },
    keywords: [
      "quota", "pipeline", "conversion", "sales cycle", "forecasting", "CRM",
      "account management", "negotiation", "win rate", "new business", "B2B sales",
    ],
    metrics: {
      sv: ["Quota-uppfyllnad %", "Win rate", "Pipeline-värde", "Säljcykel (dagar)", "ACV/dealstorlek"],
      en: ["Quota attainment %", "Win rate", "Pipeline value", "Sales cycle (days)", "ACV/deal size"],
    },
  },
  {
    id: "head-of-marketing",
    label: { sv: "Head of Marketing", en: "Head of Marketing" },
    focus: {
      sv: "Äg efterfrågan och varumärke. Rama in dig kring pipeline-bidrag och effektiv tillväxt.",
      en: "Own demand and brand. Frame yourself around pipeline contribution and efficient growth.",
    },
    emphasize: {
      sv: [
        "Demand gen och marknadsförings bidrag till pipeline",
        "Varumärke, positionering och budskap",
        "CAC, LTV och kanaleffektivitet",
        "Lansering och kampanjresultat med siffror",
      ],
      en: [
        "Demand gen and marketing-sourced pipeline",
        "Brand, positioning and messaging",
        "CAC, LTV and channel efficiency",
        "Launches and campaign results with numbers",
      ],
    },
    deemphasize: {
      sv: ["Direkt avslutsansvar", "Djup teknisk leverans"],
      en: ["Direct closing ownership", "Deep technical delivery"],
    },
    keywords: [
      "demand generation", "brand", "positioning", "CAC", "LTV", "MQL", "SQL",
      "pipeline", "campaign", "content", "SEO", "lifecycle marketing",
    ],
    metrics: {
      sv: ["Marknadssourcad pipeline %", "CAC/LTV", "MQL→SQL-konvertering", "Kampanj-ROI", "Varumärkeskännedom"],
      en: ["Marketing-sourced pipeline %", "CAC/LTV", "MQL→SQL conversion", "Campaign ROI", "Brand awareness"],
    },
  },
  {
    id: "head-of-growth",
    label: { sv: "Head of Growth", en: "Head of Growth" },
    focus: {
      sv: "Äg tillväxtloopen. Rama in dig kring experiment, funnel och skalbara kanaler.",
      en: "Own the growth loop. Frame yourself around experimentation, funnel and scalable channels.",
    },
    emphasize: {
      sv: [
        "Funnel-optimering från förvärv till retention",
        "Experimentvelocity och vinnande tester",
        "Skalbara kanaler och enhetsekonomi",
        "Data-/analysdrivna beslut",
      ],
      en: [
        "Funnel optimisation from acquisition to retention",
        "Experiment velocity and winning tests",
        "Scalable channels and unit economics",
        "Data-/analytics-driven decisions",
      ],
    },
    deemphasize: {
      sv: ["Traditionell varumärkesbyggnad", "Manuell säljexekvering"],
      en: ["Traditional brand building", "Manual sales execution"],
    },
    keywords: [
      "growth", "funnel", "experimentation", "A/B test", "activation", "retention",
      "unit economics", "CAC", "LTV", "conversion rate optimization", "analytics",
    ],
    metrics: {
      sv: ["Konverteringsuppgång %", "Antal experiment/kvartal", "CAC/LTV", "Aktivering/retention", "Tillväxt %"],
      en: ["Conversion lift %", "Experiments/quarter", "CAC/LTV", "Activation/retention", "Growth %"],
    },
  },
  {
    id: "gm",
    label: { sv: "General Manager / Country Manager", en: "General Manager / Country Manager" },
    focus: {
      sv: "Äg helheten. Rama in dig kring full P&L, team och marknadsutfall.",
      en: "Own the whole. Frame yourself around full P&L, team and market outcomes.",
    },
    emphasize: {
      sv: [
        "Full P&L- och verksamhetsansvar",
        "Bygga och leda ledningsgrupp/organisation",
        "Marknads-/enhetstillväxt och lönsamhet",
        "Tvärfunktionell exekvering över sälj, produkt, drift",
      ],
      en: [
        "Full P&L and operational ownership",
        "Building and leading a leadership team/organisation",
        "Market/unit growth and profitability",
        "Cross-functional execution across sales, product, ops",
      ],
    },
    deemphasize: {
      sv: ["Enskild funktionsdetalj", "Hands-on specialistuppgifter"],
      en: ["Single-function detail", "Hands-on specialist tasks"],
    },
    keywords: [
      "P&L", "general management", "operations", "leadership", "growth",
      "profitability", "strategy", "cross-functional", "transformation", "scale",
    ],
    metrics: {
      sv: ["P&L-storlek", "Tillväxt %", "Lönsamhet/EBIT", "Headcount/organisation", "Marknadsandel"],
      en: ["P&L size", "Growth %", "Profitability/EBIT", "Headcount/org size", "Market share"],
    },
  },
  {
    id: "head-of-operations",
    label: { sv: "Head of Operations", en: "Head of Operations" },
    focus: {
      sv: "Äg leverans och effektivitet. Rama in dig kring skala, kvalitet och kostnad.",
      en: "Own delivery and efficiency. Frame yourself around scale, quality and cost.",
    },
    emphasize: {
      sv: [
        "Skala leverans utan att kostnaden skenar",
        "Processdesign, automation och systeminförande",
        "Kvalitet, SLA och effektivitet med siffror",
        "Förändringsledning i drift",
      ],
      en: [
        "Scaling delivery without runaway cost",
        "Process design, automation and system rollouts",
        "Quality, SLA and efficiency with numbers",
        "Change management in operations",
      ],
    },
    deemphasize: {
      sv: ["Varumärke/positionering", "Direkt säljexekvering"],
      en: ["Brand/positioning", "Direct sales execution"],
    },
    keywords: [
      "operations", "process improvement", "automation", "efficiency", "SLA",
      "cost reduction", "scheduling", "field service", "change management", "scale",
    ],
    metrics: {
      sv: ["Effektivitetsvinst %", "Kostnadsreduktion", "SLA/kvalitet", "Genomloppstid", "Kapacitet/skala"],
      en: ["Efficiency gain %", "Cost reduction", "SLA/quality", "Cycle time", "Capacity/scale"],
    },
  },
  {
    id: "head-of-strategy",
    label: { sv: "Head of Strategy / Transformation", en: "Head of Strategy / Transformation" },
    focus: {
      sv: "Äg riktningen. Rama in dig kring strategi, transformation och mätbart genomförande.",
      en: "Own the direction. Frame yourself around strategy, transformation and measurable execution.",
    },
    emphasize: {
      sv: [
        "Strategiformulering och genomförande med utfall",
        "Transformationsprogram och portföljstyrning",
        "M&A, due diligence och synergier",
        "C-level stakeholder management",
      ],
      en: [
        "Strategy formulation and execution with outcomes",
        "Transformation programmes and portfolio governance",
        "M&A, due diligence and synergies",
        "C-level stakeholder management",
      ],
    },
    deemphasize: {
      sv: ["Daglig funktionsdrift", "Hands-on specialistuppgifter"],
      en: ["Day-to-day functional running", "Hands-on specialist tasks"],
    },
    keywords: [
      "strategy", "transformation", "M&A", "due diligence", "change management",
      "portfolio", "stakeholder management", "operating model", "synergies", "roadmap",
    ],
    metrics: {
      sv: ["Programvärde/budget", "Realiserade synergier", "Genomförandegrad", "Tid till effekt", "ROI"],
      en: ["Programme value/budget", "Synergies realised", "Delivery/completion rate", "Time to impact", "ROI"],
    },
  },
];

export function getRoleAdvice(id?: string | null): RoleAdvice | undefined {
  if (!id) return undefined;
  return ROLE_PRESETS.find((r) => r.id === id);
}

/** Display label for any stored role id, falling back to a custom label or the raw id. */
export function roleLabel(id?: string | null, customLabel?: string | null, lang: Lang = "sv"): string {
  const preset = getRoleAdvice(id);
  if (preset) return preset.label[lang];
  return customLabel || id || "";
}
