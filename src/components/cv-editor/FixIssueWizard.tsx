import { useState } from "react";
import { CVContent } from "@/types/cv";
import { FirstScanIssue } from "@/types/ats-check";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, ArrowRight, Check, Loader2, Sparkles, Target,
  User, Briefcase, Wrench, Pencil, TrendingUp, ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type TargetSection = "profile" | "experience" | "skills";

interface FixQuestion {
  question: string;
  options: string[];
  allow_freetext?: boolean;
}

interface FixSuggestion {
  suggestion_text: string;
  explanation: string;
  estimated_impact: { relevance: string; scanability: string; overall: string };
  alternative_text?: string;
}

interface Props {
  issue: FirstScanIssue;
  cv: CVContent;
  cvLanguage: "sv" | "en";
  jobPostingText?: string;
  onApplyToProfile: (text: string) => void;
  onApplyToExperience: (expIdx: number, bullets: string[]) => void;
  onApplyToSkills: (skills: string[]) => void;
  onClose: () => void;
  onNavigateToSection?: (section: string) => void;
}

type Step = "target" | "questions" | "suggestion";

export function FixIssueWizard({
  issue, cv, cvLanguage, jobPostingText,
  onApplyToProfile, onApplyToExperience, onApplyToSkills,
  onClose, onNavigateToSection,
}: Props) {
  const { toast } = useToast();
  const isSv = cvLanguage === "sv";

  const [step, setStep] = useState<Step>("target");
  const [targetSection, setTargetSection] = useState<TargetSection>("profile");
  const [targetExpIdx, setTargetExpIdx] = useState(0);

  // Questions step
  const [questions, setQuestions] = useState<FixQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [freetextAnswers, setFreetextAnswers] = useState<Record<number, string>>({});
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // Suggestion step
  const [suggestion, setSuggestion] = useState<FixSuggestion | null>(null);
  const [editedText, setEditedText] = useState("");
  const [showAlternative, setShowAlternative] = useState(false);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Determine available targets based on issue
  const targetOptions: { value: TargetSection; label: string; icon: React.ReactNode; desc: string }[] = [
    { value: "profile", label: isSv ? "Profil" : "Profile", icon: <User className="h-4 w-4" />, desc: isSv ? "Profiltext / sammanfattning" : "Profile summary" },
    ...(cv.experience.length > 0 ? [{ value: "experience" as TargetSection, label: isSv ? "Erfarenhet" : "Experience", icon: <Briefcase className="h-4 w-4" />, desc: isSv ? "Specifik roll" : "Specific role" }] : []),
    { value: "skills", label: isSv ? "Kompetenser" : "Skills", icon: <Wrench className="h-4 w-4" />, desc: isSv ? "Kompetens-/färdighetslista" : "Skills list" },
  ];

  const goToQuestions = async () => {
    setLoadingQuestions(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-fix-questions", {
        body: {
          issue, cv, job_posting_text: jobPostingText,
          target_section: targetSection,
          target_index: targetSection === "experience" ? targetExpIdx : undefined,
          locale: cvLanguage,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setQuestions(data.questions || []);
      setAnswers({});
      setFreetextAnswers({});
      setStep("questions");
    } catch (e: any) {
      toast({ title: isSv ? "Kunde inte generera frågor" : "Failed to generate questions", description: e.message, variant: "destructive" });
    } finally {
      setLoadingQuestions(false);
    }
  };

  const goToSuggestion = async () => {
    setLoadingSuggestion(true);
    try {
      const answersArray = questions.map((q, i) => ({
        question: q.question,
        answer: answers[i] === "__freetext__" ? (freetextAnswers[i] || "") : (answers[i] || ""),
      }));

      const { data, error } = await supabase.functions.invoke("fix-issue", {
        body: {
          issue, cv, job_posting_text: jobPostingText,
          answers: answersArray,
          target_section: targetSection,
          target_index: targetSection === "experience" ? targetExpIdx : undefined,
          locale: cvLanguage,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSuggestion(data as FixSuggestion);
      setEditedText(data.suggestion_text);
      setStep("suggestion");
    } catch (e: any) {
      toast({ title: isSv ? "Kunde inte generera förslag" : "Failed to generate suggestion", description: e.message, variant: "destructive" });
    } finally {
      setLoadingSuggestion(false);
    }
  };

  const handleApply = () => {
    const text = isEditing ? editedText : (showAlternative && suggestion?.alternative_text ? suggestion.alternative_text : editedText);

    if (targetSection === "profile") {
      onApplyToProfile(text);
      onNavigateToSection?.("profile");
    } else if (targetSection === "experience") {
      // For experience, split into bullets and MERGE with existing ones
      const newBullets = text.split("\n").map(b => b.replace(/^[•\-–]\s*/, "").trim()).filter(b => b.length > 0);
      const existingBullets = cv.experience[targetExpIdx]?.bullets || [];
      const merged = [...existingBullets, ...newBullets.filter(nb => !existingBullets.includes(nb))];
      onApplyToExperience(targetExpIdx, merged);
      onNavigateToSection?.("experience");
    } else if (targetSection === "skills") {
      const newSkills = text.split(/[,\n]/).map(s => s.trim()).filter(s => s.length > 0);
      onApplyToSkills(newSkills);
      onNavigateToSection?.("skills");
    }

    toast({ title: isSv ? "✅ Förslaget har applicerats" : "✅ Suggestion applied" });
    onClose();
  };

  const allAnswered = questions.length > 0 && questions.every((_, i) => {
    if (answers[i] === "__freetext__") return (freetextAnswers[i] || "").trim().length > 0;
    return !!answers[i];
  });

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={step === "target" ? onClose : () => setStep(step === "suggestion" ? "questions" : "target")}>
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{issue.title}</p>
          <p className="text-[10px] text-muted-foreground">
            {step === "target" ? (isSv ? "Steg 1: Var ska vi fixa?" : "Step 1: Where to fix?")
              : step === "questions" ? (isSv ? "Steg 2: Förtydliga" : "Step 2: Clarify")
              : (isSv ? "Steg 3: Förslag" : "Step 3: Suggestion")}
          </p>
        </div>
        {/* Step indicators */}
        <div className="flex gap-1">
          {["target", "questions", "suggestion"].map((s, i) => (
            <div key={s} className={`h-1.5 w-6 rounded-full transition-colors ${
              s === step ? "bg-primary" : i < ["target", "questions", "suggestion"].indexOf(step) ? "bg-primary/40" : "bg-muted"
            }`} />
          ))}
        </div>
      </div>

      {/* Step: Target */}
      {step === "target" && (
        <div className="space-y-3">
          <div className="space-y-2">
            {targetOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setTargetSection(opt.value)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                  targetSection === opt.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <div className={`p-1.5 rounded-md ${targetSection === opt.value ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {opt.icon}
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold">{opt.label}</p>
                  <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
                </div>
                {targetSection === opt.value && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
          </div>

          {/* Experience role selector */}
          {targetSection === "experience" && cv.experience.length > 0 && (
            <div className="space-y-1.5 pl-2">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {isSv ? "Välj roll" : "Select role"}
              </p>
              {cv.experience.map((exp, i) => (
                <button
                  key={exp.id}
                  onClick={() => setTargetExpIdx(i)}
                  className={`w-full flex items-center gap-2 p-2 rounded-md border text-left text-xs transition-colors ${
                    targetExpIdx === i ? "border-primary/50 bg-primary/5" : "border-border hover:bg-accent/50"
                  }`}
                >
                  <Briefcase className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium truncate">{exp.title || "Untitled"}</span>
                  <span className="text-[10px] text-muted-foreground truncate">{exp.company}</span>
                  {targetExpIdx === i && <Check className="h-3 w-3 text-primary ml-auto flex-shrink-0" />}
                </button>
              ))}
            </div>
          )}

          <Button onClick={goToQuestions} disabled={loadingQuestions} className="w-full text-xs h-9">
            {loadingQuestions ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5 mr-1.5" />}
            {loadingQuestions ? (isSv ? "Förbereder frågor..." : "Preparing questions...") : (isSv ? "Nästa: Förtydligande frågor" : "Next: Clarifying questions")}
          </Button>
        </div>
      )}

      {/* Step: Questions */}
      {step === "questions" && (
        <div className="space-y-4">
          {questions.map((q, qi) => (
            <div key={qi} className="space-y-2">
              <p className="text-xs font-semibold break-words">{q.question}</p>
              <RadioGroup value={answers[qi] || ""} onValueChange={v => setAnswers(prev => ({ ...prev, [qi]: v }))}>
                {q.options.map((opt, oi) => (
                  <div key={oi} className="flex items-start gap-2">
                    <RadioGroupItem value={opt} id={`q${qi}-o${oi}`} className="mt-0.5 flex-shrink-0" />
                    <Label htmlFor={`q${qi}-o${oi}`} className="flex-1 min-w-0 whitespace-normal text-xs cursor-pointer break-words leading-relaxed">{opt}</Label>
                  </div>
                ))}
                {q.allow_freetext !== false && (
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="__freetext__" id={`q${qi}-free`} className="mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0 space-y-1">
                      <Label htmlFor={`q${qi}-free`} className="text-xs cursor-pointer">{isSv ? "Eget svar" : "Custom answer"}</Label>
                      {answers[qi] === "__freetext__" && (
                        <Input
                          value={freetextAnswers[qi] || ""}
                          onChange={e => setFreetextAnswers(prev => ({ ...prev, [qi]: e.target.value }))}
                          placeholder={isSv ? "Skriv ditt svar..." : "Type your answer..."}
                          className="h-7 text-xs"
                        />
                      )}
                    </div>
                  </div>
                )}
              </RadioGroup>
            </div>
          ))}

          <Button onClick={goToSuggestion} disabled={!allAnswered || loadingSuggestion} className="w-full text-xs h-9">
            {loadingSuggestion ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
            {loadingSuggestion ? (isSv ? "Genererar förslag..." : "Generating suggestion...") : (isSv ? "Generera förslag" : "Generate suggestion")}
          </Button>
        </div>
      )}

      {/* Step: Suggestion */}
      {step === "suggestion" && suggestion && (
        <div className="space-y-3">
          {/* Explanation */}
          <p className="text-xs text-muted-foreground leading-relaxed">{suggestion.explanation}</p>

          {/* Estimated impact */}
          <div className="flex gap-2">
            {Object.entries(suggestion.estimated_impact).map(([key, val]) => (
              <Badge key={key} variant="secondary" className="text-[9px] h-5 gap-1">
                <TrendingUp className="h-2.5 w-2.5 text-green-600" />
                {key === "relevance" ? (isSv ? "Relevans" : "Relevance")
                  : key === "scanability" ? (isSv ? "Skanning" : "Scan")
                  : "Overall"} {val}
              </Badge>
            ))}
          </div>

          {/* Main suggestion */}
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                  {isSv ? "Förslag" : "Suggestion"}
                </span>
                <Button variant="ghost" size="sm" className="h-5 text-[10px] gap-1" onClick={() => setIsEditing(!isEditing)}>
                  <Pencil className="h-2.5 w-2.5" />
                  {isEditing ? (isSv ? "Stäng" : "Close") : (isSv ? "Redigera" : "Edit")}
                </Button>
              </div>
              {isEditing ? (
                <Textarea
                  value={editedText}
                  onChange={e => setEditedText(e.target.value)}
                  rows={4}
                  className="text-xs bg-background/50"
                />
              ) : (
                <p className="text-xs leading-relaxed whitespace-pre-wrap">{showAlternative && suggestion.alternative_text ? suggestion.alternative_text : editedText}</p>
              )}
            </CardContent>
          </Card>

          {/* Alternative toggle */}
          {suggestion.alternative_text && !isEditing && (
            <Button variant="ghost" size="sm" className="w-full h-6 text-[10px]" onClick={() => {
              setShowAlternative(!showAlternative);
              if (!showAlternative) setEditedText(suggestion.alternative_text!);
              else setEditedText(suggestion.suggestion_text);
            }}>
              <ChevronRight className="h-2.5 w-2.5 mr-1" />
              {showAlternative ? (isSv ? "Visa originalförslag" : "Show original") : (isSv ? "Visa alternativ version" : "Show alternative")}
            </Button>
          )}

          {/* Action buttons */}
          <div className="space-y-2">
            <Button onClick={handleApply} className="w-full text-xs h-9 gap-1.5">
              <Check className="h-3.5 w-3.5" />
              {targetSection === "profile" ? (isSv ? "Applicera på profil" : "Apply to Profile")
                : targetSection === "experience" ? (isSv ? `Applicera på ${cv.experience[targetExpIdx]?.title || "roll"}` : `Apply to ${cv.experience[targetExpIdx]?.title || "role"}`)
                : (isSv ? "Lägg till kompetenser" : "Add skills")}
            </Button>
            <Button variant="outline" onClick={onClose} className="w-full text-xs h-8">
              {isSv ? "Avbryt" : "Cancel"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
