import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFlow } from "@/contexts/FlowContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { CVContent, emptyCV } from "@/types/cv";
import { AtsCheckResult } from "@/types/ats-check";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CVPicker } from "@/components/shared/CVPicker";
import { Shield, ArrowLeft, ArrowRight, Loader2, Briefcase, Target, Users, Award, CheckCircle2, AlertTriangle, Eye, FileText, Plus, Wrench, Languages } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { v4 as uuidv4 } from "uuid";

const steps = ["Paste job posting", "Job analysis", "Your CV", "Match results"];

export default function ApplyWizard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const flow = useFlow();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [jobText, setJobText] = useState(flow.jobPostingText || "");
  const [analyzing, setAnalyzing] = useState(false);
  const [jobAnalysis, setJobAnalysis] = useState(flow.jobAnalysis);
  const [parsedCV, setParsedCV] = useState<CVContent | null>(flow.parsedCV);
  const [matchResult, setMatchResult] = useState<AtsCheckResult | null>(null);
  const [matching, setMatching] = useState(false);
  const [creatingForFix, setCreatingForFix] = useState(false);

  const openEditorToFix = async () => {
    if (!user || !parsedCV) return;
    // If we already have a resume ID, navigate directly
    if (flow.resumeId) {
      navigate(`/editor/${flow.resumeId}`);
      return;
    }
    // Otherwise create the resume first
    setCreatingForFix(true);
    const id = uuidv4();
    const title = jobAnalysis ? `CV — ${jobAnalysis.job_title}` : "New CV";
    const { error } = await supabase.from("resumes").insert({
      id, user_id: user.id, title, language: "en", template_id: "default", content_json: parsedCV as any,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setCreatingForFix(false); return; }
    flow.setResumeId(id);
    setCreatingForFix(false);
    navigate(`/editor/${id}`);
  };

  const analyzeJob = async () => {
    if (!jobText.trim()) return;
    setAnalyzing(true);
    try {
      // Check for cached analysis first
      const trimmed = jobText.trim();
      if (user) {
        const { data: cached } = await supabase
          .from("job_postings")
          .select("analysis_json")
          .eq("user_id", user.id)
          .eq("text", trimmed)
          .not("analysis_json", "is", null)
          .limit(1)
          .maybeSingle();

        if (cached?.analysis_json) {
          const analysis = cached.analysis_json as unknown as import("@/contexts/FlowContext").JobAnalysis;
          setJobAnalysis(analysis);
          flow.setJobPostingText(trimmed);
          flow.setJobAnalysis(analysis);
          setStep(1);
          return;
        }
      }

      const { data, error } = await supabase.functions.invoke("analyze-job-posting", { body: { job_posting_text: trimmed } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setJobAnalysis(data);
      flow.setJobPostingText(trimmed);
      flow.setJobAnalysis(data);

      // Cache the result
      if (user) {
        await supabase.from("job_postings").insert({
          user_id: user.id,
          title: data.job_title || "Untitled",
          text: trimmed,
          analysis_json: data as any,
        });
      }

      setStep(1);
    } catch (e: any) {
      toast({ title: "Analysis failed", description: e.message, variant: "destructive" });
    } finally { setAnalyzing(false); }
  };

  const handleCVParsed = (cv: CVContent, existingResumeId?: string) => {
    setParsedCV(cv);
    flow.setParsedCV(cv);
    if (existingResumeId) flow.setResumeId(existingResumeId);
  };

  const runMatch = async () => {
    if (!parsedCV) return;
    setMatching(true);
    try {
      const { data, error } = await supabase.functions.invoke("ats-check", {
        body: { resume_content_json: parsedCV, job_posting_text: jobText.trim(), locale: "en" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMatchResult(data as AtsCheckResult);
      setStep(3);
    } catch (e: any) {
      toast({ title: "Match analysis failed", description: e.message, variant: "destructive" });
    } finally { setMatching(false); }
  };

  const createResumeAndOpen = async () => {
    if (!user || !parsedCV) return;
    const id = uuidv4();
    const title = jobAnalysis ? `CV — ${jobAnalysis.job_title}` : "New CV";
    const { error } = await supabase.from("resumes").insert({
      id, user_id: user.id, title, language: "en", template_id: "default", content_json: parsedCV as any,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    flow.setResumeId(id);
    navigate(`/editor/${id}`);
  };

  const createEmptyAndOpen = async () => {
    if (!user) return;
    const id = uuidv4();
    const title = jobAnalysis ? `CV — ${jobAnalysis.job_title}` : "New CV";
    const { error } = await supabase.from("resumes").insert({
      id, user_id: user.id, title, language: "en", template_id: "default", content_json: emptyCV as any,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    flow.setResumeId(id);
    navigate(`/editor/${id}`);
  };

  const scoreColor = (s: number) => s >= 80 ? "text-green-600" : s >= 60 ? "text-yellow-600" : "text-destructive";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-6">
          <button onClick={() => step > 0 ? setStep(step - 1) : navigate("/onboarding")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold font-['Space_Grotesk']">CVSäkert</span>
          </div>
          <div className="text-xs text-muted-foreground">{step + 1}/{steps.length}</div>
        </div>
      </nav>

      {/* Progress */}
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
          {/* Step 0: Paste job posting */}
          {step === 0 && (
            <motion.div key="s0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold font-['Space_Grotesk']">Paste the job posting</h2>
                <p className="text-sm text-muted-foreground mt-1">We'll analyze it and extract the key requirements so you know exactly what to optimize.</p>
              </div>
              <Textarea rows={12} value={jobText} onChange={e => setJobText(e.target.value)} placeholder="Paste the full job description here..." className="text-sm" />
              <Button onClick={analyzeJob} disabled={!jobText.trim() || analyzing} className="w-full sm:w-auto" size="lg">
                {analyzing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Target className="h-4 w-4 mr-2" />}
                {analyzing ? "Analyzing..." : "Analyze job posting"}
              </Button>
            </motion.div>
          )}

          {/* Step 1: Job analysis */}
          {step === 1 && jobAnalysis && (
            <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold font-['Space_Grotesk']">Job Analysis</h2>
                <p className="text-sm text-muted-foreground mt-1">Here's what we found in the posting.</p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <Card><CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2"><Briefcase className="h-4 w-4 text-primary" /><span className="text-xs font-semibold uppercase text-muted-foreground">Role</span></div>
                  <p className="font-semibold">{jobAnalysis.job_title}</p>
                  <p className="text-sm text-muted-foreground">{jobAnalysis.company_name}</p>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2"><Users className="h-4 w-4 text-primary" /><span className="text-xs font-semibold uppercase text-muted-foreground">Seniority</span></div>
                  <p className="font-semibold">{jobAnalysis.seniority_level}</p>
                  <p className="text-sm text-muted-foreground">{jobAnalysis.industry}</p>
                </CardContent></Card>
              </div>

              <Card><CardContent className="p-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground mb-3 flex items-center gap-1.5"><Target className="h-3.5 w-3.5 text-primary" />Key Requirements</p>
                <div className="flex flex-wrap gap-2">
                  {jobAnalysis.key_requirements.map((r, i) => <Badge key={i} className="text-xs">{r}</Badge>)}
                </div>
              </CardContent></Card>

              {jobAnalysis.nice_to_have.length > 0 && (
                <Card><CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-3">Nice to have</p>
                  <div className="flex flex-wrap gap-2">
                    {jobAnalysis.nice_to_have.map((r, i) => <Badge key={i} variant="outline" className="text-xs">{r}</Badge>)}
                  </div>
                </CardContent></Card>
              )}

              <Card><CardContent className="p-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground mb-3">Core Responsibilities</p>
                <ul className="space-y-1.5">
                  {jobAnalysis.core_responsibilities.map((r, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />{r}
                    </li>
                  ))}
                </ul>
              </CardContent></Card>

              {jobAnalysis.key_phrases.length > 0 && (
                <Card><CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-3">Key phrases to use</p>
                  <div className="flex flex-wrap gap-2">
                    {jobAnalysis.key_phrases.map((p, i) => <Badge key={i} variant="secondary" className="text-xs">{p}</Badge>)}
                  </div>
                </CardContent></Card>
              )}

              <Button onClick={() => setStep(2)} size="lg" className="w-full sm:w-auto">
                Match my CV to this role <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </motion.div>
          )}

          {/* Step 2: Upload CV */}
          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold font-['Space_Grotesk']">Your CV</h2>
                <p className="text-sm text-muted-foreground mt-1">Upload your existing CV to see how well it matches the role.</p>
              </div>

              <CVPicker onParsed={handleCVParsed} />

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <Button variant="outline" onClick={createEmptyAndOpen} className="w-full">
                <Plus className="h-4 w-4 mr-2" /> Create a new CV from scratch
              </Button>

              {parsedCV && (
                <Button onClick={runMatch} disabled={matching} size="lg" className="w-full">
                  {matching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
                  {matching ? "Analyzing match..." : "See how this CV matches the role"}
                </Button>
              )}
            </motion.div>
          )}

          {/* Step 3: Match results */}
          {step === 3 && matchResult && (
            <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold font-['Space_Grotesk']">Match Results</h2>
                <p className="text-sm text-muted-foreground mt-1">Here's how your CV performs against this role.</p>
              </div>

              {/* Score */}
              <Card className="border-2"><CardContent className="p-6 flex items-center gap-6">
                <div className="text-center">
                  <div className={`text-4xl font-bold font-['Space_Grotesk'] ${scoreColor(matchResult.overall_score)}`}>
                    {Math.round(matchResult.overall_score)}
                  </div>
                  <div className={`text-sm font-semibold ${scoreColor(matchResult.overall_score)}`}>Grade {matchResult.grade}</div>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium mb-1">Overall Match Score</p>
                  <p className="text-xs text-muted-foreground">{matchResult.summary}</p>
                </div>
              </CardContent></Card>

              {/* Subscores */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([["Parse Safety", matchResult.subscores.parse, 30], ["Recruiter Scan", matchResult.subscores.scanability, 30], ["Relevance", matchResult.subscores.relevance, 25], ["Evidence", matchResult.subscores.evidence, 15]] as const).map(([label, val, max]) => (
                  <Card key={label}><CardContent className="p-3 text-center">
                    <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
                    <Progress value={(val / max) * 100} className="h-1.5 mb-1" />
                    <p className="text-xs font-semibold">{val}/{max}</p>
                  </CardContent></Card>
                ))}
              </div>

              {/* First scan issues */}
              {matchResult.first_scan_issues.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-warning" />Top issues a recruiter would notice</p>
                  {matchResult.first_scan_issues.map((issue, i) => (
                    <Card key={i} className="border-warning/20 bg-warning/5"><CardContent className="p-3">
                      <p className="text-xs font-semibold">{issue.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{issue.why_it_matters}</p>
                      <p className="text-[10px] font-medium text-primary mt-1">→ {issue.fix}</p>
                      <Button
                        variant="default"
                        size="sm"
                        className="h-7 text-[10px] gap-1.5 mt-2"
                        onClick={openEditorToFix}
                        disabled={creatingForFix}
                      >
                        <Wrench className="h-3 w-3" />
                        {creatingForFix ? "Opening..." : "Fix this in editor"}
                      </Button>
                    </CardContent></Card>
                  ))}
                </div>
              )}

              {/* Missing keywords */}
              {matchResult.job_language_match.missing_phrases.length > 0 && (
                <Card><CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Missing keywords</p>
                  <div className="flex flex-wrap gap-1.5">
                    {matchResult.job_language_match.missing_phrases.map(p => <Badge key={p} variant="destructive" className="text-[10px]">{p}</Badge>)}
                  </div>
                </CardContent></Card>
              )}

              {/* Weak bullets */}
              {matchResult.bullet_feedback.filter(b => b.score < 6).length > 0 && (
                <Card><CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                    Bullets that need improvement ({matchResult.bullet_feedback.filter(b => b.score < 6).length})
                  </p>
                  <div className="space-y-2">
                    {matchResult.bullet_feedback.filter(b => b.score < 6).slice(0, 5).map((b, i) => (
                      <div key={i} className="text-xs p-2 rounded border border-border">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={b.score < 4 ? "destructive" : "outline"} className="text-[9px] h-4">{b.score}/10</Badge>
                          <span className="text-muted-foreground">{b.bullet_id}</span>
                        </div>
                        <p className="text-muted-foreground">{b.recruiter_comment}</p>
                      </div>
                    ))}
                  </div>
                </CardContent></Card>
              )}

              <Button onClick={createResumeAndOpen} size="lg" className="w-full">
                <FileText className="h-4 w-4 mr-2" /> Open in editor and start improving
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
