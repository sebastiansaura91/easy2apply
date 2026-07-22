import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Check, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CVContent } from "@/types/cv";
import { roleLabel } from "@/lib/role-advice";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cv: CVContent;
  cvLanguage: "sv" | "en";
  onApply: (summary: string) => void;
}

/** Common executive value-proposition themes recruiters recognise (bilingual). */
const STRENGTH_PRESETS: { en: string; sv: string }[] = [
  { en: "Commercial growth", sv: "Kommersiell tillväxt" },
  { en: "P&L ownership", sv: "P&L-ansvar" },
  { en: "Product-led transformation", sv: "Produktledd transformation" },
  { en: "Go-to-market", sv: "Go-to-market" },
  { en: "Turnaround", sv: "Turnaround" },
  { en: "Team building & leadership", sv: "Teambyggande & ledarskap" },
  { en: "Operational efficiency", sv: "Operationell effektivitet" },
  { en: "M&A / integration", sv: "M&A / integration" },
  { en: "Data-driven decisions", sv: "Datadrivna beslut" },
  { en: "Customer / CX", sv: "Kund / CX" },
];

/**
 * "Summary kit" — a short positioning questionnaire. Instead of summarising the CV,
 * it captures what the user wants to highlight and how they want to be positioned, then
 * generates a positioning-driven professional summary (grounded in real facts).
 */
export function SummaryKitDialog({ open, onOpenChange, cv, cvLanguage, onApply }: Props) {
  const isSv = cvLanguage === "sv";
  const { toast } = useToast();

  const [targetRole, setTargetRole] = useState(
    cv.__meta?.targetRoleLabel || (cv.__meta?.targetRole ? roleLabel(cv.__meta.targetRole, null, cvLanguage) : "")
  );
  const [specialism, setSpecialism] = useState("");
  const [strengths, setStrengths] = useState<string[]>([]);
  const [signatureAchievement, setSignatureAchievement] = useState("");
  const [industry, setIndustry] = useState("");
  const [deemphasize, setDeemphasize] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  const toggleStrength = (label: string) =>
    setStrengths((prev) => prev.includes(label) ? prev.filter((s) => s !== label) : (prev.length >= 3 ? prev : [...prev, label]));

  const generate = async () => {
    setLoading(true);
    try {
      const positioning = {
        targetRole: targetRole.trim() || undefined,
        specialism: specialism.trim() || undefined,
        strengths,
        signatureAchievement: signatureAchievement.trim() || undefined,
        industry: industry.trim() || undefined,
        deemphasize: deemphasize.trim() || undefined,
      };
      const { data, error } = await supabase.functions.invoke("draft-summary", {
        body: { resume_content_json: cv, system_language: isSv ? "sv" : "en", positioning },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const summary = (data as any)?.summary;
      if (!summary) throw new Error(isSv ? "Inget utkast returnerades" : "No draft returned");
      setDraft(summary);
    } catch (e: any) {
      toast({ title: isSv ? "Kunde inte skapa utkast" : "Couldn't generate", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    if (draft) onApply(draft);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {isSv ? "Positionera & skriv sammanfattning" : "Position & write summary"}
          </DialogTitle>
          <DialogDescription>
            {isSv
              ? "Svara kort på vad du vill lyfta fram och hur du vill positionera dig. Vi skriver en sammanfattning som säljer ditt värde — inte bara summerar CV:t. Inga siffror hittas på."
              : "Answer briefly on what you want to highlight and how you want to position yourself. We write a summary that sells your value — not just a recap of the CV. No numbers are invented."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{isSv ? "Vilken roll positionerar du dig för?" : "What role are you positioning for?"}</label>
            <Input value={targetRole} onChange={(e) => setTargetRole(e.target.value)} placeholder={isSv ? "t.ex. Head of Commercial" : "e.g. Head of Commercial"} />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{isSv ? "Vad är du känd för? (en mening)" : "What are you known for? (one line)"}</label>
            <Input value={specialism} onChange={(e) => setSpecialism(e.target.value)} placeholder={isSv ? "t.ex. att skala B2C-affärer genom prissättning och produkt" : "e.g. scaling B2C businesses through pricing and product"} />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{isSv ? "Led med dina 2–3 starkaste sidor" : "Lead with your top 2–3 strengths"}</label>
            <div className="flex flex-wrap gap-1.5">
              {STRENGTH_PRESETS.map((s) => {
                const label = isSv ? s.sv : s.en;
                const active = strengths.includes(label);
                return (
                  <Badge
                    key={s.en}
                    variant={active ? "default" : "outline"}
                    className="cursor-pointer text-[11px] py-1"
                    onClick={() => toggleStrength(label)}
                  >
                    {active && <Check className="h-3 w-3 mr-1" />}{label}
                  </Badge>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground">{isSv ? `${strengths.length}/3 valda` : `${strengths.length}/3 selected`}</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{isSv ? "En signaturprestation att lyfta (använd riktiga siffror)" : "One signature achievement to feature (use real numbers)"}</label>
            <Textarea rows={2} value={signatureAchievement} onChange={(e) => setSignatureAchievement(e.target.value)} placeholder={isSv ? "t.ex. ökade ARPU 12% och minskade churn 5% på 18 mån" : "e.g. grew ARPU 12% and cut churn 5% in 18 months"} className="text-sm" />
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{isSv ? "Målbransch / nyckelord (valfritt)" : "Target industry / keywords (optional)"}</label>
              <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder={isSv ? "t.ex. SaaS, abonnemang, marknadsplatser" : "e.g. SaaS, subscriptions, marketplaces"} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{isSv ? "Tona ner (valfritt)" : "De-emphasize (optional)"}</label>
              <Input value={deemphasize} onChange={(e) => setDeemphasize(e.target.value)} placeholder={isSv ? "t.ex. tidig teknisk roll" : "e.g. early technical role"} />
            </div>
          </div>

          {draft !== null && (
            <div className="space-y-1.5 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-primary">{isSv ? "Utkast" : "Draft"}</label>
              <Textarea rows={5} value={draft} onChange={(e) => setDraft(e.target.value)} className="text-sm bg-background" />
              <p className="text-[10px] text-muted-foreground">{isSv ? "Redigera fritt innan du använder det." : "Edit freely before using it."}</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {isSv ? "Avbryt" : "Cancel"}
          </Button>
          {draft === null ? (
            <Button onClick={generate} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
              {isSv ? "Skapa sammanfattning" : "Generate summary"}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={generate} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                {isSv ? "Gör om" : "Regenerate"}
              </Button>
              <Button onClick={apply} disabled={loading}>
                <Check className="h-4 w-4 mr-1" />{isSv ? "Använd" : "Use this"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
