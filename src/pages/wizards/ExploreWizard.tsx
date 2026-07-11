import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useFlow } from "@/contexts/FlowContext";
import { supabase } from "@/integrations/supabase/client";
import { CVContent } from "@/types/cv";
import { AtsCheckResult } from "@/types/ats-check";
import { detectDominantLanguage } from "@/lib/language-detection";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CVPicker } from "@/components/shared/CVPicker";
import { Shield, ArrowLeft, Loader2, BarChart3, CheckCircle2, AlertTriangle, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { v4 as uuidv4 } from "uuid";

export default function ExploreWizard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const flow = useFlow();
  const { toast } = useToast();
  const [step, setStep] = useState<"upload" | "loading" | "results">("upload");
  const [parsedCV, setParsedCV] = useState<CVContent | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [cvLang, setCvLang] = useState<"sv" | "en">("en");
  const [result, setResult] = useState<AtsCheckResult | null>(null);

  const handleParsed = async (cv: CVContent, existingResumeId?: string) => {
    setParsedCV(cv);
    setExistingId(existingResumeId ?? null);
    const lang = detectDominantLanguage(cv);
    setCvLang(lang);
    setStep("loading");
    try {
      const { data, error } = await supabase.functions.invoke("ats-check", {
        body: { resume_content_json: cv, locale: lang },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data as AtsCheckResult);
      setStep("results");
    } catch (e: any) {
      toast({ title: "Analysis failed", description: e.message, variant: "destructive" });
      setStep("upload");
    }
  };

  const improveInEditor = async () => {
    if (!user || !parsedCV) return;
    if (result) flow.setAnalysis(result);
    // Picked an existing CV → open it in place instead of cloning a copy.
    if (existingId) { flow.setResumeId(existingId); navigate(`/editor/${existingId}`); return; }
    // Fresh upload → create one new resume.
    const id = uuidv4();
    const title = parsedCV.contact?.name ? `${parsedCV.contact.name} – CV` : "My CV";
    const { error } = await supabase.from("resumes").insert({
      id, user_id: user.id, title, language: cvLang, template_id: "default", content_json: parsedCV as any,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    flow.setResumeId(id);
    navigate(`/editor/${id}`);
  };

  const scoreColor = (s: number) => s >= 80 ? "text-green-600" : s >= 60 ? "text-yellow-600" : "text-destructive";
  const statusIcon = (s: string) => s === "pass" ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : s === "warning" ? <AlertTriangle className="h-3.5 w-3.5 text-yellow-600" /> : <AlertTriangle className="h-3.5 w-3.5 text-destructive" />;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-6">
          <button onClick={() => navigate("/onboarding")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold font-['Fraunces']">CVSäkert</span>
          </div>
          <div />
        </div>
      </nav>

      <div className="flex-1 mx-auto w-full max-w-3xl px-6 py-8">
        <AnimatePresence mode="wait">
          {step === "upload" && (
            <motion.div key="up" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold font-['Fraunces']">Explore your CV strength</h2>
                <p className="text-sm text-muted-foreground mt-1">Upload your CV for a quick recruiter-style analysis. No commitment needed.</p>
              </div>
              <CVPicker onParsed={handleParsed} />
            </motion.div>
          )}

          {step === "loading" && (
            <motion.div key="ld" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
              <p className="text-lg font-semibold font-['Fraunces']">Scanning your CV...</p>
              <p className="text-sm text-muted-foreground">This takes about 15 seconds</p>
            </motion.div>
          )}

          {step === "results" && result && (
            <motion.div key="res" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="text-center">
                <div className={`text-5xl font-bold font-['Fraunces'] ${scoreColor(result.overall_score)}`}>
                  {Math.round(result.overall_score)}
                </div>
                <div className={`text-lg font-semibold ${scoreColor(result.overall_score)} mt-1`}>Grade {result.grade}</div>
                <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">{result.summary}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {([["Parse Safety", result.subscores.parse, 30], ["Scanability", result.subscores.scanability, 30], ["Relevance", result.subscores.relevance, 25], ["Evidence", result.subscores.evidence, 15]] as const).map(([label, val, max]) => (
                  <Card key={label}><CardContent className="p-4">
                    <p className="text-xs text-muted-foreground mb-1">{label}</p>
                    <Progress value={(val / max) * 100} className="h-2 mb-1" />
                    <p className="text-sm font-semibold">{val}/{max}</p>
                  </CardContent></Card>
                ))}
              </div>

              {result.scanability_check.length > 0 && (
                <Card><CardContent className="p-4 space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Scanability</p>
                  {result.scanability_check.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      {statusIcon(s.status)}
                      <span className="text-xs flex-1">{s.dimension.replace(/_/g, " ")}</span>
                      <Badge variant={s.status === "pass" ? "secondary" : "outline"} className="text-[9px] h-4">{s.status}</Badge>
                    </div>
                  ))}
                </CardContent></Card>
              )}

              {result.first_scan_issues.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold">Biggest opportunities</p>
                  {result.first_scan_issues.map((issue, i) => (
                    <Card key={i} className="border-primary/20 bg-primary/5"><CardContent className="p-3">
                      <p className="text-xs font-semibold">{issue.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{issue.fix}</p>
                    </CardContent></Card>
                  ))}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <Button onClick={improveInEditor} size="lg" className="flex-1">
                  <TrendingUp className="h-4 w-4 mr-2" /> Improve this CV
                </Button>
                <Button variant="outline" size="lg" onClick={() => navigate("/dashboard")} className="flex-1">
                  Back to dashboard
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
