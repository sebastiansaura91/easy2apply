import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useFlow } from "@/contexts/FlowContext";
import { supabase } from "@/integrations/supabase/client";
import { CVContent } from "@/types/cv";
import { AtsCheckResult } from "@/types/ats-check";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CVPicker } from "@/components/shared/CVPicker";
import { Shield, ArrowLeft, Loader2, TrendingUp, CheckCircle2, AlertTriangle, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { v4 as uuidv4 } from "uuid";

const steps = ["Upload your CV", "Full analysis", "Results"];

export default function ImproveWizard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const flow = useFlow();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [parsedCV, setParsedCV] = useState<CVContent | null>(null);
  const [result, setResult] = useState<AtsCheckResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const handleParsed = async (cv: CVContent) => {
    setParsedCV(cv);
    flow.setParsedCV(cv);
    setStep(1);
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ats-check", {
        body: { resume_content_json: cv, locale: "en" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data as AtsCheckResult);
      setStep(2);
    } catch (e: any) {
      toast({ title: "Analysis failed", description: e.message, variant: "destructive" });
      setStep(0);
    } finally { setAnalyzing(false); }
  };

  const openEditor = async () => {
    if (!user || !parsedCV) return;
    const id = uuidv4();
    const title = parsedCV.contact?.name ? `${parsedCV.contact.name} – CV` : "My CV";
    const { error } = await supabase.from("resumes").insert({
      id, user_id: user.id, title, language: "en", template_id: "default", content_json: parsedCV as any,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    navigate(`/editor/${id}`);
  };

  const scoreColor = (s: number) => s >= 80 ? "text-green-600" : s >= 60 ? "text-yellow-600" : "text-destructive";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-6">
          <button onClick={() => step > 0 && !analyzing ? setStep(0) : navigate("/onboarding")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold font-['Space_Grotesk']">CVSäkert</span>
          </div>
          <div className="text-xs text-muted-foreground">{Math.min(step + 1, steps.length)}/{steps.length}</div>
        </div>
      </nav>

      <div className="mx-auto w-full max-w-3xl px-6 pt-4">
        <div className="flex gap-1.5">
          {steps.map((s, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className={`h-1 w-full rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-muted"}`} />
              <span className={`text-[10px] ${i <= step ? "text-foreground font-medium" : "text-muted-foreground"}`}>{s}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 mx-auto w-full max-w-3xl px-6 py-8">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="s0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold font-['Space_Grotesk']">Upload your CV</h2>
                <p className="text-sm text-muted-foreground mt-1">We'll run a full audit — ATS safety, recruiter scan, bullet analysis, and language check.</p>
              </div>
              <CVPicker onParsed={handleParsed} />
            </motion.div>
          )}

          {step === 1 && analyzing && (
            <motion.div key="s1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
              <p className="text-lg font-semibold font-['Space_Grotesk']">Running full analysis...</p>
              <p className="text-sm text-muted-foreground">ATS check · Recruiter scan · Bullet analysis · Language check</p>
            </motion.div>
          )}

          {step === 2 && result && (
            <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold font-['Space_Grotesk']">Your CV Performance</h2>
                <p className="text-sm text-muted-foreground mt-1">{result.summary}</p>
              </div>

              <Card className="border-2"><CardContent className="p-6 flex items-center gap-6">
                <div className="text-center">
                  <div className={`text-4xl font-bold font-['Space_Grotesk'] ${scoreColor(result.overall_score)}`}>{Math.round(result.overall_score)}</div>
                  <div className={`text-sm font-semibold ${scoreColor(result.overall_score)}`}>Grade {result.grade}</div>
                </div>
                <div className="flex-1 space-y-2">
                  {([["Parse Safety", result.subscores.parse, 30], ["Recruiter Scan", result.subscores.scanability, 30], ["Relevance", result.subscores.relevance, 25], ["Evidence", result.subscores.evidence, 15]] as const).map(([label, val, max]) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-24">{label}</span>
                      <Progress value={(val / max) * 100} className="h-1.5 flex-1" />
                      <span className="text-xs font-semibold w-10 text-right">{val}/{max}</span>
                    </div>
                  ))}
                </div>
              </CardContent></Card>

              {result.first_scan_issues.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-warning" />Top issues</p>
                  {result.first_scan_issues.map((issue, i) => (
                    <Card key={i} className="border-warning/20 bg-warning/5"><CardContent className="p-3">
                      <p className="text-xs font-semibold">{issue.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{issue.why_it_matters}</p>
                      <p className="text-[10px] font-medium text-primary mt-1">→ {issue.fix}</p>
                    </CardContent></Card>
                  ))}
                </div>
              )}

              {result.bullet_feedback.filter(b => b.score < 6).length > 0 && (
                <Card><CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Bullets to improve ({result.bullet_feedback.filter(b => b.score < 6).length})</p>
                  {result.bullet_feedback.filter(b => b.score < 6).slice(0, 4).map((b, i) => (
                    <div key={i} className="flex items-center gap-2 py-1.5 border-b border-border last:border-0">
                      <Badge variant={b.score < 4 ? "destructive" : "outline"} className="text-[9px] h-4">{b.score}/10</Badge>
                      <span className="text-xs text-muted-foreground truncate">{b.recruiter_comment}</span>
                    </div>
                  ))}
                </CardContent></Card>
              )}

              {result.next_actions.length > 0 && (
                <Card><CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Recommended next steps</p>
                  {result.next_actions.slice(0, 3).map((a, i) => (
                    <div key={i} className="flex items-start gap-2 py-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" /><span className="text-sm">{a}</span></div>
                  ))}
                </CardContent></Card>
              )}

              <Button onClick={openEditor} size="lg" className="w-full">
                <FileText className="h-4 w-4 mr-2" /> Fix issues in the editor
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
