import { QuickProfile, ProfileId } from "@/types/bullet-coach";

export const PROFILES: QuickProfile[] = [
  {
    id: "investment",
    label: { sv: "Investering / Business case", en: "Investment / Business case" },
    keywords: ["business case", "capex", "opex", "roi", "scenario", "invest", "dcf", "payback", "npv", "beslutsunderlag", "kalkyl"],
    questions: {
      sv: [
        "Vilket beslut skulle detta stödja (investera/prioritera/pausa)?",
        "Vem använde underlaget (CFO/ledning/AM/styrelse)?",
        "Vilken modell/metod använde du (CAPEX/OPEX, ROI, scenario, DCF)?",
        "Fanns effekt? Om ja: vilken typ?",
      ],
      en: [
        "What decision did this support (invest/prioritize/pause)?",
        "Who used the output (CFO/leadership/board)?",
        "What model/method did you use (CAPEX/OPEX, ROI, scenario, DCF)?",
        "Was there an effect? If so, what type?",
      ],
    },
    allowed_verbs: {
      sv: ["Stödde", "Möjliggjorde", "Underbyggde", "Drev", "Säkerställde", "Kvantifierade"],
      en: ["Supported", "Enabled", "Underpinned", "Drove", "Secured", "Quantified"],
    },
    recommended_metrics: ["ROI", "NPV", "payback period", "savings", "CAPEX", "OPEX"],
    rewrite_templates: {
      sv: [
        "Stödde {decision_purpose} genom {method_tool} för {stakeholders}. {outcome_metric}",
        "Möjliggjorde {decision_purpose} genom att bygga {method_tool} över {scope}. {outcome_metric}",
        "Underbyggde {decision_purpose} via {method_tool}. {outcome_metric}",
      ],
      en: [
        "Supported {decision_purpose} by {method_tool} for {stakeholders}. {outcome_metric}",
        "Enabled {decision_purpose} by building {method_tool} across {scope}. {outcome_metric}",
        "Underpinned {decision_purpose} via {method_tool}. {outcome_metric}",
      ],
    },
  },
  {
    id: "pricing",
    label: { sv: "Prissättning / Kommersiell strategi", en: "Pricing / Commercial strategy" },
    keywords: ["pricing", "pris", "discount", "rabatt", "margin", "marginal", "arpu", "packaging", "governance", "cpq", "commercial"],
    questions: {
      sv: [
        "Vilken prishävstång (höjning, rabatt, paket, governance)?",
        "Var implementerades det (CPQ/SF, policy, process)?",
        "Vilket mål/utfall (margin/ARPU/churn)?",
        "Vilka stakeholders (Sales/Ops/Finance/IT)?",
      ],
      en: [
        "What pricing lever (increase, discount, packaging, governance)?",
        "Where was it implemented (CPQ/SF, policy, process)?",
        "What was the goal/outcome (margin/ARPU/churn)?",
        "Which stakeholders (Sales/Ops/Finance/IT)?",
      ],
    },
    allowed_verbs: {
      sv: ["Förbättrade", "Implementerade", "Optimerade", "Drev", "Införde", "Säkrade"],
      en: ["Improved", "Implemented", "Optimized", "Drove", "Established", "Secured"],
    },
    recommended_metrics: ["margin", "ARPU", "churn", "discount rate", "revenue uplift"],
    rewrite_templates: {
      sv: [
        "Förbättrade {decision_purpose} genom {method_tool} i samarbete med {stakeholders}. {outcome_metric}",
        "Drev {decision_purpose} via {method_tool} över {scope}. {outcome_metric}",
        "Implementerade {decision_purpose} genom {method_tool}. {outcome_metric}",
      ],
      en: [
        "Improved {decision_purpose} by {method_tool} in collaboration with {stakeholders}. {outcome_metric}",
        "Drove {decision_purpose} via {method_tool} across {scope}. {outcome_metric}",
        "Implemented {decision_purpose} through {method_tool}. {outcome_metric}",
      ],
    },
  },
  {
    id: "crm_migration",
    label: { sv: "CRM / Systemmigration & implementation", en: "CRM / System migration & implementation" },
    keywords: ["migration", "crm", "salesforce", "implementation", "go-live", "data", "system", "hubspot", "dynamics", "erp", "cutover"],
    questions: {
      sv: [
        "Vad migrerade ni från → till?",
        "Vilken del ägde du (data/process/go-live/change)?",
        "Vilka team/stakeholders var involverade?",
        "Vad förbättrades (kvalitet/ledtid/automation)?",
      ],
      en: [
        "What did you migrate from → to?",
        "What part did you own (data/process/go-live/change)?",
        "Which teams/stakeholders were involved?",
        "What improved (quality/lead time/automation)?",
      ],
    },
    allowed_verbs: {
      sv: ["Ledde", "Genomförde", "Migrerade", "Koordinerade", "Säkerställde", "Möjliggjorde"],
      en: ["Led", "Executed", "Migrated", "Coordinated", "Ensured", "Enabled"],
    },
    recommended_metrics: ["lead time", "data quality", "adoption rate", "error rate"],
    rewrite_templates: {
      sv: [
        "Ledde {decision_purpose} genom {method_tool} med {stakeholders}. {outcome_metric}",
        "Möjliggjorde {decision_purpose} genom att koordinera {method_tool} över {scope}. {outcome_metric}",
        "Genomförde {decision_purpose} via {method_tool}. {outcome_metric}",
      ],
      en: [
        "Led {decision_purpose} by {method_tool} with {stakeholders}. {outcome_metric}",
        "Enabled {decision_purpose} by coordinating {method_tool} across {scope}. {outcome_metric}",
        "Executed {decision_purpose} via {method_tool}. {outcome_metric}",
      ],
    },
  },
  {
    id: "ops_improvement",
    label: { sv: "Ops / Processförbättring", en: "Ops / Process improvement" },
    keywords: ["process", "workflow", "efficiency", "standardize", "automation", "lean", "sop", "effektivisera", "automatisera", "standardisera"],
    questions: {
      sv: [
        "Vilken process förbättrades?",
        "Vilken åtgärd gjorde du (standardiserade/automatiserade/införde regler)?",
        "Vilken effekt såg ni (tid/kostnad/felgrad)?",
        "I vilken skala (team/region/volym)?",
      ],
      en: [
        "Which process was improved?",
        "What action did you take (standardized/automated/implemented rules)?",
        "What was the effect (time/cost/error rate)?",
        "At what scale (team/region/volume)?",
      ],
    },
    allowed_verbs: {
      sv: ["Effektiviserade", "Automatiserade", "Standardiserade", "Reducerade", "Förbättrade", "Införde"],
      en: ["Streamlined", "Automated", "Standardized", "Reduced", "Improved", "Introduced"],
    },
    recommended_metrics: ["time saved", "cost reduction", "error rate", "throughput"],
    rewrite_templates: {
      sv: [
        "Effektiviserade {decision_purpose} genom {method_tool} i {scope}. {outcome_metric}",
        "Reducerade {decision_purpose} genom att {method_tool} för {stakeholders}. {outcome_metric}",
        "Förbättrade {decision_purpose} via {method_tool}. {outcome_metric}",
      ],
      en: [
        "Streamlined {decision_purpose} by {method_tool} across {scope}. {outcome_metric}",
        "Reduced {decision_purpose} by {method_tool} for {stakeholders}. {outcome_metric}",
        "Improved {decision_purpose} via {method_tool}. {outcome_metric}",
      ],
    },
  },
  {
    id: "analytics_forecasting",
    label: { sv: "Analys / Prognos & finansiell planering", en: "Analytics / Forecasting & financial planning" },
    keywords: ["forecast", "prognos", "budget", "planning", "financial model", "cohort", "unit economics", "analys", "sql", "bi", "tableau", "power bi"],
    questions: {
      sv: [
        "Vilken typ av analys (forecast, budget, planning, cohort, unit economics)?",
        "Vilka inputs/datakällor/verktyg (SQL/Excel/BI/SF)?",
        "Vad användes det till (beslut/prioritering/rapportering)?",
        "Vilken förbättring (precision, snabbare beslut)?",
      ],
      en: [
        "What type of analysis (forecast, budget, planning, cohort, unit economics)?",
        "What inputs/data sources/tools (SQL/Excel/BI/SF)?",
        "What was it used for (decision/prioritization/reporting)?",
        "What improvement (accuracy, faster decisions)?",
      ],
    },
    allowed_verbs: {
      sv: ["Förbättrade", "Byggde", "Utvecklade", "Möjliggjorde", "Automatiserade", "Levererade"],
      en: ["Improved", "Built", "Developed", "Enabled", "Automated", "Delivered"],
    },
    recommended_metrics: ["forecast accuracy", "time-to-insight", "decision speed"],
    rewrite_templates: {
      sv: [
        "Förbättrade {decision_purpose} genom {method_tool} för {stakeholders}. {outcome_metric}",
        "Möjliggjorde {decision_purpose} genom att bygga {method_tool} baserat på {scope}. {outcome_metric}",
        "Automatiserade {decision_purpose} via {method_tool}. {outcome_metric}",
      ],
      en: [
        "Improved {decision_purpose} by {method_tool} for {stakeholders}. {outcome_metric}",
        "Enabled {decision_purpose} by building {method_tool} based on {scope}. {outcome_metric}",
        "Automated {decision_purpose} via {method_tool}. {outcome_metric}",
      ],
    },
  },
  {
    id: "product_delivery",
    label: { sv: "Produkt / Leverans", en: "Product / Delivery" },
    keywords: ["launch", "rollout", "adoption", "requirements", "roadmap", "feature", "product", "backlog", "sprint", "agile", "release"],
    questions: {
      sv: [
        "Vad levererade du (feature, process, rollout)?",
        "Vad var målet (adoption, retention, efficiency)?",
        "Hur drev du det (workshops, requirements, backlog)?",
        "Vem var målgruppen (customers, ops, sales)?",
      ],
      en: [
        "What did you deliver (feature, process, rollout)?",
        "What was the goal (adoption, retention, efficiency)?",
        "How did you drive it (workshops, requirements, backlog)?",
        "Who was the target audience (customers, ops, sales)?",
      ],
    },
    allowed_verbs: {
      sv: ["Lanserade", "Levererade", "Drev", "Ökade", "Möjliggjorde", "Koordinerade"],
      en: ["Launched", "Delivered", "Drove", "Increased", "Enabled", "Coordinated"],
    },
    recommended_metrics: ["adoption rate", "retention", "NPS", "time-to-market"],
    rewrite_templates: {
      sv: [
        "Lanserade {decision_purpose} genom {method_tool} för {stakeholders}. {outcome_metric}",
        "Drev {decision_purpose} via {method_tool} i {scope}. {outcome_metric}",
        "Levererade {decision_purpose} genom {method_tool}. {outcome_metric}",
      ],
      en: [
        "Launched {decision_purpose} by {method_tool} for {stakeholders}. {outcome_metric}",
        "Drove {decision_purpose} via {method_tool} across {scope}. {outcome_metric}",
        "Delivered {decision_purpose} through {method_tool}. {outcome_metric}",
      ],
    },
  },
  {
    id: "partnerships",
    label: { sv: "Partnerskap / Affärsutveckling", en: "Partnerships / Business development" },
    keywords: ["partner", "deal", "negotiation", "collaboration", "co-marketing", "channel", "alliance", "integration", "förhandl", "samarbete"],
    questions: {
      sv: [
        "Vad var partner-upplägget (kanal, co-marketing, integration)?",
        "Vad var din roll (förhandla, strukturera, analysera)?",
        "Vad var målet/utfallet (leads, revenue, cost)?",
        "Vilka interna stakeholders (legal, finance, ops)?",
      ],
      en: [
        "What was the partnership setup (channel, co-marketing, integration)?",
        "What was your role (negotiate, structure, analyze)?",
        "What was the goal/outcome (leads, revenue, cost)?",
        "Which internal stakeholders (legal, finance, ops)?",
      ],
    },
    allowed_verbs: {
      sv: ["Förhandlade", "Strukturerade", "Etablerade", "Drev", "Säkrade", "Möjliggjorde"],
      en: ["Negotiated", "Structured", "Established", "Drove", "Secured", "Enabled"],
    },
    recommended_metrics: ["revenue", "leads", "cost savings", "deal value"],
    rewrite_templates: {
      sv: [
        "Etablerade {decision_purpose} genom {method_tool} med {stakeholders}. {outcome_metric}",
        "Drev {decision_purpose} genom att {method_tool} över {scope}. {outcome_metric}",
        "Förhandlade {decision_purpose} via {method_tool}. {outcome_metric}",
      ],
      en: [
        "Established {decision_purpose} by {method_tool} with {stakeholders}. {outcome_metric}",
        "Drove {decision_purpose} by {method_tool} across {scope}. {outcome_metric}",
        "Negotiated {decision_purpose} via {method_tool}. {outcome_metric}",
      ],
    },
  },
  {
    id: "other",
    label: { sv: "Övrigt", en: "Other" },
    keywords: [],
    questions: {
      sv: [
        "Vad var syftet (vad skulle möjliggöras)?",
        "Vad gjorde du konkret?",
        "Hur gjorde du det?",
        "Fanns effekt?",
      ],
      en: [
        "What was the purpose (what was enabled)?",
        "What did you do specifically?",
        "How did you do it?",
        "Was there an effect?",
      ],
    },
    allowed_verbs: {
      sv: ["Möjliggjorde", "Bidrog till", "Genomförde", "Drev", "Utvecklade", "Levererade"],
      en: ["Enabled", "Contributed to", "Executed", "Drove", "Developed", "Delivered"],
    },
    recommended_metrics: [],
    rewrite_templates: {
      sv: [
        "Möjliggjorde {decision_purpose} genom {method_tool}. {outcome_metric}",
        "Bidrog till {decision_purpose} genom att {method_tool} för {stakeholders}. {outcome_metric}",
        "Genomförde {decision_purpose} via {method_tool}. {outcome_metric}",
      ],
      en: [
        "Enabled {decision_purpose} by {method_tool}. {outcome_metric}",
        "Contributed to {decision_purpose} by {method_tool} for {stakeholders}. {outcome_metric}",
        "Executed {decision_purpose} via {method_tool}. {outcome_metric}",
      ],
    },
  },
];

export function getProfile(id: ProfileId): QuickProfile {
  return PROFILES.find((p) => p.id === id) || PROFILES[PROFILES.length - 1];
}
