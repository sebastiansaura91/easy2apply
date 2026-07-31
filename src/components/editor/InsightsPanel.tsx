import { useEffect, useMemo, useRef, useState } from "react";
import { CVContent } from "@/types/cv";
import { AtsCheckResult, FirstScanIssue } from "@/types/ats-check";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { runAtsCheck } from "@/components/cv-editor/AtsCheck";
import { detectCvLanguages } from "@/lib/language-detection";
import { findCvIssues, analyzeAllBullets, CvIssue } from "@/lib/cv-quality";
import { cvScanSignature } from "@/lib/cv-signature";
import { FixIssueWizard } from "@/components/cv-editor/FixIssueWizard";
import {
  CheckCircle2, AlertTriangle, AlertOctagon, Loader2, ChevronDown, ChevronRight,
  Languages, Target, Eye, Zap, ArrowRight, Sparkles, Wrench, RefreshCw, TrendingUp, TrendingDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  cv: CVContent;
  cvLanguage: "sv" | "en";
  t: (k: any) => string;
  jobPostingText?: string;
  /** Pre-computed analysis (e.g. carried from the tailoring wizard) to show immediately. */
  initialResult?: AtsCheckResult | null;
  onApplyBullet?: (bulletPath: string, newText: string) => void;
  onNavigateToSection?: (sectionType: string) => void;
  onUpdateProfile?: (text: string) => void;
  onUpdateExperienceBullets?: (expIdx: number, bullets: string[]) => void;
  onUpdateSkills?: (skills: string[]) => void;
  /** Persist the deep score onto the CV so the same number shows everywhere and survives reloads. */
  onPersistScore?: (score: number, grade: string, subscores?: AtsCheckResult["subscores"]) => void;
  /** Persist the full analysis + input hash, so unchanged input reuses the stored result. */
  onPersistResult?: (hash: string, result: AtsCheckResult) => void;
  /** Scan automatically on mount (opening "Improve" runs everything — no extra click). */
  autoRun?: boolean;
}

interface SinceLast {
  overall: number;
  subs: { label: string; delta: number }[];
  resolved: string[];
}

function severityIcon(severity: CvIssue["severity"]) {
  switch (severity) {
    case "error": return <AlertOctagon className="h-4 w-4 text-destructive flex-shrink-0" />;
    case "warning": return <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />;
    case "tip": return <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />;
  }
}

function severityBorder(severity: CvIssue["severity"]) {
  switch (severity) {
    case "error": return "border-destructive/30 bg-destructive/5";
    case "warning": return "border-warning/30 bg-warning/5";
    case "tip": return "border-primary/20 bg-primary/5";
  }
}

export function InsightsPanel({
  cv, cvLanguage, t, jobPostingText, initialResult, onApplyBullet, onNavigateToSection,
  onUpdateProfile, onUpdateExperienceBullets, onUpdateSkills, onPersistScore, onPersistResult, autoRun,
}: Props) {
  const { toast } = useToast();
  // Restore the stored full analysis so buckets are populated from the start.
  const stored = cv.__meta?.lastAtsResult;
  const [deepResult, setDeepResult] = useState<AtsCheckResult | null>(
    initialResult ?? ((stored?.result as AtsCheckResult) ?? null)
  );
  const [loading, setLoading] = useState(false);
  const [jobText, setJobText] = useState(jobPostingText || "");
  const [showJob, setShowJob] = useState(false);
  const [fixingIssue, setFixingIssue] = useState<FirstScanIssue | null>(null);
  const [analyzedSnapshot, setAnalyzedSnapshot] = useState<string | null>(!initialResult && stored ? stored.hash : null);
  const [analyzedAt, setAnalyzedAt] = useState<Date | null>(null);
  const [lastDelta, setLastDelta] = useState<number | null>(null);
  const [sinceLast, setSinceLast] = useState<SinceLast | null>(null);
  const [openBuckets, setOpenBuckets] = useState<Set<string>>(new Set(["keywords"]));
  const toggleBucket = (k: string) =>
    setOpenBuckets(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  // Minimal keyword placements: which bullet to touch and the 1–2-word swap to make.
  interface Placement { keyword: string; exp_index: number; bullet_index: number; original: string; revised: string; note: string }
  const [placing, setPlacing] = useState(false);
  const [placements, setPlacements] = useState<Placement[] | null>(null);
  const [appliedPlacements, setAppliedPlacements] = useState<Set<number>>(new Set());
  // Credibility gate: the user confirms per keyword whether they actually have it,
  // BEFORE anything is placed into the CV. "yes" → placeable; "no" → honest omission.
  const [kwConfirm, setKwConfirm] = useState<Record<string, "yes" | "no">>({});
  // Interview mode: the app asks one verification question per missing keyword and the
  // answers become the evidence for truthful placements (or honest omission).
  interface KwQuestion { keyword: string; question: string }
  interface NewBullet { keyword: string; exp_index: number; bullet: string; note: string }
  const [kwQuestions, setKwQuestions] = useState<KwQuestion[] | null>(null);
  const [kwAnswers, setKwAnswers] = useState<Record<string, string>>({});
  const [loadingQ, setLoadingQ] = useState(false);
  const [newBullets, setNewBullets] = useState<NewBullet[] | null>(null);
  const [appliedNew, setAppliedNew] = useState<Set<number>>(new Set());
  const cycleKw = (k: string) =>
    setKwConfirm(prev => {
      const cur = prev[k];
      const next = { ...prev };
      if (cur === undefined) next[k] = "yes";
      else if (cur === "yes") next[k] = "no";
      else delete next[k];
      return next;
    });
  const [autoFixingIdx, setAutoFixingIdx] = useState<number | null>(null);
  const [autoFixPreview, setAutoFixPreview] = useState<{
    issueIdx: number;
    target: "profile" | "experience" | "skills";
    targetIdx?: number;
    text: string;
    explanation: string;
  } | null>(null);
  const isSv = cvLanguage === "sv";

  // ── Real-time issues (client-side, instant) ──
  const issues = useMemo(() => findCvIssues(cv, cvLanguage), [cv, cvLanguage]);
  const errorCount = issues.filter(i => i.severity === "error").length;
  const warningCount = issues.filter(i => i.severity === "warning").length;

  // Bullet quality
  const bulletAnalysis = useMemo(() => analyzeAllBullets(cv, cvLanguage), [cv, cvLanguage]);
  const weakBullets = bulletAnalysis.filter(b => b.score === "weak").length;
  const goodBullets = bulletAnalysis.filter(b => b.score === "good").length;
  const totalBullets = bulletAnalysis.length;

  // Language check
  const langCheck = useMemo(() => detectCvLanguages(cv, cvLanguage), [cv, cvLanguage]);
  const mismatchSections = langCheck.detected_sections.filter(s => s.language !== "unknown" && s.language !== cvLanguage && s.confidence > 0.5);

  // The local heuristic score was removed: it produced a second, conflicting number.
  // The panel shows only the deep ATS score (live or persisted on the CV).

  // Stale detection — has the CV changed since last analysis? __meta is excluded so
  // persisting the analysis itself never marks the result stale.
  const cvSignature = useMemo(() => cvScanSignature(cv, jobText), [cv, jobText]);
  const isStale = !!deepResult && analyzedSnapshot !== null && analyzedSnapshot !== cvSignature;

  const runDeep = async (opts?: { silent?: boolean }) => {
    // Stability by construction: the model isn't perfectly deterministic even at
    // temperature 0, so if nothing changed since the stored analysis, reuse it.
    if (cv.__meta?.lastAtsResult?.hash === cvSignature && deepResult) {
      setAnalyzedSnapshot(cvSignature);
      if (!opts?.silent) toast({
        title: isSv ? "Inget har ändrats" : "Nothing changed",
        description: isSv ? "Samma underlag ger samma resultat — visar den sparade analysen." : "Same input gives the same result — showing the stored analysis.",
      });
      return;
    }
    setLoading(true);
    // Previous state to diff against: the in-session result, else the score persisted on the CV.
    const prevFull = deepResult;
    const prevPersisted = cv.__meta?.lastAtsScore;
    const prevScore = prevFull?.overall_score ?? prevPersisted?.score ?? null;
    const prevSubs = prevFull?.subscores ?? prevPersisted?.subscores ?? null;
    try {
      const { data, error } = await supabase.functions.invoke("ats-check", {
        body: { resume_content_json: cv, job_posting_text: jobText.trim() || undefined, locale: cvLanguage },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const newResult = data as AtsCheckResult;
      setDeepResult(newResult);
      onPersistScore?.(Math.round(newResult.overall_score), newResult.grade, newResult.subscores);
      onPersistResult?.(cvSignature, newResult);
      setAnalyzedSnapshot(cvSignature);
      setAnalyzedAt(new Date());
      if (prevScore !== null) {
        const delta = Math.round(newResult.overall_score - prevScore);
        setLastDelta(delta);
        // What improved: per-subscore deltas + issues that disappeared since last scan.
        const subLabels: [keyof AtsCheckResult["subscores"], string][] = [
          ["parse", "Parse"], ["scanability", "Scan"], ["relevance", isSv ? "Relevans" : "Relevance"], ["evidence", isSv ? "Evidens" : "Evidence"],
        ];
        const subs = prevSubs
          ? subLabels.map(([k, label]) => ({ label, delta: Math.round(newResult.subscores[k] - prevSubs[k]) })).filter(s => s.delta !== 0)
          : [];
        const resolved = prevFull
          ? prevFull.first_scan_issues.map(i => i.title).filter(t => !newResult.first_scan_issues.some(n => n.title === t))
          : [];
        setSinceLast({ overall: delta, subs, resolved });
        const sign = delta > 0 ? "+" : "";
        toast({
          title: isSv ? "Analys uppdaterad" : "Analysis updated",
          description: delta === 0
            ? (isSv ? "Inget poängskifte" : "No score change")
            : `${sign}${delta} ${isSv ? "jämfört med förra" : "vs previous"}`,
        });
      } else {
        setLastDelta(null);
        setSinceLast(null);
      }
    } catch (e: any) {
      toast({ title: "Analysis failed", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  // Opening "Improve" scans everything once — cached results short-circuit for free.
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (!autoRun || autoRanRef.current || loading) return;
    autoRanRef.current = true;
    if (!deepResult || isStale) runDeep({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun]);

  const scoreColor = (s: number) => s >= 80 ? "text-green-600" : s >= 60 ? "text-warning" : "text-destructive";

  const canFix = !!onUpdateProfile && !!onUpdateExperienceBullets && !!onUpdateSkills;

  // ── Heuristic: infer target section from issue text ──
  const inferTarget = (issue: FirstScanIssue): { target: "profile" | "experience" | "skills"; targetIdx?: number } => {
    const haystack = `${issue.title} ${issue.why_it_matters} ${issue.fix}`.toLowerCase();
    const skillsKw = ["skill", "kompeten", "färdighet", "keyword", "nyckelord", "tech stack", "teknik"];
    const expKw = ["bullet", "punkt", "experience", "erfarenhet", "role", "roll", "achievement", "resultat", "outcome", "metric", "mätbar", "quantif", "siffr"];
    const profileKw = ["profile", "profil", "summary", "sammanfattning", "headline", "rubrik", "objective"];
    if (skillsKw.some(k => haystack.includes(k))) return { target: "skills" };
    if (profileKw.some(k => haystack.includes(k))) return { target: "profile" };
    if (expKw.some(k => haystack.includes(k)) && cv.experience.length > 0) return { target: "experience", targetIdx: 0 };
    // Default: profile if exists, else first experience, else skills
    if (cv.profile || cv.experience.length === 0) return { target: "profile" };
    return { target: "experience", targetIdx: 0 };
  };

  const runAutoFix = async (issue: FirstScanIssue, issueIdx: number) => {
    if (!canFix) return;
    setAutoFixingIdx(issueIdx);
    setAutoFixPreview(null);
    const { target, targetIdx } = inferTarget(issue);
    try {
      const { data, error } = await supabase.functions.invoke("fix-issue", {
        body: {
          issue, cv, job_posting_text: jobText || jobPostingText,
          answers: [],
          target_section: target,
          target_index: targetIdx,
          locale: cvLanguage,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAutoFixPreview({
        issueIdx,
        target,
        targetIdx,
        text: data.suggestion_text,
        explanation: data.explanation,
      });
    } catch (e: any) {
      toast({ title: isSv ? "Auto-fix misslyckades" : "Auto-fix failed", description: e.message, variant: "destructive" });
    } finally {
      setAutoFixingIdx(null);
    }
  };

  const applyAutoFix = () => {
    if (!autoFixPreview) return;
    const { target, targetIdx, text } = autoFixPreview;
    // The CV is plain text — strip any markdown/bullet characters the AI might emit
    // so they never end up printed literally in the PDF.
    const clean = (s: string) => s.replace(/\*\*|__|`|^#+\s*/g, "").replace(/^[•*\-–]\s*/, "").trim();
    if (target === "profile") {
      onUpdateProfile?.(clean(text));
      onNavigateToSection?.("profile");
    } else if (target === "experience" && targetIdx !== undefined) {
      const newBullets = text.split("\n").map(clean).filter(b => b.length > 0);
      const existing = cv.experience[targetIdx]?.bullets || [];
      const merged = [...existing, ...newBullets.filter(nb => !existing.includes(nb))];
      onUpdateExperienceBullets?.(targetIdx, merged);
      onNavigateToSection?.("experience");
    } else if (target === "skills") {
      // Grouped lines ("Category: a, b, c") stay as ONE entry — the research-backed
      // grouped-skills pattern; plain lines are split on commas as before.
      const newSkills = text.split("\n").map(clean).filter(Boolean).flatMap(line =>
        line.includes(":") ? [line] : line.split(",").map(s => s.trim()).filter(Boolean)
      );
      if (newSkills.length > 0) onUpdateSkills?.(newSkills);
      onNavigateToSection?.("skills");
    }
    toast({ title: isSv ? "✅ Fix applicerad" : "✅ Fix applied" });
    setAutoFixPreview(null);
  };

  // ── ATS buckets: group every finding by the kind of fix it needs ──
  type BucketKey = "keywords" | "bullets" | "formatting" | "language" | "other";
  const catOf = (txt: string): BucketKey => {
    const s = txt.toLowerCase();
    if (/keyword|nyckelord|phrase|fras|terminolog/.test(s)) return "keywords";
    if (/bullet|punkt|metric|siffr|quantif|mätbar|verb|achievement|resultat/.test(s)) return "bullets";
    if (/language|språk|spell|stav|grammar|grammatik/.test(s)) return "language";
    if (/format|layout|kolumn|column|datum|date|struktur|structure|sektion|section|parse|överlapp|overlap|kontakt|contact|längd|length|sida|page/.test(s)) return "formatting";
    return "other";
  };
  const localBy: Record<BucketKey, CvIssue[]> = { keywords: [], bullets: [], formatting: [], language: [], other: [] };
  issues.forEach(i => localBy[catOf(`${i.id} ${i.title} ${i.description}`)].push(i));
  const deepIssues = (deepResult?.first_scan_issues ?? []).map((iss, i) => ({ iss, i, cat: catOf(`${iss.title} ${iss.why_it_matters} ${iss.fix}`) }));
  const deepBy = (k: BucketKey) => deepIssues.filter(d => d.cat === k);
  const scanFails = deepResult ? [...deepResult.scanability_check, ...deepResult.parse_check].filter(c => c.status !== "pass") : [];
  // Recruiter lens: competence themes with supporting terms. missingKw = the union of
  // every genuinely-missing term (flat list kept as fallback + for the interview flow).
  const themes = deepResult?.job_language_match?.competence_themes ?? [];
  const missingKw = Array.from(new Set([
    ...(deepResult?.job_language_match.missing_phrases ?? []),
    ...themes.flatMap(t => t.supporting_terms_missing || []),
  ].map(s => s.trim()).filter(Boolean)));
  const unthemedKw = missingKw.filter(p => !themes.some(t => (t.supporting_terms_missing || []).includes(p)));
  const genericKw = deepResult?.job_language_match.generic_phrases_to_replace ?? [];
  const weakFeedback = (deepResult?.bullet_feedback ?? []).filter(b => b.score < 7);

  const runPlacements = async (phrases: string[], evidence?: { keyword: string; answer: string }[]) => {
    setPlacing(true);
    setPlacements(null);
    setNewBullets(null);
    setAppliedPlacements(new Set());
    setAppliedNew(new Set());
    try {
      const { data, error } = await supabase.functions.invoke("place-keywords", {
        body: { resume_content_json: cv, missing_phrases: phrases, locale: cvLanguage, evidence },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPlacements(data.placements || []);
      setNewBullets(data.new_bullets || []);
      if (!(data.placements || []).length && !(data.new_bullets || []).length) {
        toast({ title: isSv ? "Ingen ärlig placering hittades" : "No honest placement found", description: isSv ? "Inga punkter kan ta nyckelorden utan att ändra innehållet." : "No bullet can take the keywords without changing its claim." });
      }
    } catch (e: any) {
      toast({ title: isSv ? "Placering misslyckades" : "Placement failed", description: e.message, variant: "destructive" });
    } finally { setPlacing(false); }
  };

  // Interview flow: fetch one verification question per unconfirmed keyword — AND per
  // competence theme lacking evidence ("Har du drivit transformationsarbete?"), since
  // recruiters screen buckets first and terms second.
  const fetchQuestions = async () => {
    const weakThemes = themes
      .filter(t => t.evidence !== "strong" && !kwConfirm[t.theme])
      .map(t => t.theme);
    const unknowns = Array.from(new Set([...weakThemes, ...missingKw.filter(p => !kwConfirm[p])]));
    if (!unknowns.length) return;
    setLoadingQ(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-keywords", {
        body: { resume_content_json: cv, missing_phrases: unknowns, locale: cvLanguage },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setKwQuestions(data.questions || []);
      if (!(data.questions || []).length) toast({ title: isSv ? "Inga frågor kunde skapas" : "No questions could be generated" });
    } catch (e: any) {
      toast({ title: isSv ? "Kunde inte skapa frågor" : "Couldn't generate questions", description: e.message, variant: "destructive" });
    } finally { setLoadingQ(false); }
  };

  const dismissQuestion = (keyword: string) => {
    setKwConfirm(prev => ({ ...prev, [keyword]: "no" }));
    setKwQuestions(prev => (prev || []).filter(q => q.keyword !== keyword));
  };

  const submitAnswers = () => {
    const answered = (kwQuestions || []).filter(q => (kwAnswers[q.keyword] || "").trim().length > 2);
    if (!answered.length) return;
    setKwConfirm(prev => {
      const next = { ...prev };
      answered.forEach(q => { next[q.keyword] = "yes"; });
      return next;
    });
    const evidence = answered.map(q => ({ keyword: q.keyword, answer: kwAnswers[q.keyword].trim() }));
    const tapped = missingKw.filter(p => kwConfirm[p] === "yes" && !evidence.some(e => e.keyword === p));
    setKwQuestions(null);
    runPlacements([...tapped, ...evidence.map(e => e.keyword)], evidence);
  };

  const applyNewBullet = (nb: NewBullet, idx: number) => {
    const exp = cv.experience[nb.exp_index];
    if (!exp) return;
    onUpdateExperienceBullets?.(nb.exp_index, [...exp.bullets, nb.bullet]);
    setAppliedNew(prev => new Set(prev).add(idx));
    toast({ title: isSv ? "Ny punkt tillagd — sparas i CV:t" : "New bullet added — saved to the CV" });
  };

  const applyPlacement = (p: Placement, idx: number) => {
    const bullets = cv.experience[p.exp_index]?.bullets;
    if (!bullets || (bullets[p.bullet_index] || "").trim().toLowerCase() !== p.original.trim().toLowerCase()) {
      toast({ title: isSv ? "Punkten har ändrats" : "That bullet has changed", description: isSv ? "Kör placeringen igen." : "Re-run the placement.", variant: "destructive" });
      return;
    }
    const next = [...bullets];
    next[p.bullet_index] = p.revised;
    onUpdateExperienceBullets?.(p.exp_index, next);
    setAppliedPlacements(prev => new Set(prev).add(idx));
    toast({ title: isSv ? "Nyckelord inlagt — sparas i CV:t" : "Keyword placed — saved to the CV" });
  };

  const bucketCounts: Record<BucketKey, number> = {
    keywords: missingKw.length + genericKw.length + localBy.keywords.length + deepBy("keywords").length,
    bullets: weakBullets + weakFeedback.length + localBy.bullets.length + deepBy("bullets").length,
    formatting: scanFails.length + localBy.formatting.length + deepBy("formatting").length,
    language: mismatchSections.length + localBy.language.length + deepBy("language").length,
    other: localBy.other.length + deepBy("other").length,
  };

  // Auto-expand any bucket that has findings (the user can still collapse it manually;
  // it only re-opens when its count changes).
  const countsKey = (Object.keys(bucketCounts) as BucketKey[]).map(k => `${k}:${bucketCounts[k]}`).join("|");
  useEffect(() => {
    setOpenBuckets(prev => {
      const n = new Set(prev);
      (Object.keys(bucketCounts) as BucketKey[]).forEach(k => { if (bucketCounts[k] > 0) n.add(k); });
      return n;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countsKey]);

  // ── Fix issue wizard overlay ──
  if (fixingIssue && canFix) {
    return (
      <div className="p-4">
        <FixIssueWizard
          issue={fixingIssue}
          cv={cv}
          cvLanguage={cvLanguage}
          jobPostingText={jobText || jobPostingText}
          onApplyToProfile={onUpdateProfile}
          onApplyToExperience={onUpdateExperienceBullets}
          onApplyToSkills={onUpdateSkills}
          onClose={() => setFixingIssue(null)}
          onNavigateToSection={onNavigateToSection}
        />
      </div>
    );
  }

  const renderLocalIssue = (issue: CvIssue) => (
    <button
      key={issue.id}
      className={`w-full text-left rounded-lg border p-3 space-y-1 transition-colors hover:shadow-sm ${severityBorder(issue.severity)}`}
      onClick={() => onNavigateToSection?.(issue.section)}
    >
      <div className="flex items-start gap-2">
        {severityIcon(issue.severity)}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold">{issue.title}</p>
          <p className="text-[10px] text-muted-foreground leading-relaxed">{issue.description}</p>
          <p className="text-[10px] font-medium text-primary mt-1 flex items-center gap-1">
            <ArrowRight className="h-2.5 w-2.5" /> {issue.fix}
          </p>
        </div>
      </div>
    </button>
  );

  const renderDeepIssue = (issue: FirstScanIssue, i: number) => (
    <div key={`d${i}`} className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-2">
      <p className="text-xs font-bold">{issue.title}</p>
      <p className="text-[10px] text-muted-foreground leading-relaxed">{issue.why_it_matters}</p>
      <p className="text-[10px] font-medium text-primary flex items-center gap-1">
        <ArrowRight className="h-2.5 w-2.5" /> {issue.fix}
      </p>
      {canFix && (
        autoFixPreview?.issueIdx === i ? (
          <div className="space-y-2 mt-1 rounded-md border border-primary/30 bg-background p-2">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-primary flex items-center gap-1">
              <Sparkles className="h-2.5 w-2.5" />
              {isSv ? "Förslag" : "Suggestion"} →{" "}
              {autoFixPreview.target === "profile" ? (isSv ? "Profil" : "Profile")
                : autoFixPreview.target === "skills" ? (isSv ? "Kompetenser" : "Skills")
                : (cv.experience[autoFixPreview.targetIdx ?? 0]?.title || "Experience")}
            </span>
            <Textarea
              value={autoFixPreview.text}
              onChange={e => setAutoFixPreview(p => p ? { ...p, text: e.target.value } : p)}
              rows={4}
              className="text-[10px] leading-relaxed"
            />
            <p className="text-[9px] text-muted-foreground italic">{autoFixPreview.explanation}</p>
            <div className="flex gap-1.5">
              <Button size="sm" className="flex-1 h-9 text-[10px] gap-1" onClick={applyAutoFix}>
                <CheckCircle2 className="h-3 w-3" />{isSv ? "Applicera" : "Apply"}
              </Button>
              <Button variant="ghost" size="sm" className="h-9 text-[10px]" onClick={() => setAutoFixPreview(null)}>
                {isSv ? "Avbryt" : "Cancel"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-1.5 mt-1">
            <Button variant="default" size="sm" className="flex-1 h-9 text-[10px] gap-1.5" disabled={autoFixingIdx !== null} onClick={() => runAutoFix(issue, i)}>
              {autoFixingIdx === i ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
              {autoFixingIdx === i ? (isSv ? "Fixar..." : "Fixing...") : (isSv ? "Auto-fixa" : "Auto-fix")}
            </Button>
            <Button variant="outline" size="sm" className="h-9 text-[10px] gap-1" onClick={() => setFixingIssue(issue)}>
              <Wrench className="h-3 w-3" />{isSv ? "Anpassa" : "Refine"}
            </Button>
          </div>
        )
      )}
    </div>
  );

  const buckets: { key: BucketKey; title: string; count: number; body: React.ReactNode }[] = [
    {
      key: "keywords",
      title: isSv ? "Nyckelord" : "Keywords",
      count: missingKw.length + genericKw.length + localBy.keywords.length + deepBy("keywords").length,
      body: (
        <>
          {missingKw.length > 0 && (
            <div className="space-y-1.5">
              {(() => {
                const kwChip = (p: string) => {
                  const s = kwConfirm[p];
                  return (
                    <button key={p} type="button" onClick={() => cycleKw(p)}
                      className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[10px] font-medium transition-colors ${
                        s === "yes" ? "border-green-600/40 bg-green-600/10 text-green-700 dark:text-green-500"
                        : s === "no" ? "border-border text-muted-foreground line-through opacity-60"
                        : "border-destructive/40 bg-destructive/5 text-destructive"
                      }`}>
                      {s === "yes" ? "✓" : s === "no" ? "✕" : "?"} {p}
                    </button>
                  );
                };
                const evidenceBadge = (e: string) =>
                  e === "strong"
                    ? <span className="rounded-full bg-green-600/10 px-2 py-0.5 text-[9px] font-semibold text-green-700 dark:text-green-500">{isSv ? "Stark evidens" : "Strong evidence"}</span>
                    : e === "partial"
                      ? <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[9px] font-semibold text-warning">{isSv ? "Delvis" : "Partial"}</span>
                      : <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[9px] font-semibold text-destructive">{isSv ? "Saknar evidens" : "No evidence"}</span>;
                return (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {themes.length > 0 ? (isSv ? "Kompetensområden rollen screenar på" : "Competence areas the role screens for") : (isSv ? "Saknade nyckelord" : "Missing keywords")}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {isSv ? "Tryck på varje ord: ✓ = jag har detta på riktigt · ✕ = har inte (utelämnas ärligt)." : "Tap each word: ✓ = I genuinely have this · ✕ = I don't (honestly omitted)."}
                    </p>
                    {themes.length > 0 ? (
                      <div className="space-y-2">
                        {themes.map((th, i) => (
                          <div key={i} className={`rounded-lg border p-2.5 space-y-1.5 ${th.importance === "must" && th.evidence === "missing" ? "border-destructive/30" : "border-border"}`}>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-semibold">{th.theme}</span>
                              {th.importance === "must" && (
                                <span className="rounded-full border border-border px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">{isSv ? "Krav" : "Must"}</span>
                              )}
                              {evidenceBadge(th.evidence)}
                            </div>
                            <p className="text-[10px] leading-relaxed text-muted-foreground">{th.evidence_note}</p>
                            {(th.supporting_terms_present || []).length > 0 && (
                              <p className="text-[10px] text-green-700 dark:text-green-500">✓ {th.supporting_terms_present.join(" · ")}</p>
                            )}
                            {(th.supporting_terms_missing || []).length > 0 && (
                              <div className="flex flex-wrap gap-1">{th.supporting_terms_missing.map(kwChip)}</div>
                            )}
                          </div>
                        ))}
                        {unthemedKw.length > 0 && <div className="flex flex-wrap gap-1">{unthemedKw.map(kwChip)}</div>}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1">{missingKw.map(kwChip)}</div>
                    )}
                  </>
                );
              })()}
              {Object.values(kwConfirm).filter(v => v === "no").length > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {isSv
                    ? `${Object.values(kwConfirm).filter(v => v === "no").length} markerade som "har inte" — de läggs aldrig in. Ärlighet slår nyckelord.`
                    : `${Object.values(kwConfirm).filter(v => v === "no").length} marked "don't have" — never inserted. Honesty beats keywords.`}
                </p>
              )}
              {canFix && !kwQuestions && (() => {
                const confirmed = missingKw.filter(p => kwConfirm[p] === "yes");
                const unknowns = missingKw.filter(p => !kwConfirm[p]);
                return (
                  <div className="mt-1 space-y-1.5">
                    {unknowns.length > 0 && (
                      <Button variant="default" size="sm" className="h-9 w-full text-xs" onClick={fetchQuestions} disabled={loadingQ || placing}>
                        {loadingQ ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wrench className="mr-1.5 h-3.5 w-3.5" />}
                        {loadingQ ? (isSv ? "Skapar frågor…" : "Creating questions…") : (isSv ? `Fråga mig om ${unknowns.length} nyckelord` : `Ask me about ${unknowns.length} keywords`)}
                      </Button>
                    )}
                    {confirmed.length > 0 && (
                      <Button variant="outline" size="sm" className="h-9 w-full text-xs"
                        onClick={() => runPlacements(confirmed)} disabled={placing}>
                        {placing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                        {placing ? (isSv ? "Letar placeringar…" : "Finding placements…") : (isSv ? `Placera ${confirmed.length} bekräftade nyckelord` : `Place ${confirmed.length} confirmed keywords`)}
                      </Button>
                    )}
                  </div>
                );
              })()}
              {kwQuestions && kwQuestions.length > 0 && (
                <div className="space-y-2 pt-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {isSv ? "Har du detta? Svara kort — dina svar blir underlaget." : "Do you have this? Answer briefly — your answers become the evidence."}
                  </p>
                  {kwQuestions.map(q => (
                    <div key={q.keyword} className="rounded-lg border border-border p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="secondary" className="text-[9px] h-5">{q.keyword}</Badge>
                        <button type="button" className="text-[10px] text-muted-foreground underline-offset-2 hover:underline" onClick={() => dismissQuestion(q.keyword)}>
                          {isSv ? "Har inte" : "Don't have it"}
                        </button>
                      </div>
                      <p className="text-xs leading-relaxed">{q.question}</p>
                      <Textarea
                        rows={2}
                        value={kwAnswers[q.keyword] || ""}
                        onChange={e => setKwAnswers(prev => ({ ...prev, [q.keyword]: e.target.value }))}
                        placeholder={isSv ? "T.ex. vilket system, din roll, resultatet…" : "E.g. which system, your role, the outcome…"}
                        className="text-xs"
                      />
                    </div>
                  ))}
                  <div className="flex gap-1.5">
                    <Button size="sm" className="h-9 flex-1 text-xs" onClick={submitAnswers}
                      disabled={placing || !(kwQuestions || []).some(q => (kwAnswers[q.keyword] || "").trim().length > 2)}>
                      {placing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                      {isSv ? "Skicka svar & placera" : "Submit answers & place"}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => setKwQuestions(null)} disabled={placing}>
                      {isSv ? "Avbryt" : "Cancel"}
                    </Button>
                  </div>
                </div>
              )}
              {newBullets?.map((nb, i) => (
                <div key={`nb${i}`} className="rounded-lg border border-primary/30 bg-primary/5 p-2.5 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Badge className="text-[9px] h-5">{isSv ? "NY PUNKT" : "NEW BULLET"}</Badge>
                    <Badge variant="secondary" className="text-[9px] h-5">{nb.keyword}</Badge>
                    <span className="truncate text-[10px] text-muted-foreground">{cv.experience[nb.exp_index]?.title}</span>
                  </div>
                  <p className="text-xs leading-relaxed">{nb.bullet}</p>
                  <p className="text-[9px] italic text-muted-foreground">{nb.note}</p>
                  <Button size="sm" variant={appliedNew.has(i) ? "secondary" : "outline"} className="h-9 w-full text-xs"
                    disabled={appliedNew.has(i)} onClick={() => applyNewBullet(nb, i)}>
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    {appliedNew.has(i) ? (isSv ? "Tillagd" : "Added") : (isSv ? "Lägg till" : "Add")}
                  </Button>
                </div>
              ))}
              {placements?.map((p, i) => (
                <div key={i} className="rounded-lg border border-border p-2.5 space-y-1.5">
                  <Badge variant="secondary" className="text-[9px] h-5">{p.keyword}</Badge>
                  <p className="text-[10px] text-muted-foreground line-through leading-relaxed">{p.original}</p>
                  <p className="text-xs leading-relaxed">{p.revised}</p>
                  <p className="text-[9px] italic text-muted-foreground">{p.note}</p>
                  <Button
                    size="sm"
                    variant={appliedPlacements.has(i) ? "secondary" : "outline"}
                    className="h-9 w-full text-xs"
                    disabled={appliedPlacements.has(i)}
                    onClick={() => applyPlacement(p, i)}
                  >
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    {appliedPlacements.has(i) ? (isSv ? "Inlagd" : "Applied") : (isSv ? "Använd" : "Apply")}
                  </Button>
                </div>
              ))}
            </div>
          )}
          {genericKw.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{isSv ? "Generiska fraser att byta ut" : "Generic phrases to replace"}</p>
              <div className="flex flex-wrap gap-1">{genericKw.map(p => <Badge key={p} variant="outline" className="text-[9px] h-5">{p}</Badge>)}</div>
            </div>
          )}
          {localBy.keywords.map(renderLocalIssue)}
          {deepBy("keywords").map(d => renderDeepIssue(d.iss, d.i))}
          {!deepResult && (
            <p className="text-[10px] text-muted-foreground">{isSv ? "Klistra in jobbannonsen och kör analysen för nyckelordstäckning." : "Paste the job posting and run the analysis for keyword coverage."}</p>
          )}
        </>
      ),
    },
    {
      key: "bullets",
      title: isSv ? "Svaga punkter" : "Weak bullets",
      count: weakBullets + weakFeedback.length + localBy.bullets.length + deepBy("bullets").length,
      body: (
        <>
          {totalBullets > 0 && (
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium flex items-center gap-1.5"><Target className="h-3.5 w-3.5" />{isSv ? "Punktkvalitet" : "Bullet quality"}</span>
                <span className="text-[10px] text-muted-foreground">{totalBullets} totalt</span>
              </div>
              <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-muted">
                {goodBullets > 0 && <div className="bg-green-500" style={{ width: `${(goodBullets / totalBullets) * 100}%` }} />}
                {(totalBullets - goodBullets - weakBullets) > 0 && <div className="bg-yellow-400" style={{ width: `${((totalBullets - goodBullets - weakBullets) / totalBullets) * 100}%` }} />}
                {weakBullets > 0 && <div className="bg-destructive" style={{ width: `${(weakBullets / totalBullets) * 100}%` }} />}
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[9px] text-green-600">● {goodBullets} {isSv ? "starka" : "strong"}</span>
                <span className="text-[9px] text-yellow-600">● {totalBullets - goodBullets - weakBullets} {isSv ? "okej" : "okay"}</span>
                <span className="text-[9px] text-destructive">● {weakBullets} {isSv ? "svaga" : "weak"}</span>
              </div>
            </div>
          )}
          {localBy.bullets.map(renderLocalIssue)}
          {deepBy("bullets").map(d => renderDeepIssue(d.iss, d.i))}
          {weakFeedback.map((b, i) => (
            <div key={`bf${i}`} className="text-[10px] p-2 rounded border border-border">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Badge variant={b.score < 4 ? "destructive" : "outline"} className="text-[8px] h-3.5">{b.score}/10</Badge>
                <span className="text-muted-foreground truncate">{b.bullet_id}</span>
              </div>
              <p className="text-muted-foreground">{b.recruiter_comment}</p>
              {b.suggestions.length > 0 && b.suggestions[0].rewrite && onApplyBullet && (
                <Button variant="ghost" size="sm" className="h-6 text-[9px] mt-1 text-primary" onClick={() => onApplyBullet(b.bullet_id, b.suggestions[0].rewrite)}>
                  {isSv ? "Applicera förslag" : "Apply suggestion"}
                </Button>
              )}
            </div>
          ))}
        </>
      ),
    },
    {
      key: "formatting",
      title: isSv ? "Formatering & struktur" : "Formatting & structure",
      count: scanFails.length + localBy.formatting.length + deepBy("formatting").length,
      body: (
        <>
          {scanFails.map((c, i) => (
            <div key={`sf${i}`} className={`rounded-lg border p-3 ${severityBorder(c.status === "fail" ? "error" : "warning")}`}>
              <p className="text-xs font-semibold">{c.dimension.replace(/_/g, " ")}</p>
              <p className="text-[10px] text-muted-foreground leading-relaxed">{c.why_it_matters}</p>
              <p className="text-[10px] font-medium text-primary mt-1">→ {c.recommendation}</p>
            </div>
          ))}
          {localBy.formatting.map(renderLocalIssue)}
          {deepBy("formatting").map(d => renderDeepIssue(d.iss, d.i))}
        </>
      ),
    },
    {
      key: "language",
      title: isSv ? "Språk & stavning" : "Language & spelling",
      count: mismatchSections.length + localBy.language.length + deepBy("language").length,
      body: (
        <>
          {mismatchSections.length > 0 && (
            <div className={`rounded-lg border p-3 ${severityBorder("warning")}`}>
              <div className="flex items-center gap-2 mb-1">
                <Languages className="h-3.5 w-3.5 text-warning" />
                <span className="text-xs font-semibold">{isSv ? "Blandade språk" : "Mixed languages"}</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {isSv
                  ? `${mismatchSections.length} sektion(er) verkar vara på fel språk: ${mismatchSections.map(s => s.section).join(", ")}`
                  : `${mismatchSections.length} section(s) appear to be in the wrong language: ${mismatchSections.map(s => s.section).join(", ")}`}
              </p>
              <p className="text-[10px] font-medium text-primary mt-1">→ {isSv ? "Använd 'Konvertera alla' i verktygsfältet" : "Use 'Convert all' in the toolbar"}</p>
            </div>
          )}
          {localBy.language.map(renderLocalIssue)}
          {deepBy("language").map(d => renderDeepIssue(d.iss, d.i))}
        </>
      ),
    },
    {
      key: "other",
      title: isSv ? "Övrigt" : "Other",
      count: localBy.other.length + deepBy("other").length,
      body: (
        <>
          {localBy.other.map(renderLocalIssue)}
          {deepBy("other").map(d => renderDeepIssue(d.iss, d.i))}
        </>
      ),
    },
  ];

  return (
    <div className="p-4 space-y-4">
      {/* ── Health overview ── */}
      <div className="text-center pb-3 border-b border-border">
        {deepResult ? (
          <>
            <div className={`font-serif text-4xl font-medium ${scoreColor(deepResult.overall_score)}`}>{Math.round(deepResult.overall_score)}</div>
            <p className={`text-xs font-semibold ${scoreColor(deepResult.overall_score)}`}>{isSv ? "Betyg" : "Grade"} {deepResult.grade}</p>
          </>
        ) : cv.__meta?.lastAtsScore ? (
          <>
            <div className={`font-serif text-4xl font-medium ${scoreColor(cv.__meta.lastAtsScore.score)}`}>{cv.__meta.lastAtsScore.score}</div>
            <p className="text-xs font-semibold text-muted-foreground">
              {isSv ? "Senaste analys" : "Last analysis"} · {isSv ? "betyg" : "grade"} {cv.__meta.lastAtsScore.grade}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{isSv ? "Ingen analys körd än." : "No analysis run yet."}</p>
        )}
        {/* What changed since the previous scan */}
        {sinceLast && (
          <div className="mt-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {isSv ? "Sedan förra analysen" : "Since last scan"}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className={`text-xs font-semibold ${sinceLast.overall > 0 ? "text-green-600" : sinceLast.overall < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                {sinceLast.overall > 0 ? "+" : ""}{sinceLast.overall} {isSv ? "totalt" : "overall"}
              </span>
              {sinceLast.subs.map(s => (
                <span key={s.label} className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${s.delta > 0 ? "border-green-200 text-green-600" : "border-destructive/30 text-destructive"}`}>
                  {s.label} {s.delta > 0 ? "+" : ""}{s.delta}
                </span>
              ))}
            </div>
            {sinceLast.resolved.length > 0 && (
              <p className="mt-1.5 text-[11px] text-green-700 dark:text-green-500">
                ✓ {isSv ? "Lösta problem:" : "Resolved:"} {sinceLast.resolved.join(" · ")}
              </p>
            )}
          </div>
        )}
        <div className="flex justify-center gap-3 mt-2">
          {errorCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-destructive">
              <AlertOctagon className="h-3 w-3" /> {errorCount} {isSv ? "kritiska" : "critical"}
            </span>
          )}
          {warningCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-warning">
              <AlertTriangle className="h-3 w-3" /> {warningCount} {isSv ? "varningar" : "warnings"}
            </span>
          )}
          {errorCount === 0 && warningCount === 0 && (
            <span className="flex items-center gap-1 text-[10px] text-green-600">
              <CheckCircle2 className="h-3 w-3" /> {isSv ? "Inga problem hittade" : "No issues found"}
            </span>
          )}
        </div>
      </div>

      {/* ── What to fix: ATS buckets ── */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {isSv ? "Vad du bör åtgärda" : "What to fix"}
        </p>
        {buckets.map(b => (
          <Collapsible key={b.key} open={openBuckets.has(b.key)} onOpenChange={() => toggleBucket(b.key)}>
            <CollapsibleTrigger asChild>
              <button className="flex h-11 w-full items-center justify-between rounded-lg border border-border px-3 text-left transition-colors hover:bg-accent/50">
                <span className="flex items-center gap-2 text-xs font-semibold">
                  {openBuckets.has(b.key) ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  {b.title}
                </span>
                {b.count > 0 ? (
                  <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold text-warning">{b.count}</span>
                ) : deepResult ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                ) : (
                  <span className="text-[10px] text-muted-foreground">—</span>
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">
              {b.count > 0 || b.key === "keywords" ? b.body : deepResult ? (
                <p className="px-1 text-[10px] text-muted-foreground">{isSv ? "Inga problem hittade." : "No issues found."}</p>
              ) : (
                <p className="px-1 text-[10px] text-muted-foreground">{isSv ? "Kör analysen för att fylla i detaljerna." : "Run the analysis to populate details."}</p>
              )}
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>

      {/* ── Job posting context ── */}
      <Collapsible open={showJob} onOpenChange={setShowJob}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-between h-9 text-xs">
            <span>{isSv ? "Jobbannons (för bättre analys)" : "Job posting (for better analysis)"}</span>
            {showJob ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <Textarea rows={4} value={jobText} onChange={e => setJobText(e.target.value)} placeholder={isSv ? "Klistra in jobbannons..." : "Paste a job posting..."} className="text-xs" />
        </CollapsibleContent>
      </Collapsible>

      {/* ── Deep analysis CTA ── */}
      <Button
        onClick={() => runDeep()}
        disabled={loading}
        className="w-full text-xs h-9"
        variant={deepResult ? (isStale ? "default" : "outline") : "default"}
      >
        {loading
          ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          : deepResult
            ? <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isStale ? "animate-pulse" : ""}`} />
            : <Eye className="h-3.5 w-3.5 mr-1.5" />}
        {loading
          ? (isSv ? "Analyserar..." : "Analyzing...")
          : deepResult
            ? (isStale
                ? (isSv ? "Analysera om — du har gjort ändringar" : "Re-analyze — you've made changes")
                : (isSv ? "Kör djupanalys igen" : "Re-run deep analysis"))
            : (isSv ? "Se hur ditt CV presterar" : "See how your CV performs")}
      </Button>

      {/* ── Re-analyze status bar ── */}
      {deepResult && analyzedAt && !loading && (
        <div className={`flex items-center justify-between text-[10px] px-2 py-1.5 rounded-md ${
          isStale ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground"
        }`}>
          <span className="flex items-center gap-1">
            {isStale
              ? (isSv ? "Resultat är inaktuella" : "Results are out of date")
              : (isSv ? `Analyserad ${analyzedAt.toLocaleTimeString()}` : `Analyzed ${analyzedAt.toLocaleTimeString()}`)}
          </span>
          {lastDelta !== null && lastDelta !== 0 && (
            <span className={`flex items-center gap-0.5 font-semibold ${lastDelta > 0 ? "text-green-600" : "text-destructive"}`}>
              {lastDelta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {lastDelta > 0 ? "+" : ""}{lastDelta}
            </span>
          )}
        </div>
      )}

      {/* ── Deep results ── */}
      {deepResult && (
        <div className="space-y-3 pt-3 border-t border-border">
          <p className="text-[11px] text-muted-foreground leading-relaxed">{deepResult.summary}</p>

          <div className="space-y-1.5">
            {([["Parse", deepResult.subscores.parse, 30], ["Scan", deepResult.subscores.scanability, 30], [isSv ? "Relevans" : "Relevance", deepResult.subscores.relevance, 25], [isSv ? "Evidens" : "Evidence", deepResult.subscores.evidence, 15]] as const).map(([l, v, m]) => (
              <div key={l} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-16">{l}</span>
                <Progress value={(v / m) * 100} className="h-1.5 flex-1" />
                <span className="text-[10px] font-semibold w-10 text-right">{v}/{m}</span>
              </div>
            ))}
          </div>

        </div>
      )}
    </div>
  );
}
