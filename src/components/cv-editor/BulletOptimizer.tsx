import { useState } from "react";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  Zap,
  Sparkles,
  MessageCircle,
} from "lucide-react";
import { CVContent } from "@/types/cv";
import { BulletOptimizerResult, BulletAnalysis, BulletSuggestion } from "@/types/bullet-optimizer";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { BulletCoachChat } from "./BulletCoachChat";

/* ── Helpers ── */

function riskBadge(level: string, lang: "sv" | "en") {
  const labels = { high: lang === "sv" ? "Hög risk" : "High risk", medium: lang === "sv" ? "Medel" : "Medium", low: lang === "sv" ? "Låg" : "Low" };
  switch (level) {
    case "high": return <Badge variant="destructive" className="text-[9px] h-4">{labels.high}</Badge>;
    case "medium": return <Badge variant="outline" className="text-[9px] h-4 border-yellow-500 text-yellow-600">{labels.medium}</Badge>;
    case "low": return <Badge variant="secondary" className="text-[9px] h-4">{labels.low}</Badge>;
    default: return null;
  }
}

function scoreBadge(score: number) {
  const color = score >= 8 ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
    : score >= 5 ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
    : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${color}`}>{score}/10</span>;
}

function suggestionTypeLabel(type: string, lang: "sv" | "en"): string {
  const labels: Record<string, Record<string, string>> = {
    stronger_verb_start: { sv: "Starkare verb", en: "Stronger verb" },
    add_how: { sv: "Lägg till metod", en: "Add method" },
    add_outcome: { sv: "Lägg till utfall", en: "Add outcome" },
    split: { sv: "Dela upp", en: "Split bullet" },
    keyword_alignment: { sv: "Nyckelord", en: "Keyword" },
    language_fix: { sv: "Språkfix", en: "Language fix" },
  };
  return labels[type]?.[lang] || type;
}

/* ── Bullet Row ── */

function BulletRow({
  bullet,
  lang,
  onApply,
  onCoach,
}: {
  bullet: BulletAnalysis;
  lang: "sv" | "en";
  onApply: (bulletId: string, newText: string) => void;
  onCoach: (bulletId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const idParts = bullet.id.match(/^(\w+)\[(\d+)\]\.bullets\[(\d+)\]$/);
  const sectionLabel = idParts ? `${idParts[1]}[${idParts[2]}]` : bullet.id;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full text-left p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors">
          <div className="flex items-center gap-2">
            {open ? <ChevronDown className="h-3 w-3 flex-shrink-0" /> : <ChevronRight className="h-3 w-3 flex-shrink-0" />}
            {scoreBadge(bullet.bullet_score)}
            {riskBadge(bullet.ats_risk_level, lang)}
            <span className="text-[10px] text-muted-foreground flex-shrink-0">{sectionLabel}</span>
          </div>
          <p className="text-xs mt-1.5 line-clamp-2 text-foreground">{bullet.original}</p>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-3 pr-1 pb-2 space-y-2 mt-1">
        {bullet.issues.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {bullet.issues.slice(0, 3).map((issue, i) => (
              <Badge key={i} variant="outline" className="text-[9px] h-4 border-destructive/40 text-destructive">
                {issue}
              </Badge>
            ))}
          </div>
        )}

        {bullet.suggestions.map((suggestion, i) => (
          <SuggestionCard key={i} suggestion={suggestion} lang={lang} onApply={() => onApply(bullet.id, suggestion.suggested_rewrite)} />
        ))}

        {/* Coach chat button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5 text-[10px] h-7 mt-1"
          onClick={() => onCoach(bullet.id)}
        >
          <MessageCircle className="h-3 w-3" />
          {lang === "en" ? "Chat to clarify" : "Chatta för att förtydliga"}
        </Button>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ── Suggestion Card ── */

function SuggestionCard({ suggestion, lang, onApply }: { suggestion: BulletSuggestion; lang: "sv" | "en"; onApply: () => void }) {
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-2.5 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[9px] h-4">{suggestionTypeLabel(suggestion.type, lang)}</Badge>
            <span className="text-[9px] text-green-600 dark:text-green-400 font-medium">
              {suggestion.estimated_gain.ats_score}
            </span>
          </div>
          <Button size="sm" variant="default" className="h-5 text-[10px] px-2" onClick={onApply}>
            Apply
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">{suggestion.why}</p>
        <div className="rounded bg-background border border-border p-2">
          <p className="text-xs italic text-foreground">{suggestion.suggested_rewrite}</p>
        </div>
        {suggestion.needs_user_input.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[9px] text-muted-foreground">{lang === "sv" ? "Fyll i:" : "Fill in:"}</span>
            {suggestion.needs_user_input.map((item, i) => (
              <Badge key={i} variant="secondary" className="text-[9px] h-4">{item}</Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Main Component ── */

interface BulletOptimizerProps {
  cv: CVContent;
  cvLanguage: "sv" | "en";
  jobPostingText?: string;
  onApplyBullet: (bulletPath: string, newText: string) => void;
}

export function BulletOptimizerPanel({ cv, cvLanguage, jobPostingText, onApplyBullet }: BulletOptimizerProps) {
  const [result, setResult] = useState<BulletOptimizerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [coachBulletId, setCoachBulletId] = useState<string | null>(null);
  const { toast } = useToast();

  // Find bullet info for coach
  const coachBullet = coachBulletId ? findBulletInfo(cv, coachBulletId) : null;

  const runOptimize = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("optimize-bullets", {
        body: {
          resume_content_json: cv,
          job_posting_text: jobPostingText?.trim() || undefined,
          system_language: cvLanguage,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data as BulletOptimizerResult);
    } catch (err: any) {
      toast({
        title: cvLanguage === "en" ? "Bullet optimization failed" : "Bullet-optimering misslyckades",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApply = (bulletId: string, newText: string) => {
    onApplyBullet(bulletId, newText);
    if (result) {
      setResult({
        ...result,
        bullets: result.bullets.map((b) =>
          b.id === bulletId ? { ...b, original: newText, suggestions: b.suggestions.filter((s) => s.suggested_rewrite !== newText) } : b
        ),
      });
    }
    toast({
      title: cvLanguage === "en" ? "Bullet updated" : "Punkt uppdaterad",
      description: cvLanguage === "en" ? "The bullet has been applied to your CV." : "Punkten har uppdaterats i ditt CV.",
    });
  };

  if (!result) {
    return (
      <Button onClick={runOptimize} disabled={loading} variant="outline" size="sm" className="w-full gap-1.5 mt-2">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {loading
          ? (cvLanguage === "en" ? "Analyzing all bullets..." : "Analyserar alla punkter...")
          : (cvLanguage === "en" ? "Optimize All Bullets" : "Optimera alla punkter")}
      </Button>
    );
  }

  const experienceBullets = result.bullets.filter((b) => b.id.startsWith("experience"));
  const projectBullets = result.bullets.filter((b) => b.id.startsWith("projects"));

  const roleGroups: Record<string, BulletAnalysis[]> = {};
  for (const b of experienceBullets) {
    const match = b.id.match(/^experience\[(\d+)\]/);
    const key = match ? match[1] : "?";
    if (!roleGroups[key]) roleGroups[key] = [];
    roleGroups[key].push(b);
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between rounded-lg bg-primary/10 p-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">
            {cvLanguage === "en" ? "Potential ATS gain" : "Potentiell ATS-förbättring"}
          </span>
        </div>
        <Badge variant="default" className="text-xs">{result.overall_potential_gain}</Badge>
      </div>

      {/* Experience bullets grouped by role */}
      {Object.entries(roleGroups).map(([roleIdx, bullets]) => {
        const exp = cv.experience[parseInt(roleIdx)];
        const roleLabel = exp ? `${exp.title}${exp.company ? ` – ${exp.company}` : ""}` : `Role ${roleIdx}`;
        return (
          <div key={roleIdx} className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{roleLabel}</p>
            {bullets.map((bullet) => (
              <BulletRow
                key={bullet.id}
                bullet={bullet}
                lang={cvLanguage}
                onApply={handleApply}
                onCoach={setCoachBulletId}
              />
            ))}
          </div>
        );
      })}

      {/* Project bullets */}
      {projectBullets.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            {cvLanguage === "en" ? "Projects" : "Projekt"}
          </p>
          {projectBullets.map((bullet) => (
            <BulletRow
              key={bullet.id}
              bullet={bullet}
              lang={cvLanguage}
              onApply={handleApply}
              onCoach={setCoachBulletId}
            />
          ))}
        </div>
      )}

      {/* Re-run */}
      <Button onClick={runOptimize} disabled={loading} variant="outline" size="sm" className="w-full gap-1.5">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {loading
          ? (cvLanguage === "en" ? "Re-analyzing..." : "Analyserar om...")
          : (cvLanguage === "en" ? "Re-analyze All Bullets" : "Analysera om alla punkter")}
      </Button>

      {/* Coach Chat Sheet */}
      {coachBullet && (
        <BulletCoachChat
          open={!!coachBulletId}
          onClose={() => setCoachBulletId(null)}
          bulletId={coachBulletId!}
          bulletText={coachBullet.text}
          roleTitle={coachBullet.roleTitle}
          company={coachBullet.company}
          surroundingBullets={coachBullet.surroundingBullets}
          jobPostingText={jobPostingText}
          cvLanguage={cvLanguage}
          onApply={handleApply}
        />
      )}
    </div>
  );
}

/* ── Find bullet info from CV ── */
function findBulletInfo(cv: CVContent, bulletId: string) {
  const match = bulletId.match(/^(\w+)\[(\d+)\]\.bullets\[(\d+)\]$/);
  if (!match) return null;

  const [, section, sectionIdxStr, bulletIdxStr] = match;
  const si = parseInt(sectionIdxStr);
  const bi = parseInt(bulletIdxStr);

  if (section === "experience") {
    const exp = cv.experience[si];
    if (!exp?.bullets?.[bi]) return null;
    return {
      text: exp.bullets[bi],
      roleTitle: exp.title,
      company: exp.company,
      surroundingBullets: exp.bullets.filter((_, i) => i !== bi),
    };
  }
  if (section === "projects") {
    const proj = cv.projects[si];
    if (!proj?.bullets?.[bi]) return null;
    return {
      text: proj.bullets[bi],
      roleTitle: proj.name,
      company: undefined,
      surroundingBullets: proj.bullets.filter((_, i) => i !== bi),
    };
  }
  return null;
}
