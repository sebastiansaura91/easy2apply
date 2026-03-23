import { useState, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, Loader2, Sparkles, Check, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ExplainWizardProps {
  open: boolean;
  onClose: () => void;
  jobTitle: string;
  company: string;
  language?: "sv" | "en";
  onAcceptBullets: (bullets: string[]) => void;
}

const WORK_AREAS_SV = [
  { id: "strategy", label: "Strategi & affärsutveckling" },
  { id: "pricing", label: "Prissättning / Kommersiellt" },
  { id: "operations", label: "Operations / Processförbättring" },
  { id: "crm", label: "CRM / System" },
  { id: "analytics", label: "Analys / Data" },
  { id: "leadership", label: "Ledarskap / Samarbete" },
  { id: "sales", label: "Försäljning / Kundhantering" },
  { id: "marketing", label: "Marknadsföring / Kommunikation" },
  { id: "finance", label: "Ekonomi / Budget" },
  { id: "project", label: "Projektledning" },
  { id: "tech", label: "Teknik / IT" },
  { id: "hr", label: "HR / Organisationsutveckling" },
];

const WORK_AREAS_EN = [
  { id: "strategy", label: "Strategy & Business Development" },
  { id: "pricing", label: "Pricing / Commercial" },
  { id: "operations", label: "Operations / Process Improvement" },
  { id: "crm", label: "CRM / Systems" },
  { id: "analytics", label: "Analytics / Data" },
  { id: "leadership", label: "Leadership / Collaboration" },
  { id: "sales", label: "Sales / Account Management" },
  { id: "marketing", label: "Marketing / Communications" },
  { id: "finance", label: "Finance / Budget" },
  { id: "project", label: "Project Management" },
  { id: "tech", label: "Technology / IT" },
  { id: "hr", label: "HR / Organizational Development" },
];

interface ContextAnswers {
  decisionLevel: string;
  scope: string;
  stakeholders: string;
  workType: string;
}

const STEPS_SV = ["Välj arbetsområden", "Beskriv din roll", "Genererar...", "Förslag"];
const STEPS_EN = ["Select work areas", "Describe your role", "Generating...", "Suggestions"];

export function ExplainWizard({ open, onClose, jobTitle, company, language = "sv", onAcceptBullets }: ExplainWizardProps) {
  const [step, setStep] = useState(0);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [answers, setAnswers] = useState<ContextAnswers>({ decisionLevel: "", scope: "", stakeholders: "", workType: "" });
  const [generating, setGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<{ text: string; selected: boolean; editing: boolean }[]>([]);
  const { toast } = useToast();

  const isSv = language === "sv";
  const steps = isSv ? STEPS_SV : STEPS_EN;
  const areas = isSv ? WORK_AREAS_SV : WORK_AREAS_EN;

  const toggleArea = (id: string) => {
    setSelectedAreas(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  };

  const handleGenerate = async () => {
    setStep(2);
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("explain-role", {
        body: {
          jobTitle,
          company,
          selectedAreas: selectedAreas.map(id => areas.find(a => a.id === id)?.label || id),
          context: answers,
          language,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const bullets: string[] = data?.bullets || [];
      setSuggestions(bullets.map(text => ({ text, selected: true, editing: false })));
      setStep(3);
    } catch (err: any) {
      toast({ title: isSv ? "Kunde inte generera" : "Generation failed", description: err.message, variant: "destructive" });
      setStep(1);
    } finally {
      setGenerating(false);
    }
  };

  const handleAccept = () => {
    const accepted = suggestions.filter(s => s.selected).map(s => s.text);
    if (accepted.length === 0) {
      toast({ title: isSv ? "Välj minst en punkt" : "Select at least one bullet", variant: "destructive" });
      return;
    }
    onAcceptBullets(accepted);
    onClose();
    // Reset
    setStep(0);
    setSelectedAreas([]);
    setAnswers({ decisionLevel: "", scope: "", stakeholders: "", workType: "" });
    setSuggestions([]);
  };

  const canProceedStep0 = selectedAreas.length > 0;
  const canProceedStep1 = answers.decisionLevel && answers.scope;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {isSv ? "Förklara vad du gjorde" : "Explain what you did"}
          </SheetTitle>
          {jobTitle && (
            <p className="text-sm text-muted-foreground">{jobTitle}{company ? ` @ ${company}` : ""}</p>
          )}
        </SheetHeader>

        <div className="mt-4 mb-6">
          <Progress value={((step + 1) / 4) * 100} className="h-1.5" />
          <p className="text-xs text-muted-foreground mt-1.5">{steps[Math.min(step, 3)]}</p>
        </div>

        {/* Step 0: Select work areas */}
        {step === 0 && (
          <div className="space-y-4">
            <p className="text-sm">
              {isSv
                ? "Vilka arbetsområden var del av din roll? Välj alla som stämmer."
                : "Which work areas were part of your role? Select all that apply."}
            </p>
            <div className="grid grid-cols-1 gap-2">
              {areas.map(area => (
                <label
                  key={area.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedAreas.includes(area.id)
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <Checkbox
                    checked={selectedAreas.includes(area.id)}
                    onCheckedChange={() => toggleArea(area.id)}
                  />
                  <span className="text-sm">{area.label}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={() => setStep(1)} disabled={!canProceedStep0}>
                {isSv ? "Nästa" : "Next"} <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 1: Context questions */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {isSv ? "Var du beslutsfattare eller utförare?" : "Were you a decision-maker or executor?"}
              </Label>
              <RadioGroup value={answers.decisionLevel} onValueChange={v => setAnswers(p => ({ ...p, decisionLevel: v }))}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="decision-maker" id="dm" />
                  <Label htmlFor="dm" className="text-sm">{isSv ? "Jag tog beslut och styrde riktningen" : "I made decisions and set direction"}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="both" id="both" />
                  <Label htmlFor="both" className="text-sm">{isSv ? "Blandning – både beslut och utförande" : "Mix – both decisions and execution"}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="executor" id="ex" />
                  <Label htmlFor="ex" className="text-sm">{isSv ? "Jag utförde och levererade" : "I executed and delivered"}</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {isSv ? "Vad var din scope/räckvidd?" : "What was your scope?"}
              </Label>
              <RadioGroup value={answers.scope} onValueChange={v => setAnswers(p => ({ ...p, scope: v }))}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="org-wide" id="org" />
                  <Label htmlFor="org" className="text-sm">{isSv ? "Hela organisationen / flera marknader" : "Entire organization / multiple markets"}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="department" id="dept" />
                  <Label htmlFor="dept" className="text-sm">{isSv ? "En avdelning / affärsenhet" : "One department / business unit"}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="team" id="team" />
                  <Label htmlFor="team" className="text-sm">{isSv ? "Mitt team / projekt" : "My team / project"}</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {isSv ? "Vilka samarbetade du mest med?" : "Who did you collaborate with most?"}
              </Label>
              <RadioGroup value={answers.stakeholders} onValueChange={v => setAnswers(p => ({ ...p, stakeholders: v }))}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="c-level" id="cl" />
                  <Label htmlFor="cl" className="text-sm">{isSv ? "Ledning / C-level" : "Senior leadership / C-level"}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="cross-functional" id="cf" />
                  <Label htmlFor="cf" className="text-sm">{isSv ? "Tvärfunktionella team" : "Cross-functional teams"}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="external" id="ext" />
                  <Label htmlFor="ext" className="text-sm">{isSv ? "Kunder / externa partners" : "Clients / external partners"}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="team-internal" id="ti" />
                  <Label htmlFor="ti" className="text-sm">{isSv ? "Mitt eget team" : "My own team"}</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {isSv ? "Vilken typ av arbete dominerade?" : "What type of work dominated?"}
              </Label>
              <RadioGroup value={answers.workType} onValueChange={v => setAnswers(p => ({ ...p, workType: v }))}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="analysis" id="an" />
                  <Label htmlFor="an" className="text-sm">{isSv ? "Analys & utredning" : "Analysis & investigation"}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="implementation" id="impl" />
                  <Label htmlFor="impl" className="text-sm">{isSv ? "Implementation & leverans" : "Implementation & delivery"}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="coordination" id="coord" />
                  <Label htmlFor="coord" className="text-sm">{isSv ? "Koordinering & projektledning" : "Coordination & project management"}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="strategic" id="strat" />
                  <Label htmlFor="strat" className="text-sm">{isSv ? "Strategiskt / rådgivande" : "Strategic / advisory"}</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(0)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> {isSv ? "Tillbaka" : "Back"}
              </Button>
              <Button onClick={handleGenerate} disabled={!canProceedStep1}>
                <Sparkles className="mr-1 h-4 w-4" /> {isSv ? "Generera förslag" : "Generate suggestions"}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Loading */}
        {step === 2 && (
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              {isSv ? "Genererar bullet-förslag baserat på dina svar..." : "Generating bullet suggestions based on your answers..."}
            </p>
          </div>
        )}

        {/* Step 3: Results */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {isSv
                ? "Här är förslag baserade på dina svar. Välj de du vill lägga till och redigera vid behov."
                : "Here are suggestions based on your answers. Select the ones to add and edit as needed."}
            </p>
            <div className="space-y-3">
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-3 space-y-2 transition-colors ${
                    s.selected ? "border-primary/40 bg-primary/5" : "border-border opacity-60"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <Checkbox
                      checked={s.selected}
                      onCheckedChange={() => {
                        setSuggestions(prev => prev.map((item, idx) => idx === i ? { ...item, selected: !item.selected } : item));
                      }}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      {s.editing ? (
                        <Textarea
                          rows={3}
                          value={s.text}
                          onChange={e => setSuggestions(prev => prev.map((item, idx) => idx === i ? { ...item, text: e.target.value } : item))}
                          className="text-sm"
                          autoFocus
                        />
                      ) : (
                        <p className="text-sm leading-relaxed">{s.text}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 flex-shrink-0"
                      onClick={() => setSuggestions(prev => prev.map((item, idx) => idx === i ? { ...item, editing: !item.editing } : item))}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> {isSv ? "Ändra svar" : "Change answers"}
              </Button>
              <Button onClick={handleAccept}>
                <Check className="mr-1 h-4 w-4" />
                {isSv
                  ? `Lägg till ${suggestions.filter(s => s.selected).length} bullets`
                  : `Add ${suggestions.filter(s => s.selected).length} bullets`}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
