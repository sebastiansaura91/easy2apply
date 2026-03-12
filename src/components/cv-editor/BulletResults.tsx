import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Check, RefreshCw, Loader2, ArrowDownRight, Target,
  Zap, RotateCcw, Hash, Search, Eye, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  BulletGeneratorResult,
  GeneratedBullet,
  RefinementAction,
} from "@/types/bullet-generator";

interface BulletResultsProps {
  result: BulletGeneratorResult;
  context: { jobTitle: string; company: string };
  onAccept: (bullets: string[]) => void;
  onRegenerate: () => void;
}

const REFINEMENT_ACTIONS: { action: RefinementAction; label: string; icon: React.ReactNode }[] = [
  { action: "shorter", label: "Kortare", icon: <ArrowDownRight className="h-3 w-3" /> },
  { action: "concrete", label: "Mer konkret", icon: <Target className="h-3 w-3" /> },
  { action: "impact", label: "Mer impact", icon: <Zap className="h-3 w-3" /> },
  { action: "verb", label: "Byt verb", icon: <RotateCcw className="h-3 w-3" /> },
  { action: "metrics", label: "Mätetal", icon: <Hash className="h-3 w-3" /> },
  { action: "ats", label: "ATS-keywords", icon: <Search className="h-3 w-3" /> },
];

function computeSkarpaScore(bullets: GeneratedBullet[]): number {
  if (bullets.length === 0) return 0;
  let score = 0;
  const strongVerbs = ["byggde", "drev", "införde", "automatiserade", "standardiserade", "analyserade",
    "förhandlade", "lanserade", "migrerade", "förbättrade", "säkrade", "optimerade", "etablerade",
    "samordnade", "formade", "skalade", "ledde", "implementerade", "utvecklade"];
  const floskler = ["resultatorienterad", "driven", "passionerad", "team player", "hög nivå",
    "strategisk", "innovativ", "ansvarade för", "hands-on", "proaktiv", "engagerad"];

  for (const b of bullets) {
    const text = b.bullet.toLowerCase();
    // Strong verb start: +15
    if (strongVerbs.some((v) => text.startsWith(v))) score += 15;
    else score += 5;
    // Has concrete detail (numbers or [FYLL I]): +10
    if (/\d+|fyll i/i.test(b.bullet)) score += 10;
    else score += 3;
    // No floskler: +10
    if (!floskler.some((f) => text.includes(f))) score += 10;
    else score += 2;
    // Short (< 150 chars): +5
    if (b.bullet.length < 150) score += 5;
    // High confidence: +5
    if (b.confidence === "high") score += 5;
    else if (b.confidence === "medium") score += 3;
  }
  return Math.min(100, Math.round((score / (bullets.length * 45)) * 100));
}

export function BulletResults({ result, context, onAccept, onRegenerate }: BulletResultsProps) {
  const [selectedBullets, setSelectedBullets] = useState<Set<string>>(new Set());
  const [localBullets, setLocalBullets] = useState<GeneratedBullet[]>(result.bullets);
  const [refiningIdx, setRefiningIdx] = useState<number | null>(null);
  const [showRecruiterView, setShowRecruiterView] = useState(false);
  const { toast } = useToast();

  const toggleSelect = (bullet: string) => {
    const next = new Set(selectedBullets);
    if (next.has(bullet)) next.delete(bullet);
    else next.add(bullet);
    setSelectedBullets(next);
  };

  const refineBullet = async (idx: number, action: RefinementAction) => {
    setRefiningIdx(idx);
    try {
      const { data, error } = await supabase.functions.invoke("refine-bullet", {
        body: { bullet: localBullets[idx].bullet, action, context },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.improved) {
        const updated = [...localBullets];
        updated[idx] = { ...updated[idx], bullet: data.improved };
        setLocalBullets(updated);
      }
    } catch (err: any) {
      toast({ title: "Fel vid förfining", description: err.message, variant: "destructive" });
    } finally {
      setRefiningIdx(null);
    }
  };

  const basB = localBullets.filter((b) => b.level === "bas");
  const sharpB = localBullets.filter((b) => b.level === "skarpt");
  const maxB = localBullets.filter((b) => b.level === "max");
  const skarpaScore = computeSkarpaScore(localBullets);

  const renderBulletCard = (bullet: GeneratedBullet, globalIdx: number) => {
    const isSelected = selectedBullets.has(bullet.bullet);
    const isRefining = refiningIdx === globalIdx;
    const needsInput = bullet.needs_user_input.length > 0;

    return (
      <Card key={globalIdx} className={`transition-all ${isSelected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "hover:border-muted-foreground/30"}`}>
        <CardContent className="p-3 space-y-2">
          <div className="flex gap-2 items-start">
            <button
              onClick={() => toggleSelect(bullet.bullet)}
              className={`mt-0.5 flex-shrink-0 h-5 w-5 rounded border flex items-center justify-center transition-colors ${isSelected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30 hover:border-primary"}`}
            >
              {isSelected && <Check className="h-3 w-3" />}
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm leading-relaxed">{bullet.bullet}</p>
              {showRecruiterView && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {bullet.tags.map((tag, i) => (
                    <Badge key={i} variant="outline" className="text-[10px] h-5">{tag}</Badge>
                  ))}
                  {needsInput && (
                    <Badge variant="secondary" className="text-[10px] h-5 gap-0.5 text-amber-600">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      Saknar mätetal
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className={`text-[10px] h-5 ${bullet.confidence === "high" ? "text-green-600 border-green-200" : bullet.confidence === "medium" ? "text-amber-600 border-amber-200" : "text-red-600 border-red-200"}`}
                  >
                    {bullet.confidence}
                  </Badge>
                </div>
              )}
            </div>
          </div>
          {/* Refinement actions */}
          <div className="flex flex-wrap gap-1 pl-7">
            {REFINEMENT_ACTIONS.map(({ action, label, icon }) => (
              <Tooltip key={action}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground"
                    onClick={() => refineBullet(globalIdx, action)}
                    disabled={isRefining}
                  >
                    {isRefining ? <Loader2 className="h-3 w-3 animate-spin" /> : icon}
                    <span className="ml-1">{label}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom"><p className="text-xs">{label}</p></TooltipContent>
              </Tooltip>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      {/* Recruiter view toggle + skärpa score */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant={showRecruiterView ? "default" : "outline"}
            size="sm"
            onClick={() => setShowRecruiterView(!showRecruiterView)}
          >
            <Eye className="h-3.5 w-3.5 mr-1" />
            Recruiter view
          </Button>
          {showRecruiterView && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Skärpa-score:</span>
              <Badge variant={skarpaScore >= 70 ? "default" : "secondary"} className="gap-1">
                {skarpaScore >= 70 ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                {skarpaScore}/100
              </Badge>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRegenerate}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Regenerera
          </Button>
        </div>
      </div>

      {/* Follow-up questions */}
      {result.follow_up_questions.length > 0 && (
        <Card className="border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-3">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">💡 Frågor som kan stärka dina bullets:</p>
            <ul className="space-y-0.5">
              {result.follow_up_questions.map((q, i) => (
                <li key={i} className="text-xs text-amber-600 dark:text-amber-300">• {q}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Blocked phrases */}
      {result.blocked_phrases_detected.length > 0 && (
        <Card className="border-dashed border-red-300 bg-red-50/50 dark:bg-red-950/20">
          <CardContent className="p-3">
            <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">⚠️ Floskler som filtrerats bort:</p>
            <div className="flex flex-wrap gap-1">
              {result.blocked_phrases_detected.map((p, i) => (
                <Badge key={i} variant="outline" className="text-[10px] text-red-600 border-red-200">{p}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs per level */}
      <Tabs defaultValue="skarpt" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="bas" className="flex-1">
            Bas ({basB.length})
          </TabsTrigger>
          <TabsTrigger value="skarpt" className="flex-1">
            Skärpt ({sharpB.length})
          </TabsTrigger>
          <TabsTrigger value="max" className="flex-1">
            Max impact ({maxB.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bas" className="space-y-2 mt-3">
          <p className="text-xs text-muted-foreground">ATS-safe, standard och professionellt.</p>
          {basB.map((b) => renderBulletCard(b, localBullets.indexOf(b)))}
        </TabsContent>
        <TabsContent value="skarpt" className="space-y-2 mt-3">
          <p className="text-xs text-muted-foreground">Mer konverterande men fortfarande sakligt.</p>
          {sharpB.map((b) => renderBulletCard(b, localBullets.indexOf(b)))}
        </TabsContent>
        <TabsContent value="max" className="space-y-2 mt-3">
          <p className="text-xs text-muted-foreground">Maximal impact – sticker ut men aldrig hallucinerande.</p>
          {maxB.map((b) => renderBulletCard(b, localBullets.indexOf(b)))}
        </TabsContent>
      </Tabs>

      {/* Accept selected */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <p className="text-sm text-muted-foreground">
          {selectedBullets.size} bullet{selectedBullets.size !== 1 ? "s" : ""} valda
        </p>
        <Button
          onClick={() => onAccept(Array.from(selectedBullets))}
          disabled={selectedBullets.size === 0}
        >
          <Check className="h-4 w-4 mr-1" />
          Använd valda bullets
        </Button>
      </div>
    </div>
  );
}
