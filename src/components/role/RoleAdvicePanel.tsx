import { Badge } from "@/components/ui/badge";
import { Target, ArrowUpRight, ArrowDownRight, Hash, BarChart3 } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";
import { getRoleAdvice } from "@/lib/role-advice";

/**
 * Renders the role-specific advice for a target role: what to emphasise, what to play
 * down, the ATS keywords the role screens for, and the metrics recruiters expect. Purely
 * presentational — it reads the curated advice for the current UI language.
 */
export function RoleAdvicePanel({ roleId }: { roleId?: string | null }) {
  const { language } = useLanguage();
  const advice = getRoleAdvice(roleId);
  if (!advice) return null;

  const isSv = language === "sv";
  const L = {
    emphasize: isSv ? "Lyft fram" : "Emphasize",
    deemphasize: isSv ? "Tona ner" : "De-emphasize",
    keywords: isSv ? "ATS-nyckelord" : "ATS keywords",
    metrics: isSv ? "Mätetal att kvantifiera" : "Metrics to quantify",
  };

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/15 p-3">
        <Target className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
        <p className="leading-relaxed">{advice.focus[language]}</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-1.5 mb-1.5 text-green-600">
            <ArrowUpRight className="h-3.5 w-3.5" />
            <p className="text-xs font-semibold uppercase tracking-wide">{L.emphasize}</p>
          </div>
          <ul className="space-y-1 text-muted-foreground">
            {advice.emphasize[language].map((x, i) => (
              <li key={i} className="leading-snug">• {x}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-1.5 text-amber-600">
            <ArrowDownRight className="h-3.5 w-3.5" />
            <p className="text-xs font-semibold uppercase tracking-wide">{L.deemphasize}</p>
          </div>
          <ul className="space-y-1 text-muted-foreground">
            {advice.deemphasize[language].map((x, i) => (
              <li key={i} className="leading-snug">• {x}</li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{L.metrics}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {advice.metrics[language].map((m, i) => (
            <Badge key={i} variant="secondary" className="text-[11px] font-normal">{m}</Badge>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <Hash className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{L.keywords}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {advice.keywords.map((k, i) => (
            <Badge key={i} variant="outline" className="text-[11px] font-normal">{k}</Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
