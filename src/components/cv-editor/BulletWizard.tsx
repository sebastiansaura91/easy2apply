import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, Loader2, Sparkles, X, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  BulletWizardInput,
  BulletGeneratorResult,
  emptyWizardInput,
  INDUSTRIES,
  COMPANY_TYPES,
  COMMON_TOOLS,
  COMMON_STAKEHOLDERS,
} from "@/types/bullet-generator";
import { BulletResults } from "./BulletResults";

interface BulletWizardProps {
  open: boolean;
  onClose: () => void;
  jobTitle?: string;
  company?: string;
  startDate?: string;
  endDate?: string;
  isPresent?: boolean;
  onAcceptBullets: (bullets: string[]) => void;
  language?: "sv" | "en";
}

const STEPS = ["Roll & kontext", "Uppgifter", "Verktyg & stakeholders", "Resultat & ton"];

export function BulletWizard({
  open,
  onClose,
  jobTitle = "",
  company = "",
  startDate = "",
  endDate = "",
  isPresent = false,
  onAcceptBullets,
  language = "sv",
}: BulletWizardProps) {
  const [step, setStep] = useState(0);
  const [input, setInput] = useState<BulletWizardInput>({
    ...emptyWizardInput,
    jobTitle,
    period: `${startDate} – ${isPresent ? "pågående" : endDate}`,
  });
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<BulletGeneratorResult | null>(null);
  const { toast } = useToast();

  const resetAndClose = () => {
    setStep(0);
    setInput({ ...emptyWizardInput, jobTitle, period: `${startDate} – ${isPresent ? "pågående" : endDate}` });
    setResult(null);
    setGenerating(false);
    onClose();
  };

  const canAdvance = () => {
    if (step === 0) return input.jobTitle.trim().length > 0;
    if (step === 1) return input.tasks.some((t) => t.trim().length > 0);
    return true;
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const cleanTasks = input.tasks.filter((t) => t.trim().length > 0);
      const { data, error } = await supabase.functions.invoke("generate-bullets", {
        body: { ...input, tasks: cleanTasks },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data as BulletGeneratorResult);
    } catch (err: any) {
      toast({ title: "Kunde inte generera bullets", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const addTask = () => setInput({ ...input, tasks: [...input.tasks, ""] });
  const updateTask = (idx: number, val: string) => {
    const tasks = [...input.tasks];
    tasks[idx] = val;
    setInput({ ...input, tasks });
  };
  const removeTask = (idx: number) => {
    if (input.tasks.length <= 1) return;
    setInput({ ...input, tasks: input.tasks.filter((_, i) => i !== idx) });
  };

  const toggleTag = (list: string[], item: string, key: "tools" | "stakeholders") => {
    const updated = list.includes(item) ? list.filter((i) => i !== item) : [...list, item];
    setInput({ ...input, [key]: updated });
  };

  const [customTool, setCustomTool] = useState("");
  const [customStakeholder, setCustomStakeholder] = useState("");

  if (result) {
    return (
      <Dialog open={open} onOpenChange={resetAndClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Genererade bullets – {input.jobTitle}
            </DialogTitle>
          </DialogHeader>
          <BulletResults
            result={result}
            context={{ jobTitle: input.jobTitle, company }}
            onAccept={(bullets) => {
              onAcceptBullets(bullets);
              resetAndClose();
            }}
            onRegenerate={() => {
              setResult(null);
              handleGenerate();
            }}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Skapa bullets – {STEPS[step]}
          </DialogTitle>
        </DialogHeader>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            {STEPS.map((s, i) => (
              <span key={i} className={i === step ? "text-primary font-medium" : ""}>{s}</span>
            ))}
          </div>
          <Progress value={((step + 1) / STEPS.length) * 100} className="h-1.5" />
        </div>

        {/* Step content */}
        <div className="space-y-4 min-h-[280px]">
          {step === 0 && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Rolltitel *</label>
                <Input value={input.jobTitle} onChange={(e) => setInput({ ...input, jobTitle: e.target.value })} placeholder="T.ex. Senior Business Analyst" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Period</label>
                <Input value={input.period} onChange={(e) => setInput({ ...input, period: e.target.value })} placeholder="2020-01 – pågående" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Bransch</label>
                  <Select value={input.industry} onValueChange={(v) => setInput({ ...input, industry: v })}>
                    <SelectTrigger><SelectValue placeholder="Välj bransch" /></SelectTrigger>
                    <SelectContent>
                      {INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Bolagstyp</label>
                  <Select value={input.companyType} onValueChange={(v) => setInput({ ...input, companyType: v })}>
                    <SelectTrigger><SelectValue placeholder="Välj typ" /></SelectTrigger>
                    <SelectContent>
                      {COMPANY_TYPES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Huvuduppgifter (3–6 st) *</label>
                <p className="text-xs text-muted-foreground">Beskriv kort vad du faktiskt gjorde – inte ansvarstitel.</p>
              </div>
              {input.tasks.map((task, idx) => (
                <div key={idx} className="flex gap-2">
                  <span className="text-muted-foreground mt-2 text-sm">{idx + 1}.</span>
                  <Input
                    value={task}
                    onChange={(e) => updateTask(idx, e.target.value)}
                    placeholder="T.ex. Byggde dashboards i Power BI för säljavdelningen"
                  />
                  {input.tasks.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeTask(idx)}>
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
              {input.tasks.length < 6 && (
                <Button variant="ghost" size="sm" onClick={addTask}>
                  <Plus className="h-3 w-3 mr-1" /> Lägg till uppgift
                </Button>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Verktyg & metoder</label>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_TOOLS.map((tool) => (
                    <Badge
                      key={tool}
                      variant={input.tools.includes(tool) ? "default" : "outline"}
                      className="cursor-pointer text-xs"
                      onClick={() => toggleTag(input.tools, tool, "tools")}
                    >
                      {tool}
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <Input
                    placeholder="Eget verktyg…"
                    value={customTool}
                    onChange={(e) => setCustomTool(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && customTool.trim()) {
                        e.preventDefault();
                        toggleTag(input.tools, customTool.trim(), "tools");
                        setCustomTool("");
                      }
                    }}
                    className="h-8 text-sm"
                  />
                  <Button variant="outline" size="sm" onClick={() => { if (customTool.trim()) { toggleTag(input.tools, customTool.trim(), "tools"); setCustomTool(""); } }}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Samarbete / stakeholders</label>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_STAKEHOLDERS.map((s) => (
                    <Badge
                      key={s}
                      variant={input.stakeholders.includes(s) ? "default" : "outline"}
                      className="cursor-pointer text-xs"
                      onClick={() => toggleTag(input.stakeholders, s, "stakeholders")}
                    >
                      {s}
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <Input
                    placeholder="Egen stakeholder…"
                    value={customStakeholder}
                    onChange={(e) => setCustomStakeholder(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && customStakeholder.trim()) {
                        e.preventDefault();
                        toggleTag(input.stakeholders, customStakeholder.trim(), "stakeholders");
                        setCustomStakeholder("");
                      }
                    }}
                    className="h-8 text-sm"
                  />
                  <Button variant="outline" size="sm" onClick={() => { if (customStakeholder.trim()) { toggleTag(input.stakeholders, customStakeholder.trim(), "stakeholders"); setCustomStakeholder(""); } }}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Resultat / impact (valfritt)</label>
                <p className="text-xs text-muted-foreground">Fyll i siffror du vet. Lämna tomt = AI använder [FYLL I]-platshållare.</p>
                <Textarea
                  rows={3}
                  value={input.results}
                  onChange={(e) => setInput({ ...input, results: e.target.value })}
                  placeholder="T.ex. Ökade konvertering med 15%, minskade ledtid från 5 till 2 dagar…"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Saker jag INTE vill att AI säger</label>
                <Input
                  value={input.constraints}
                  onChange={(e) => setInput({ ...input, constraints: e.target.value })}
                  placeholder="T.ex. Nämn inte P&L-ansvar, inga buzzwords…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tonval</label>
                  <Select value={input.tone} onValueChange={(v: any) => setInput({ ...input, tone: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Saklig">Saklig</SelectItem>
                      <SelectItem value="Skärpt">Skärpt</SelectItem>
                      <SelectItem value="Konsult">Konsult</SelectItem>
                      <SelectItem value="Ledarskap">Ledarskap</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Senioritet</label>
                  <Select value={input.seniority} onValueChange={(v: any) => setInput({ ...input, seniority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IC">IC (Individual Contributor)</SelectItem>
                      <SelectItem value="Manager">Manager</SelectItem>
                      <SelectItem value="Program">Program / Portfolio</SelectItem>
                      <SelectItem value="Head-of">Head-of / Director</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={() => step > 0 ? setStep(step - 1) : resetAndClose()}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            {step === 0 ? "Avbryt" : "Tillbaka"}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canAdvance()}>
              Nästa
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleGenerate} disabled={generating || !canAdvance()}>
              {generating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
              {generating ? "Genererar…" : "Generera bullets"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
