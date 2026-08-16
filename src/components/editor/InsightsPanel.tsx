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
import { RoleFitResult, BulletReframe } from "@/types/role-fit";
import { getRoleAdvice } from "@/lib/role-advice";
import { computeMatchScore, biggestGap } from "@/lib/match-score";
import { titleMatch } from "@/lib/title-match";
import { parseYearsRequirement, yearsOfExperience } from "@/lib/experience-years";
import { collectProxyTerms, isPedigreeTerm } from "@/lib/pedigree";
import { sixSecondTest } from "@/lib/six-second";
import { adviseSkills } from "@/lib/skills-advisor";
import { estimatePages, profileCoverage, shortenTargets } from "@/lib/readiness";
import { CVMeta } from "@/types/cv";
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
  /** Merge a metadata patch into the CV (persists via autosave) — accepted gaps etc. */
  onUpdateMeta?: (patch: Partial<CVMeta>) => void;
  /** Download the PDF — surfaced in the "ready to send" success state. */
  onDownload?: () => void;
  /**
   * Cross-CV evidence lookup (name → saved verified answers from ANY CV). When a
   * competence is already verified somewhere, the question is skipped and the saved
   * answer becomes the placement evidence directly.
   */
  profileEvidence?: (name: string) => { keyword: string; answer: string }[];
  /** Apply a whole-bullet reframe — reframes are queue cards, not a separate tab. */
  onApplyReframe?: (experienceId: string, original: string, suggested: string) => boolean;
  onPersistRoleFit?: (hash: string, result: RoleFitResult) => void;
  /** Take a document snapshot right before an automatic change — powers one-step undo. */
  onSnapshot?: (label: string) => void;
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
  onUpdateProfile, onUpdateExperienceBullets, onUpdateSkills, onPersistScore, onPersistResult, autoRun, onUpdateMeta, onDownload, profileEvidence, onApplyReframe, onPersistRoleFit, onSnapshot,
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
  interface KwQuestion { keyword: string; question: string; options?: string[]; hint?: string }
  interface NewBullet { keyword: string; exp_index: number; bullet: string; note: string }
  const [kwQuestions, setKwQuestions] = useState<KwQuestion[] | null>(null);
  const [kwAnswers, setKwAnswers] = useState<Record<string, string>>({});
  // Recognition over recall: the user ticks the concrete statements that are true
  // (several allowed), then optionally adds specifics. Choices + detail = the evidence.
  const [kwChoice, setKwChoice] = useState<Record<string, string[]>>({});
  // Which of your roles the experience belongs to — files the evidence in the right
  // place in the chronological profile.
  const [kwRole, setKwRole] = useState<Record<string, string>>({});
  const roleSelect = (keyword: string, cls: string) => (
    <select value={kwRole[keyword] || ""} onChange={e => setKwRole(prev => ({ ...prev, [keyword]: e.target.value }))}
      className={`${cls} w-full rounded-md border border-input bg-background px-2 text-muted-foreground`}>
      <option value="">{isSv ? "Var hände detta? (frivilligt)" : "Where did this happen? (optional)"}</option>
      {cv.experience.filter(e => e.title || e.company).map(e => {
        const v = [e.title, e.company].filter(Boolean).join(" · ");
        return <option key={e.id} value={v}>{v}</option>;
      })}
      <option value={isSv ? "Utanför CV:t" : "Outside the CV"}>{isSv ? "Utanför rollerna i CV:t" : "Outside the CV roles"}</option>
    </select>
  );
  const toggleChoice = (k: string, opt: string) =>
    setKwChoice(prev => {
      const cur = prev[k] || [];
      return { ...prev, [k]: cur.includes(opt) ? cur.filter(o => o !== opt) : [...cur, opt] };
    });
  const [loadingQ, setLoadingQ] = useState(false);
  const [newBullets, setNewBullets] = useState<NewBullet[] | null>(null);
  const [appliedNew, setAppliedNew] = useState<Set<number>>(new Set());
  // ── Fix queue (guided mode): one card at a time; the full dashboard hides behind "Visa detaljer".
  const [showDetails, setShowDetails] = useState(false);
  const [handledThemes, setHandledThemes] = useState<Set<string>>(new Set());
  // Themes proven via answers but invisible in the CV: communication gaps, own card type.
  const [handledComm, setHandledComm] = useState<Set<string>>(new Set());
  const [dismissedPlacements, setDismissedPlacements] = useState<Set<number>>(new Set());
  const [dismissedNew, setDismissedNew] = useState<Set<number>>(new Set());
  // Whole-bullet reframes toward the target role — queue cards after the gap cards.
  const [reframes, setReframes] = useState<BulletReframe[] | null>(null);
  const [appliedReframes, setAppliedReframes] = useState<Set<number>>(new Set());
  const [dismissedReframes, setDismissedReframes] = useState<Set<number>>(new Set());
  const reframesTried = useRef(false);
  const answeredRef = useRef<{ keyword: string; answer: string }[]>([]);
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

  // Load reframes once per panel-open: the stored analysis when input is unchanged,
  // otherwise one role-fit call. They join the queue after the gap cards.
  useEffect(() => {
    if (!autoRun || reframesTried.current || !onApplyReframe) return;
    const hasRole = !!(cv.__meta?.targetRole || cv.__meta?.targetRoleLabel);
    if (!hasRole) return;
    reframesTried.current = true;
    const sig = cvScanSignature(cv, jobText) + "|role:" + (cv.__meta?.targetRole || cv.__meta?.targetRoleLabel || "");
    const stored = cv.__meta?.lastRoleFit;
    if (stored && stored.hash === sig) {
      setReframes(((stored.result as any)?.reframes || []) as BulletReframe[]);
      return;
    }
    (async () => {
      try {
        const advice = getRoleAdvice(cv.__meta?.targetRole);
        const role = advice
          ? { label: advice.label[cvLanguage], focus: advice.focus[cvLanguage], emphasize: advice.emphasize[cvLanguage], deemphasize: advice.deemphasize[cvLanguage], keywords: advice.keywords, metrics: advice.metrics[cvLanguage] }
          : { label: cv.__meta?.targetRoleLabel || cv.__meta?.targetRole || "" };
        const { data, error } = await supabase.functions.invoke("analyze-role-fit", {
          body: { resume_content_json: cv, role, job_posting_text: jobText || undefined, system_language: cvLanguage },
        });
        if (error || (data as any)?.error) return;
        onPersistRoleFit?.(sig, data as RoleFitResult);
        setReframes(((data as any)?.reframes || []) as BulletReframe[]);
      } catch { /* reframes are optional — the queue works without them */ }
    })();
  }, [autoRun]); // eslint-disable-line react-hooks/exhaustive-deps
  const isStale = !!deepResult && analyzedSnapshot !== null && analyzedSnapshot !== cvSignature;

  // True when the CV changed only through accepted suggestions since the last scan —
  // the case where the score is guaranteed not to have gotten worse.
  const appliedSinceScanRef = useRef(false);

  // Live mirror for async persist decisions: a scan describes the document it was
  // GIVEN. If the user edits while it runs, the result is still stored under the
  // scanned signature (correct pairing), but the headline score is NOT written as
  // the live document's current score.
  const liveRef = useRef({ cv, jobText });
  useEffect(() => { liveRef.current = { cv, jobText }; });

  const runDeep = async (opts?: { silent?: boolean }) => {
    const requestSig = cvSignature; // the signature of the document this scan describes
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
        body: {
          resume_content_json: cv,
          job_posting_text: jobText.trim() || undefined,
          locale: cvLanguage,
          // Anchor themes to the demand profile extracted at application creation, so the
          // report and the editor always talk about the same competence buckets.
          demand_profile: cv.__meta?.demandProfile || undefined,
          // Anchor ratings to the previous scan so untouched themes never drift.
          previous_themes: (prevFull?.job_language_match?.competence_themes || [])
            .filter(t => Number.isFinite(t.rating as number))
            .map(t => ({ theme: t.theme, rating: t.rating })),
          // Nivålyftet: verified answers reach the rater — capped at 4 without CV visibility.
          verified_evidence: (cv.__meta?.verifiedEvidence || []).length ? cv.__meta?.verifiedEvidence : undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      let newResult = data as AtsCheckResult;
      // Trust guarantee: accepting the app's OWN suggestions only adds content, so a
      // rescan right after applying them must never read lower — otherwise sampling
      // noise shows up as "Parse -2" on a word swap that cannot affect parsing.
      // Ratchet against the previous result; manual edits score live as usual.
      if (appliedSinceScanRef.current && prevFull) {
        const prevByName = new Map((prevFull.job_language_match.competence_themes || []).map(t => [t.theme.toLowerCase().trim(), t]));
        const evRank: Record<string, number> = { missing: 0, partial: 1, strong: 2 };
        newResult = {
          ...newResult,
          overall_score: Math.max(newResult.overall_score, prevFull.overall_score),
          grade: newResult.overall_score >= prevFull.overall_score ? newResult.grade : prevFull.grade,
          subscores: {
            parse: Math.max(newResult.subscores.parse, prevFull.subscores.parse),
            scanability: Math.max(newResult.subscores.scanability, prevFull.subscores.scanability),
            relevance: Math.max(newResult.subscores.relevance, prevFull.subscores.relevance),
            evidence: Math.max(newResult.subscores.evidence, prevFull.subscores.evidence),
          },
          job_language_match: {
            ...newResult.job_language_match,
            competence_themes: (newResult.job_language_match.competence_themes || []).map(t => {
              const p = prevByName.get(t.theme.toLowerCase().trim());
              if (!p) return t;
              const rating = Math.max((t.rating as number) ?? 0, (p.rating as number) ?? 0) || t.rating;
              const evidence = (evRank[t.evidence as string] ?? 0) >= (evRank[p.evidence as string] ?? 0) ? t.evidence : p.evidence;
              return { ...t, rating, evidence };
            }),
          },
        };
      }
      appliedSinceScanRef.current = false;
      setDeepResult(newResult);
      // Only stamp the headline score when the scanned document is still the live one.
      const liveSig = cvScanSignature(liveRef.current.cv, liveRef.current.jobText);
      if (liveSig === requestSig) {
        onPersistScore?.(Math.round(newResult.overall_score), newResult.grade, newResult.subscores);
      }
      onPersistResult?.(requestSig, newResult);
      setAnalyzedSnapshot(requestSig);
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
    // The issue text often names the role it concerns — match against titles/companies
    // instead of always hitting experience[0].
    const expIdxFor = (): number => {
      const hit = cv.experience.findIndex(e =>
        (e.title && haystack.includes(e.title.toLowerCase())) ||
        (e.company && haystack.includes(e.company.toLowerCase())));
      return hit >= 0 ? hit : 0;
    };
    if (skillsKw.some(k => haystack.includes(k))) return { target: "skills" };
    if (profileKw.some(k => haystack.includes(k))) return { target: "profile" };
    if (expKw.some(k => haystack.includes(k)) && cv.experience.length > 0) return { target: "experience", targetIdx: expIdxFor() };
    // Default: profile if exists, else first experience, else skills
    if (cv.profile || cv.experience.length === 0) return { target: "profile" };
    return { target: "experience", targetIdx: expIdxFor() };
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
    onSnapshot?.(isSv ? "Auto-fix" : "Auto-fix");
    appliedSinceScanRef.current = true;
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
      // MERGE with the existing list — an AI suggestion must never erase the
      // user's own skills (this used to replace the whole list).
      const newSkills = text.split("\n").map(clean).filter(Boolean).flatMap(line =>
        line.includes(":") ? [line] : line.split(",").map(s => s.trim()).filter(Boolean)
      );
      if (newSkills.length > 0) {
        const seen = new Set(cv.skills.map(s => s.toLowerCase().trim()));
        onUpdateSkills?.([...cv.skills, ...newSkills.filter(s => !seen.has(s.toLowerCase().trim()))]);
      }
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
  // Pedigree proxies (the ad's brand examples) are class labels, never keywords: they are
  // filtered out of every keyword surface here, so frozen pre-classification analyses
  // can't leak a brand into questions or placements.
  const proxyTerms = collectProxyTerms(cv.__meta?.demandProfile);
  const themes = (deepResult?.job_language_match?.competence_themes ?? []).map(t => ({
    ...t,
    supporting_terms_missing: (t.supporting_terms_missing || []).filter(p => !isPedigreeTerm(p, proxyTerms)),
  }));
  // Hard tools/systems from the ad, matched deterministically against the CV text —
  // exact product names deserve exact matching, separate from competence judgment.
  const cvBlob = JSON.stringify([cv.profile, cv.skills, cv.experience, cv.certifications]).toLowerCase();
  const adTools = (cv.__meta?.demandProfile?.tools_and_systems || []).map(t => ({ tool: t, ok: cvBlob.includes(t.toLowerCase()) }));
  const missingTools = adTools.filter(t => !t.ok).map(t => t.tool);
  const missingKw = Array.from(new Set([
    ...(deepResult?.job_language_match.missing_phrases ?? []),
    ...themes.flatMap(t => t.supporting_terms_missing || []),
    ...missingTools,
  ].map(s => s.trim()).filter(Boolean))).filter(p => !isPedigreeTerm(p, proxyTerms));
  const unthemedKw = missingKw.filter(p => !themes.some(t => (t.supporting_terms_missing || []).includes(p)));
  const genericKw = deepResult?.job_language_match.generic_phrases_to_replace ?? [];
  const weakFeedback = (deepResult?.bullet_feedback ?? []).filter(b => b.score < 7);

  // ── Färdigmodellen: EVERYTHING that can improve the CV becomes a queue card, and
  // "done" means the queue is empty. The match score measures theme evidence; these
  // deterministic checks gate "ready to send" — score and guidance must never
  // disagree on screen again. ──
  const six = sixSecondTest(cv, themes.length ? themes : (cv.__meta?.demandProfile?.competence_themes || []));
  const skillsAdvice = onUpdateSkills ? adviseSkills(cv, cv.__meta?.demandProfile, cv.__meta?.verifiedEvidence) : null;
  const skillsActionCount = skillsAdvice ? skillsAdvice.add.length + skillsAdvice.reword.length + skillsAdvice.trim.length : 0;
  const acceptedChecks = new Set(cv.__meta?.acceptedChecks || []);
  const acceptCheck = (id: string) => onUpdateMeta?.({ acceptedChecks: [...(cv.__meta?.acceptedChecks || []), id] });
  const pageEst = estimatePages(cv);
  const profMiss = profileCoverage(cv.profile, themes.filter(t => t.importance === "must").slice(0, 3)).filter(c => !c.mentioned);
  const blankScope = cv.experience.slice(0, 2).filter(e => (e.bullets || []).some(b => b.trim()) && !(e.roleScope || "").trim());
  interface ReadyCheck { id: string; kind: "issues" | "six" | "profile" | "scope" | "length" | "skills"; title: string; body: string; theme?: string; expIndex?: number }
  const readiness: ReadyCheck[] = (!deepResult || !themes.length) ? [] : ([
    ...(errorCount > 0 ? [{ id: "issues", kind: "issues" as const,
      title: isSv ? `${errorCount} kritiska problem i dokumentet` : `${errorCount} critical document issues`,
      body: isSv ? "Kritiska fel gallrar innan innehållet ens läses." : "Critical issues screen you out before the content is even read." }] : []),
    ...(six ? six.themes.filter(t => !t.visible).map(t => ({ id: `six:${t.theme}`, kind: "six" as const, theme: t.theme,
      title: isSv ? `Syns inte i toppen: ${t.theme}` : `Not visible up top: ${t.theme}`,
      body: isSv ? "Rekryterarens första sekunder läser bara övre tredjedelen av sida 1: profilen och de tre första punkterna i senaste rollen." : "The recruiter's first seconds read only the top third of page 1: the profile and the latest role's first three bullets." })) : []),
    ...profMiss.map(c => ({ id: `profile:${c.theme}`, kind: "profile" as const, theme: c.theme,
      title: isSv ? `Profilen nämner inte: ${c.theme}` : `The profile doesn't mention: ${c.theme}`,
      body: isSv ? "Profiltexten är rekryterarens första läsning och CV:ts bästa nyckelordsyta. Ett krav-tema som saknas där förlorar både skimmen och sökningen." : "The profile paragraph is the recruiter's first read and the CV's best keyword surface. A must theme absent there loses both the skim and the search." })),
    ...blankScope.map(e => ({ id: `scope:${e.id}`, kind: "scope" as const, expIndex: cv.experience.indexOf(e),
      title: isSv ? `Rollomfång saknas: ${e.title}` : `Role scope missing: ${e.title}`,
      body: isSv ? "Mandat, P&L, team, geografi. En tom omfångsrad gör rollen mindre än den var." : "Mandate, P&L, team, geography. An empty scope line makes the role look smaller than it was." })),
    ...(pageEst.pages > 2 ? [{ id: "length", kind: "length" as const,
      title: isSv ? `CV:t är ~${pageEst.pages} sidor, sikta på 2` : `The CV runs ~${pageEst.pages} pages, aim for 2`,
      body: isSv ? "Uppskattat från innehållsmängden. Sida 3 läses nästan aldrig, och allt viktigt trängs nedåt av allt som inte är det." : "Estimated from content volume. Page 3 is almost never read, and everything important gets pushed down by everything that isn't." }] : []),
    ...(skillsAdvice && (skillsActionCount > 0 || skillsAdvice.status !== "ok") ? [{ id: "skills", kind: "skills" as const,
      title: skillsAdvice.status === "few"
        ? (isSv ? `För få skills: ${skillsAdvice.current} av minst ${skillsAdvice.floor}` : `Too few skills: ${skillsAdvice.current} of at least ${skillsAdvice.floor}`)
        : skillsAdvice.status === "many"
          ? (isSv ? `För många skills: ${skillsAdvice.current}, max ${skillsAdvice.cap}` : `Too many skills: ${skillsAdvice.current}, cap ${skillsAdvice.cap}`)
          : (isSv ? `Skills-sektionen: ${skillsActionCount} förslag` : `Skills section: ${skillsActionCount} suggestions`),
      body: isSv ? "8–12 skills med annonsens exakta ord vinner både rekryterarens skim och sökningen." : "8–12 skills in the ad's exact words win both the recruiter's skim and the search." }] : []),
  ] as ReadyCheck[]).filter(c => !acceptedChecks.has(c.id));
  // The one honest reorder: move an existing proof bullet to the top of its role.
  const moveProofUp = () => {
    const s = six?.suggestion;
    if (!s || !onUpdateExperienceBullets) return;
    const exp = cv.experience[s.expIndex];
    if (!exp || exp.bullets[s.fromIndex] !== s.bullet) {
      toast({ title: isSv ? "Punkten har ändrats" : "That bullet has changed", variant: "destructive" });
      return;
    }
    onSnapshot?.(isSv ? "Omordning" : "Reorder");
    appliedSinceScanRef.current = true;
    const next = [...exp.bullets];
    next.splice(s.fromIndex, 1);
    next.unshift(s.bullet);
    onUpdateExperienceBullets(s.expIndex, next);
    toast({ title: isSv ? "Punkten flyttad överst" : "Bullet moved to the top" });
  };
  // Skills advisor rows — shared by the queue card and the details sheet.
  const skillsRows = () => skillsAdvice && (
    <div className="space-y-1.5">
      {/* The COUNT is its own verdict: 8-12 is the band, and the advisor says so
          out loud instead of only listing edits. */}
      {skillsAdvice.status === "few" && (
        <p className="text-[11px] font-medium text-warning">
          {isSv
            ? `${skillsAdvice.current} skills är under golvet på ${skillsAdvice.floor}.${skillsAdvice.deficit > 0 ? ` Även med alla tillägg nedan fattas ${skillsAdvice.deficit}, svara på frågorna så fler kan läggas till ärligt.` : " Tilläggen nedan tar dig över golvet."}`
            : `${skillsAdvice.current} skills is under the floor of ${skillsAdvice.floor}.${skillsAdvice.deficit > 0 ? ` Even with every addition below you're ${skillsAdvice.deficit} short, answer the questions so more can be added honestly.` : " The additions below get you over the floor."}`}
        </p>
      )}
      {skillsAdvice.status === "many" && (
        <p className="text-[11px] font-medium text-warning">
          {isSv
            ? `${skillsAdvice.current} skills är över taket på ${skillsAdvice.cap}. Allt över läses som utfyllnad, ta bort raderna nedan.`
            : `${skillsAdvice.current} skills is over the cap of ${skillsAdvice.cap}. Everything above it reads as padding, remove the rows below.`}
        </p>
      )}
      {skillsAdvice.add.map(a => (
        <div key={a.term} className="flex items-center justify-between gap-2 text-xs">
          <span>+ <span className="font-medium">{a.term}</span>{a.theme && <span className="text-muted-foreground"> · {a.theme}</span>}</span>
          <Button variant="outline" size="sm" className="h-7 shrink-0 text-[10px]" onClick={() => {
            onSnapshot?.(`Skill: ${a.term}`);
            appliedSinceScanRef.current = true;
            onUpdateSkills?.([...cv.skills, a.term]);
          }}>{isSv ? "Lägg till" : "Add"}</Button>
        </div>
      ))}
      {skillsAdvice.reword.map(r => (
        <div key={r.from} className="flex items-center justify-between gap-2 text-xs">
          <span><span className="text-muted-foreground line-through">{r.from}</span> → <span className="font-medium">{r.to}</span></span>
          <Button variant="outline" size="sm" className="h-7 shrink-0 text-[10px]" onClick={() => {
            onSnapshot?.(isSv ? "Skill-ordval" : "Skill wording");
            appliedSinceScanRef.current = true;
            onUpdateSkills?.(cv.skills.map(s => (s === r.from ? r.to : s)));
          }}>{isSv ? "Byt till annonsens ord" : "Use the ad's word"}</Button>
        </div>
      ))}
      {skillsAdvice.trim.map(t => (
        <div key={t} className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">− {t} <span className="text-[10px]">({isSv ? "över taket, ej i annonsen" : "over the cap, not in the ad"})</span></span>
          <Button variant="outline" size="sm" className="h-7 shrink-0 text-[10px]" onClick={() => {
            onSnapshot?.(isSv ? "Skill borttagen" : "Skill removed");
            appliedSinceScanRef.current = true;
            onUpdateSkills?.(cv.skills.filter(s => s !== t));
          }}>{isSv ? "Ta bort" : "Remove"}</Button>
        </div>
      ))}
      {skillsAdvice.unproven.length > 0 && canFix && (
        <div className="flex items-center justify-between gap-2 pt-0.5 text-xs">
          <span className="text-muted-foreground">{isSv ? "Obevisat än:" : "Unproven yet:"} {skillsAdvice.unproven.map(u => u.term).join(", ")}</span>
          <Button variant="ghost" size="sm" className="h-7 shrink-0 text-[10px]" disabled={loadingQ || placing}
            onClick={() => fetchQuestions(skillsAdvice.unproven.map(u => u.term))}>
            {isSv ? "Fråga mig" : "Ask me"}
          </Button>
        </div>
      )}
    </div>
  );

  // Evidence travels STRUCTURED (what kinds are true / the specifics / which role),
  // so the server can distill a proper CV bullet instead of quoting a mashed string.
  interface EvidenceItem { keyword: string; answer: string; statements?: string[]; detail?: string; role?: string }
  const runPlacements = async (phrases: string[], evidence?: EvidenceItem[]) => {
    setPlacing(true);
    setPlacements(null);
    setNewBullets(null);
    setAppliedPlacements(new Set());
    setAppliedNew(new Set());
    try {
      // Theme names are bucket labels, not CV language — placements work on the ad's
      // actual missing terms; the label itself may only motivate a new evidence bullet.
      const themeByName = new Map(themes.map(t => [t.theme.toLowerCase().trim(), t]));
      const expanded = Array.from(new Set(phrases.flatMap(p => {
        const t = themeByName.get(p.toLowerCase().trim());
        return t?.supporting_terms_missing?.length ? [...t.supporting_terms_missing, p] : [p];
      }))).filter(p => !isPedigreeTerm(p, proxyTerms));
      if (!expanded.length) {
        toast({ title: isSv ? "Inget att placera" : "Nothing to place", description: isSv ? "Varumärken ur annonsen skrivs aldrig in i CV:t — bevisa kapaciteten i stället." : "Ad brand names never go into the CV — prove the capability instead." });
        return;
      }
      const { data, error } = await supabase.functions.invoke("place-keywords", {
        body: { resume_content_json: cv, missing_phrases: expanded, locale: cvLanguage, evidence, never_insert: Array.from(proxyTerms) },
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
  const fetchQuestions = async (scope?: string[]) => {
    const accepted = new Set(cv.__meta?.acceptedGaps || []);
    const weakThemes = themes
      .filter(t => t.evidence !== "strong" && !kwConfirm[t.theme] && !accepted.has(t.theme))
      .map(t => t.theme);
    const unknowns = (scope?.length
      ? scope.filter(p => !kwConfirm[p])
      : Array.from(new Set([...weakThemes, ...missingKw.filter(p => !kwConfirm[p])]))
    ).filter(p => !isPedigreeTerm(p, proxyTerms));
    if (!unknowns.length) return;

    // Cross-CV reuse: a competence verified in ANY CV is never asked about again —
    // the saved answer becomes the evidence directly.
    const reuse: { keyword: string; answer: string }[] = [];
    let toAsk = unknowns;
    if (profileEvidence) {
      toAsk = [];
      for (const u of unknowns) {
        const saved = profileEvidence(u).filter(e => (e.answer || "").trim().length > 2);
        if (saved.length) reuse.push({ keyword: u, answer: saved.map(e => e.answer).join(". ").slice(0, 500) });
        else toAsk.push(u);
      }
      if (reuse.length) {
        setKwConfirm(prev => {
          const next = { ...prev };
          reuse.forEach(r => { next[r.keyword] = "yes"; });
          return next;
        });
        toast({
          title: isSv ? `${reuse.length} redan besvarade` : `${reuse.length} already answered`,
          description: isSv ? "Sparade svar från tidigare ansökningar återanvänds som underlag." : "Saved answers from earlier applications are reused as evidence.",
        });
      }
      if (!toAsk.length) {
        if (reuse.length) runPlacements(reuse.map(r => r.keyword), reuse);
        return;
      }
      answeredRef.current.push(...reuse);
    }
    setLoadingQ(true);
    try {
      // Level-up mode: themes with a known rating get questions for the NEXT level's
      // missing attribute (autonomy/scope/outcome), not "do you have this?".
      const ratingOfT = (t: typeof themes[number]) => Math.round((t.rating as number) ?? (t.evidence === "strong" ? 4 : t.evidence === "missing" ? 1 : 3));
      const themesCtx = themes
        .filter(t => toAsk.includes(t.theme))
        .map(t => ({ theme: t.theme, rating: ratingOfT(t), evidence_note: t.evidence_note }));
      const { data, error } = await supabase.functions.invoke("verify-keywords", {
        body: { resume_content_json: cv, missing_phrases: toAsk, locale: cvLanguage, themes_context: themesCtx.length ? themesCtx : undefined },
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

  // Skill inference the honest way (the HiredScore trick, with you as the gate):
  // the AI reads the CV for competences it IMPLIES but never states, and those
  // become ordinary interview questions — never silent claims.
  const [inferring, setInferring] = useState(false);
  const exploreHidden = async () => {
    setInferring(true);
    try {
      const known = Array.from(new Set([
        ...themes.map(t => t.theme),
        ...Object.keys(kwConfirm),
        ...(cv.__meta?.verifiedEvidence || []).map(e => e.keyword),
      ]));
      const { data, error } = await supabase.functions.invoke("infer-competences", {
        body: { resume_content_json: cv, known, locale: cvLanguage },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const names = ((data.inferences || []) as { competence: string }[]).map(i => i.competence).filter(Boolean);
      if (!names.length) {
        toast({ title: isSv ? "Inget dolt hittades" : "Nothing hidden found", description: isSv ? "CV:t antyder inga obevisade kompetenser just nu." : "The CV doesn't imply any unproven competences right now." });
        return;
      }
      await fetchQuestions(names);
    } catch (e: any) {
      toast({ title: isSv ? "Kunde inte utforska" : "Couldn't explore", description: e.message, variant: "destructive" });
    } finally { setInferring(false); }
  };

  // Options must always exist — if the model (or an old function version) sends none,
  // fall back to honest involvement levels so the card never degrades to a bare textbox.
  const optionsFor = (q: KwQuestion): string[] =>
    q.options?.length ? q.options : (isSv
      ? ["Jag ägde detta område och satte riktningen", "Jag drev arbetet operativt i min roll", "Jag bidrog som del av ett team"]
      : ["I owned this area and set the direction", "I drove the work hands-on in my role", "I contributed as part of a team"]);

  // A placement is a 1–2 word swap inside a long bullet. Two near-identical paragraphs
  // hide the change, so render the swap itself plus the sentence with the new words marked.
  const wordDiff = (a: string, b: string) => {
    const aw = a.split(/\s+/), bw = b.split(/\s+/);
    let pre = 0;
    while (pre < aw.length && pre < bw.length && aw[pre] === bw[pre]) pre++;
    let suf = 0;
    while (suf < aw.length - pre && suf < bw.length - pre && aw[aw.length - 1 - suf] === bw[bw.length - 1 - suf]) suf++;
    return {
      removed: aw.slice(pre, aw.length - suf).join(" "),
      added: bw.slice(pre, bw.length - suf).join(" "),
      prefix: bw.slice(0, pre).join(" "),
      suffix: bw.slice(bw.length - suf).join(" "),
    };
  };
  const renderPlacementDiff = (p: Placement) => {
    const d = wordDiff(p.original, p.revised);
    return (
      <div className="space-y-1.5">
        <p className="text-sm leading-relaxed">
          <span className="rounded bg-destructive/10 px-1 py-0.5 line-through decoration-destructive/50">{d.removed || (isSv ? "(inget)" : "(nothing)")}</span>
          <span className="mx-1.5 text-muted-foreground">→</span>
          <span className="ai-ink rounded bg-green-600/15 px-1 py-0.5 font-medium">{d.added}</span>
        </p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {d.prefix && <>{d.prefix} </>}
          <span className="ai-ink rounded bg-green-600/15 px-0.5 font-medium">{d.added}</span>
          {d.suffix && <> {d.suffix}</>}
        </p>
      </div>
    );
  };

  // The evidence answer = ticked statements + optional typed detail (either alone is enough).
  const composedAnswer = (q: KwQuestion) =>
    [(kwChoice[q.keyword] || []).join("; "), (kwAnswers[q.keyword] || "").trim()].filter(Boolean).join(" — ");
  const canSubmitQ = (q: KwQuestion) => composedAnswer(q).length > 2;

  // Every verified answer is profile evidence — persist it (with the role it belongs to)
  // so the chronological profile files it under the right role and the same question is
  // never asked twice.
  const persistEvidence = (items: { keyword: string; answer: string; role?: string }[]) => {
    if (!onUpdateMeta || !items.length) return;
    const prev = cv.__meta?.verifiedEvidence || [];
    const fresh = items.filter(e => !prev.some(p => p.keyword === e.keyword && p.answer === e.answer));
    if (!fresh.length) return;
    const at = new Date().toISOString();
    onUpdateMeta({ verifiedEvidence: [...prev, ...fresh.map(e => ({ ...e, at }))] });
  };

  // The chosen role rides along into placement evidence too, so the model targets
  // the right experience when it builds bullets.
  const answerWithRole = (q: KwQuestion) => {
    const role = (kwRole[q.keyword] || "").trim();
    const answer = composedAnswer(q);
    return role ? `${answer} (i rollen: ${role})` : answer;
  };

  // Queue mode: answer questions one card at a time; the batch placement runs after the last.
  const submitOneAnswer = (q: KwQuestion) => {
    const answer = composedAnswer(q);
    if (answer.length <= 2) return;
    persistEvidence([{ keyword: q.keyword, answer, role: kwRole[q.keyword] || undefined }]);
    answeredRef.current.push({
      keyword: q.keyword, answer: answerWithRole(q),
      statements: kwChoice[q.keyword] || [], detail: (kwAnswers[q.keyword] || "").trim() || undefined, role: kwRole[q.keyword] || undefined,
    });
    setKwConfirm(prev => ({ ...prev, [q.keyword]: "yes" }));
    const rest = (kwQuestions || []).filter(x => x.keyword !== q.keyword);
    setKwQuestions(rest.length ? rest : null);
    if (!rest.length) {
      const evidence = answeredRef.current;
      answeredRef.current = [];
      runPlacements(evidence.map(e => e.keyword), evidence);
    }
  };

  const submitAnswers = () => {
    const answered = (kwQuestions || []).filter(canSubmitQ);
    if (!answered.length) return;
    setKwConfirm(prev => {
      const next = { ...prev };
      answered.forEach(q => { next[q.keyword] = "yes"; });
      return next;
    });
    // Include cross-CV answers stashed at fetch time, so reused evidence flows into
    // the same placement run as the fresh answers.
    const stashed = answeredRef.current;
    answeredRef.current = [];
    persistEvidence(answered.map(q => ({ keyword: q.keyword, answer: composedAnswer(q), role: kwRole[q.keyword] || undefined })));
    const evidence = [...stashed, ...answered.map(q => ({
      keyword: q.keyword, answer: answerWithRole(q),
      statements: kwChoice[q.keyword] || [], detail: (kwAnswers[q.keyword] || "").trim() || undefined, role: kwRole[q.keyword] || undefined,
    }))];
    const tapped = missingKw.filter(p => kwConfirm[p] === "yes" && !evidence.some(e => e.keyword === p));
    setKwQuestions(null);
    runPlacements([...tapped, ...evidence.map(e => e.keyword)], evidence);
  };

  const applyNewBullet = (nb: NewBullet, idx: number) => {
    const exp = cv.experience[nb.exp_index];
    if (!exp) return;
    onSnapshot?.(isSv ? "Ny punkt" : "New bullet");
    appliedSinceScanRef.current = true;
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
    onSnapshot?.(isSv ? `Ordbyte: ${p.keyword}` : `Swap: ${p.keyword}`);
    appliedSinceScanRef.current = true;
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
            <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-primary flex items-center gap-1">
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
                {isSv ? "Applicera" : "Apply"}
              </Button>
              <Button variant="ghost" size="sm" className="h-9 text-[10px]" onClick={() => setAutoFixPreview(null)}>
                {isSv ? "Avbryt" : "Cancel"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-1.5 mt-1">
            <Button variant="default" size="sm" className="flex-1 h-9 text-[10px] gap-1.5" disabled={autoFixingIdx !== null} onClick={() => runAutoFix(issue, i)}>
              {autoFixingIdx === i && <Loader2 className="h-3 w-3 animate-spin" />}
              {autoFixingIdx === i ? (isSv ? "Fixar..." : "Fixing...") : (isSv ? "Auto-fixa" : "Auto-fix")}
            </Button>
            <Button variant="outline" size="sm" className="h-9 text-[10px] gap-1" onClick={() => setFixingIssue(issue)}>
              {isSv ? "Anpassa" : "Refine"}
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
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      {themes.length > 0 ? (isSv ? "Kompetensområden rollen screenar på" : "Competence areas the role screens for") : (isSv ? "Saknade nyckelord" : "Missing keywords")}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {isSv ? "Tryck på varje ord: ✓ = jag har detta på riktigt · ✕ = har inte (utelämnas ärligt)." : "Tap each word: ✓ = I genuinely have this · ✕ = I don't (honestly omitted)."}
                    </p>
                    {(cv.__meta?.demandProfile?.knockout_requirements?.length ?? 0) > 0 && (
                      <div className="space-y-1 rounded-lg border border-warning/40 bg-warning/5 p-2.5">
                        <p className="text-[11px] font-semibold">{isSv ? "Hårda krav — svara ärligt i ansökan" : "Hard requirements — answer honestly in the application"}</p>
                        <p className="text-[9px] text-muted-foreground">{isSv ? "De enda automatiska avslagen. CV-formuleringar hjälper inte här." : "The only automatic rejections. CV wording can't help here."}</p>
                        <ul className="list-disc pl-4 text-[11px]">
                          {cv.__meta!.demandProfile!.knockout_requirements!.map(k => <li key={k}>{k}</li>)}
                        </ul>
                      </div>
                    )}
                    {themes.length > 0 ? (
                      <div className="space-y-2">
                        {[...themes]
                          .sort((a, b) => ((a.importance === "must" ? 0 : 1) - (b.importance === "must" ? 0 : 1)) || ((a.rating ?? 3) - (b.rating ?? 3)))
                          .map((th, i) => {
                          const accepted = (cv.__meta?.acceptedGaps || []).includes(th.theme);
                          const r = Math.max(1, Math.min(5, Math.round(th.rating ?? (th.evidence === "strong" ? 4 : th.evidence === "missing" ? 1 : 3))));
                          return (
                          <div key={i} className={`rounded-lg border p-2.5 space-y-1.5 ${accepted ? "border-border opacity-55" : th.importance === "must" && th.evidence === "missing" ? "border-destructive/30" : "border-border"}`}>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-semibold">{th.theme}</span>
                              {th.importance === "must" && (
                                <span className="rounded-full border border-border px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">{isSv ? "Krav" : "Must"}</span>
                              )}
                              {/* Scorecard rating dots (1–5) */}
                              <span className="ml-auto flex items-center gap-0.5" title={`${r}/5`} aria-label={`${r}/5`}>
                                {[1, 2, 3, 4, 5].map(n => (
                                  <span key={n} className={`h-1.5 w-1.5 rounded-full ${n <= r ? (r >= 4 ? "bg-green-600" : r >= 2 ? "bg-warning" : "bg-destructive") : "bg-muted"}`} />
                                ))}
                              </span>
                              {accepted && <span className="rounded-full border border-border px-1.5 py-0.5 text-[9px] text-muted-foreground">{isSv ? "Accepterat gap" : "Accepted gap"}</span>}
                            </div>
                            {!accepted && (
                              <>
                                <p className="text-[10px] leading-relaxed text-muted-foreground">{th.evidence_note}</p>
                                {/* The recruiter's real question: which ONE sentence proves this theme? */}
                                {th.proof_bullet ? (
                                  <p className="rounded border-l-2 border-primary/40 bg-muted/40 px-2 py-1 text-[11px] leading-relaxed">
                                    <span className="font-serif italic">"{th.proof_bullet}"</span>
                                    {th.proof_gap === "outcome" && <span className="ml-1 text-[9px] font-semibold text-warning">{isSv ? "· saknar utfall" : "· lacks outcome"}</span>}
                                    {th.proof_gap === "scope" && <span className="ml-1 text-[9px] font-semibold text-warning">{isSv ? "· saknar omfång" : "· lacks scope"}</span>}
                                    {th.proof_gap === "none" && <span className="ml-1 text-[9px] font-semibold text-green-700 dark:text-green-500">{isSv ? "· bär temat" : "· carries the theme"}</span>}
                                  </p>
                                ) : (
                                  <p className="text-[10px] text-muted-foreground">{isSv ? "Ingen mening i CV:t bär det här temat än." : "No sentence in the CV carries this theme yet."}</p>
                                )}
                                {/* Motsvarande-bridge: what the ad's pedigree examples actually mean. */}
                                {(() => {
                                  const dp = (cv.__meta?.demandProfile?.competence_themes || []).find(d => d.theme.toLowerCase().trim() === th.theme.toLowerCase().trim());
                                  if (!dp?.proxy_terms?.length) return null;
                                  return (
                                    <div className="rounded-lg bg-muted/40 px-2 py-1.5 text-[10px] leading-relaxed">
                                      <span className="text-muted-foreground">{isSv ? "Annonsen säger" : "The ad says"}: </span>
                                      <span className="font-medium">{dp.proxy_terms.join(", ")} {isSv ? "eller motsvarande" : "or equivalent"}</span>
                                      <span className="text-muted-foreground"> → {isSv ? "det betyder" : "meaning"}: </span>
                                      <span className="font-medium">{dp.proxy_translation || (dp.supporting_terms || []).slice(0, 4).join(", ")}</span>
                                      <span className="block text-muted-foreground">{isSv ? "Varumärket ska aldrig stå i CV:t — beviset ska." : "The brand never goes in the CV — the proof does."}</span>
                                    </div>
                                  );
                                })()}
                                {(th.supporting_terms_present || []).length > 0 && (
                                  <p className="text-[10px] text-green-700 dark:text-green-500">✓ {th.supporting_terms_present.join(" · ")}</p>
                                )}
                                {(th.supporting_terms_missing || []).length > 0 && (
                                  <div className="flex flex-wrap gap-1">{th.supporting_terms_missing.map(kwChip)}</div>
                                )}
                                {r < 4 && canFix && (
                                  <div className="flex gap-1.5 pt-0.5">
                                    <Button variant="outline" size="sm" className="h-8 flex-1 text-[10px]" disabled={loadingQ || placing}
                                      onClick={() => fetchQuestions([th.theme, ...(th.supporting_terms_missing || [])])}>
                                      {isSv ? "Överbrygga: fråga mig" : "Bridge: ask me"}
                                    </Button>
                                    {onUpdateMeta && (
                                      <Button variant="ghost" size="sm" className="h-8 text-[10px] text-muted-foreground"
                                        onClick={() => onUpdateMeta({ acceptedGaps: [...(cv.__meta?.acceptedGaps || []), th.theme] })}>
                                        {isSv ? "Ärligt gap" : "Honest gap"}
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </>
                            )}
                            {accepted && onUpdateMeta && (
                              <button type="button" className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
                                onClick={() => onUpdateMeta({ acceptedGaps: (cv.__meta?.acceptedGaps || []).filter(g => g !== th.theme) })}>
                                {isSv ? "Ångra" : "Undo"}
                              </button>
                            )}
                          </div>
                          );
                        })}
                        {unthemedKw.length > 0 && <div className="flex flex-wrap gap-1">{unthemedKw.map(kwChip)}</div>}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1">{missingKw.map(kwChip)}</div>
                    )}
                  </>
                );
              })()}
              {/* Skills advisor: deterministic, zero AI. 8-12 skills in the ad's exact
                  words — Teamtailor has no auto-scoring, so the list optimizes for
                  recruiter skim and manual search. Adds are honesty-gated: only terms
                  the CV or verified answers already prove; the rest become questions. */}
              {skillsAdvice && (skillsActionCount > 0 || skillsAdvice.unproven.length > 0 || skillsAdvice.status !== "ok") && (
                <div className="surface-sheet space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {isSv ? "Skills-sektionen" : "Skills section"} · {skillsAdvice.current} {isSv ? "av" : "of"} {skillsAdvice.floor}–{skillsAdvice.cap}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {isSv ? "8–12 är optimalt. Annonsens exakta ord vinner både rekryterarens skim och sökningen." : "8–12 is the sweet spot. The ad's exact words win both the recruiter's skim and the search."}
                  </p>
                  {skillsRows()}
                </div>
              )}
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
                      <Button variant="default" size="sm" className="h-9 w-full text-xs" onClick={() => fetchQuestions()} disabled={loadingQ || placing}>
                        {loadingQ && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                        {loadingQ ? (isSv ? "Skapar frågor…" : "Creating questions…") : (isSv ? `Fråga mig om ${unknowns.length} nyckelord` : `Ask me about ${unknowns.length} keywords`)}
                      </Button>
                    )}
                    {confirmed.length > 0 && (
                      <Button variant="outline" size="sm" className="h-9 w-full text-xs"
                        onClick={() => runPlacements(confirmed)} disabled={placing}>
                        {placing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                        {placing ? (isSv ? "Letar placeringar…" : "Finding placements…") : (isSv ? `Placera ${confirmed.length} bekräftade nyckelord` : `Place ${confirmed.length} confirmed keywords`)}
                      </Button>
                    )}
                  </div>
                );
              })()}
              {kwQuestions && kwQuestions.length > 0 && (
                <div className="space-y-2 pt-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
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
                      {optionsFor(q).map(opt => (
                        <button key={opt} type="button" onClick={() => toggleChoice(q.keyword, opt)}
                          className={`w-full rounded-lg border p-2 text-left text-[11px] leading-relaxed transition-colors ${(kwChoice[q.keyword] || []).includes(opt) ? "border-primary bg-primary/10 font-medium" : "border-border hover:bg-muted"}`}>
                          {opt}
                        </button>
                      ))}
                      <Textarea
                        rows={2}
                        value={kwAnswers[q.keyword] || ""}
                        onChange={e => setKwAnswers(prev => ({ ...prev, [q.keyword]: e.target.value }))}
                        placeholder={q.hint || (isSv ? "Frivillig detalj: system, omfattning, resultat…" : "Optional detail: system, scope, outcome…")}
                        className="text-xs"
                      />
                      {roleSelect(q.keyword, "h-9 text-[11px]")}
                    </div>
                  ))}
                  <div className="flex gap-1.5">
                    <Button size="sm" className="h-9 flex-1 text-xs" onClick={submitAnswers}
                      disabled={placing || !(kwQuestions || []).some(canSubmitQ)}>
                      {placing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
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
                                        {appliedNew.has(i) ? (isSv ? "Tillagd" : "Added") : (isSv ? "Lägg till" : "Add")}
                  </Button>
                </div>
              ))}
              {placements?.map((p, i) => (
                <div key={i} className="rounded-lg border border-border p-2.5 space-y-1.5">
                  <Badge variant="secondary" className="text-[9px] h-5">{p.keyword}</Badge>
                  {renderPlacementDiff(p)}
                  <p className="text-[9px] italic text-muted-foreground">{p.note}</p>
                  <Button
                    size="sm"
                    variant={appliedPlacements.has(i) ? "secondary" : "outline"}
                    className="h-9 w-full text-xs"
                    disabled={appliedPlacements.has(i)}
                    onClick={() => applyPlacement(p, i)}
                  >
                                        {appliedPlacements.has(i) ? (isSv ? "Inlagd" : "Applied") : (isSv ? "Använd" : "Apply")}
                  </Button>
                </div>
              ))}
            </div>
          )}
          {genericKw.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{isSv ? "Generiska fraser att byta ut" : "Generic phrases to replace"}</p>
              <div className="flex flex-wrap gap-1">{genericKw.map(p => <Badge key={p} variant="outline" className="text-[9px] h-5">{p}</Badge>)}</div>
            </div>
          )}
          {adTools.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{isSv ? "Verktyg & system i annonsen" : "Tools & systems in the ad"}</p>
              <div className="flex flex-wrap gap-1">
                {adTools.map(t => (
                  <Badge key={t.tool} variant="outline" className={`h-5 text-[9px] ${t.ok ? "border-green-600/50 text-green-700 dark:text-green-500" : "border-warning/60 text-warning"}`}>
                    {t.tool}{t.ok ? " ✓" : ""}
                  </Badge>
                ))}
              </div>
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
                <span className="text-xs font-medium flex items-center gap-1.5">{isSv ? "Punktkvalitet" : "Bullet quality"}</span>
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
        {(() => {
          const matchScore = computeMatchScore(themes);
          if (matchScore === null) return null;
          const gap = biggestGap(themes);
          const accepted = new Set(cv.__meta?.acceptedGaps || []);
          const ratingOf = (t: typeof themes[number]) => Math.round(t.rating ?? (t.evidence === "strong" ? 4 : t.evidence === "missing" ? 1 : 3));
          const allGaps = themes.filter(t => ratingOf(t) < 4);
          const remaining = allGaps.filter(t => !accepted.has(t.theme)).length;
          // "Ready to send" means the WHOLE queue is empty — theme gaps AND the
          // readiness checks. Score and guidance must never contradict on screen.
          const done = remaining === 0 && readiness.length === 0;
          return (
            <>
              <div className={`font-serif text-4xl font-medium ${scoreColor(matchScore)}`}>{matchScore}</div>
              <p className="text-xs font-semibold text-muted-foreground">
                {isSv ? "Matchpoäng · viktad kompetensmatchning" : "Match score · weighted competency match"}
              </p>
              {/* Endowed progress: the meter never starts at zero — lead with what the
                  CV already proves before what remains. */}
              {!done && themes.length - allGaps.length > 0 && (
                <p className="mt-0.5 text-[11px] text-green-700 dark:text-green-500">
                  {themes.length - allGaps.length} {isSv ? `av ${themes.length} teman har redan stark evidens` : `of ${themes.length} themes already carry strong evidence`}
                </p>
              )}
              {!done && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {remaining} {isSv ? `av ${allGaps.length} gap kvar` : `of ${allGaps.length} gaps left`}
                  {gap && !accepted.has(gap.theme) && (
                    <> · {isSv ? "störst:" : "biggest:"} <span className="font-medium text-foreground">{gap.theme}</span></>
                  )}
                </p>
              )}
              {/* Title alignment — recruiters search by title first; own signal, never
                  folded into the score. Deterministic, no model. */}
              {(() => {
                const tm = titleMatch(cv.__meta?.tailoredForJob, cv);
                if (!tm) return null;
                return (
                  <p className="mt-1 text-[11px]">
                    {tm.level === "exact" && <span className="text-green-700 dark:text-green-500">{isSv ? "Titeln matchar annonsens" : "Title matches the ad"} ({tm.cvTitle})</span>}
                    {tm.level === "partial" && <span className="text-warning">{isSv ? `Titeln matchar delvis (${tm.cvTitle})` : `Title partly matches (${tm.cvTitle})`}</span>}
                    {tm.level === "none" && (
                      <span className="text-muted-foreground">
                        {isSv
                          ? `Annonsens titel saknas i CV:t. Rekryterare söker på titel — speglar "${cv.__meta?.tailoredForJob}" din nuvarande roll är profilen rätt plats.`
                          : `The ad's title is absent from the CV. Recruiters search by title — if "${cv.__meta?.tailoredForJob}" reflects your current role, the profile is the place for it.`}
                      </span>
                    )}
                  </p>
                );
              })()}
              {/* Six-second status: one quiet line. The ACTIONS live as queue cards —
                  the overview reports, the queue guides. */}
              {six && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {isSv ? "Toppen visar" : "Top third shows"} {six.themes.filter(t => t.visible).length}/{six.themes.length} {isSv ? "krav-teman" : "must themes"} · {six.quantifiedTop}/{six.topCount} {isSv ? "punkter med siffror" : "bullets with numbers"}
                </p>
              )}
              {done && (
                <div className="mx-auto mt-2 max-w-xs space-y-1.5 rounded-lg border border-green-600/30 bg-green-600/10 p-3">
                  {/* The one celebration in the whole app: a pen-stroke check, drawn once,
                      for the user's own milestone. Nothing else ever celebrates. */}
                  <svg viewBox="0 0 24 24" className="mx-auto h-6 w-6 text-green-700 dark:text-green-500" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path className="check-draw" d="M4 12.5l5.5 5.5L20 6.5" />
                  </svg>
                  <p className="text-xs font-semibold text-green-700 dark:text-green-500">
                    {isSv ? "Redo att skicka" : "Ready to send"} · {matchScore}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {isSv ? "Alla gap är åtgärdade eller ärligt accepterade." : "Every gap is fixed or honestly accepted."}
                  </p>
                  {onDownload && (
                    <Button size="sm" className="h-9 w-full text-xs" onClick={onDownload}>
                      {isSv ? "Ladda ner PDF" : "Download PDF"}
                    </Button>
                  )}
                </div>
              )}
              {typeof window !== "undefined" && !window.localStorage.getItem("matchModelSeen") && (
                <button
                  type="button"
                  className="mt-1 text-[10px] text-muted-foreground underline-offset-2 hover:underline"
                  onClick={(e) => { window.localStorage.setItem("matchModelSeen", "1"); (e.target as HTMLElement).remove(); }}
                >
                  {isSv ? "Ny poängmodell: som en rekryterares scorecard — krav-teman väger dubbelt. (göm)" : "New scoring model: like a recruiter's scorecard — must-themes weigh double. (hide)"}
                </button>
              )}
            </>
          );
        })()}
        {computeMatchScore(themes) !== null ? null : deepResult ? (
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
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
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

      {/* A failed hard requirement is the one thing tailoring can't fix — keep it visible. */}
      {Object.entries(cv.__meta?.knockoutAnswers || {}).some(([, v]) => v === "no") && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
          <span className="font-semibold text-destructive">
            {Object.values(cv.__meta?.knockoutAnswers || {}).filter(v => v === "no").length} {isSv ? "hårt krav ej uppfyllt." : "hard requirement not met."}
          </span>{" "}
          {isSv ? "Trolig gallring i ansökningsformuläret. Sök ändå om rollen är värd det, men vet om oddsen." : "Likely screen-out in the application form. Apply anyway if the role is worth it, but know the odds."}
        </div>
      )}

      {/* ── FIX QUEUE: one card at a time (guided mode) ── */}
      {themes.length > 0 && !showDetails && (() => {
        const accepted = new Set(cv.__meta?.acceptedGaps || []);
        const ratingOf = (t: typeof themes[number]) => Math.round(t.rating ?? (t.evidence === "strong" ? 4 : t.evidence === "missing" ? 1 : 3));
        const gaps = [...themes]
          .filter(t => ratingOf(t) < 4 && !accepted.has(t.theme) && !handledThemes.has(t.theme))
          .sort((a, b) => ((a.importance === "must" ? 0 : 1) - (b.importance === "must" ? 0 : 1)) || (ratingOf(a) - ratingOf(b)));
        const knockouts = cv.__meta?.demandProfile?.knockout_requirements || [];
        const pendingQ = (kwQuestions || [])[0] || null;
        const pIdx = (placements || []).findIndex((_, i) => !appliedPlacements.has(i) && !dismissedPlacements.has(i));
        const nbIdx = (newBullets || []).findIndex((_, i) => !appliedNew.has(i) && !dismissedNew.has(i));
        const rfIdx = (reframes || []).findIndex((_, i) => !appliedReframes.has(i) && !dismissedReframes.has(i));
        const rfLeft = (reframes || []).filter((_, i) => !appliedReframes.has(i) && !dismissedReframes.has(i)).length;
        const busyQ = loadingQ || placing;
        const markHandled = (theme: string) => setHandledThemes(prev => new Set(prev).add(theme));

        // One persistent surface (never remounts); only the CONTENT animates in, keyed
        // per card. Enter 250ms with a 2px blur, no exit animation — the frequent path
        // stays fast, per the frequency rule.
        const card = (key: string, body: React.ReactNode) => (
          <div className="surface-card space-y-3">
            <div key={key} className="card-enter space-y-3">{body}</div>
          </div>
        );

        // The trail: one dot per gap this round, filled as they're handled. The trail is
        // the whole progress meter — no counter to read.
        const trailTotal = Math.min(gaps.length + handledThemes.size, 10);
        const trailDone = Math.min(handledThemes.size, trailTotal);
        // Finite, shrinking goal (goal gradient): a concrete count plus a small time
        // estimate beats any percentage bar. ~45s per card is an honest pace here.
        const cardsLeft =
          (kwQuestions || []).length +
          (placements || []).filter((_, i) => !appliedPlacements.has(i) && !dismissedPlacements.has(i)).length +
          (newBullets || []).filter((_, i) => !appliedNew.has(i) && !dismissedNew.has(i)).length +
          gaps.length + rfLeft + readiness.length +
          themes.filter(t => (t as any).lifted_by_evidence && ratingOf(t) >= 4 && !handledComm.has(t.theme)).length;
        const minsLeft = Math.max(1, Math.round(cardsLeft * 0.75));
        const trail = (trailTotal > 1 || cardsLeft > 0) ? (
          <div className="space-y-1 py-1">
            {trailTotal > 1 && (
              <div className="flex items-center justify-center gap-1.5">
                {Array.from({ length: trailTotal }, (_, i) => (
                  <span key={i} className={`h-2 w-2 rounded-full transition-colors ${i < trailDone ? "bg-primary" : i === trailDone ? "ring-2 ring-primary ring-offset-1 ring-offset-background bg-transparent" : "bg-muted"}`} />
                ))}
              </div>
            )}
            {cardsLeft > 0 && (
              <p className="text-center text-[10px] tabular-nums text-muted-foreground">
                {cardsLeft} {isSv ? "kort kvar" : cardsLeft === 1 ? "card left" : "cards left"} · ~{minsLeft} min
              </p>
            )}
          </div>
        ) : null;

        let content: React.ReactNode;
        if (knockouts.length > 0 && !cv.__meta?.knockoutsAcked) {
          // Hard requirements answered one by one — the only true auto-rejections,
          // so a "no" is said out loud instead of discovered after four hours of tailoring.
          const answers = cv.__meta?.knockoutAnswers || {};
          const allAnswered = knockouts.every(k => answers[k]);
          content = card("knockouts", <>
            <p className="text-lg font-semibold leading-snug [text-wrap:balance]">{isSv ? "Uppfyller du de hårda kraven?" : "Do you meet the hard requirements?"}</p>
            <p className="text-xs text-muted-foreground">{isSv ? "De enda automatiska avslagen. CV-formuleringar hjälper inte här, bara ärliga svar." : "The only automatic rejections. CV wording can't help here, only honest answers."}</p>
            <div className="space-y-2">
              {knockouts.map(k => (
                <div key={k} className="flex items-center justify-between gap-3 rounded-md border border-border p-2.5">
                  <span className="text-sm leading-snug">
                    {k}
                    {(() => {
                      // Quantitative requirements meet the timeline: "5 års erfarenhet av X"
                      // is answered with your own merged role periods, deterministically.
                      const req = parseYearsRequirement(k);
                      if (!req) return null;
                      const have = yearsOfExperience(cv, req.subject);
                      return (
                        <span className={`block text-[11px] ${have >= req.years ? "text-green-700 dark:text-green-500" : "text-muted-foreground"}`}>
                          {isSv
                            ? `Din tidslinje: ~${have} år${have >= req.years ? " — kravet täckt" : ` av ${req.years}`}`
                            : `Your timeline: ~${have} yrs${have >= req.years ? " — requirement met" : ` of ${req.years}`}`}
                        </span>
                      );
                    })()}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {(["yes", "no"] as const).map(v => (
                      <button key={v} type="button"
                        onClick={() => onUpdateMeta?.({ knockoutAnswers: { ...answers, [k]: v } })}
                        className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${answers[k] === v
                          ? v === "yes" ? "border-green-700 bg-green-600/10 text-green-700 dark:text-green-500" : "border-destructive bg-destructive/10 text-destructive"
                          : "border-border text-muted-foreground hover:bg-muted"}`}>
                        {v === "yes" ? (isSv ? "Ja" : "Yes") : (isSv ? "Nej" : "No")}
                      </button>
                    ))}
                  </span>
                </div>
              ))}
            </div>
            {onUpdateMeta && (
              <Button className="h-11 w-full text-sm" disabled={!allAnswered} onClick={() => onUpdateMeta({ knockoutsAcked: true })}>
                {allAnswered ? (isSv ? "Fortsätt" : "Continue") : (isSv ? "Svara på alla först" : "Answer all first")}
              </Button>
            )}
          </>);
        } else if (busyQ) {
          content = card("busy", <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{loadingQ ? (isSv ? "Skapar fråga…" : "Creating question…") : (isSv ? "Letar ärliga placeringar…" : "Finding honest placements…")}</p>);
        } else if (pendingQ) {
          content = card(`q:${pendingQ.keyword}`, <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{isSv ? "Fråga" : "Question"}</span>
              <span className="text-[10px] text-muted-foreground">{(kwQuestions || []).length} {isSv ? "kvar" : "left"}</span>
            </div>
            <p className="text-lg font-semibold leading-snug [text-wrap:balance]">{pendingQ.question}</p>
            {/* Every question justifies itself: the answer maps to a named demand in the ad. */}
            <p className="text-[11px] text-muted-foreground">
              {isSv ? <>Svaret täcker annonsens krav på <span className="font-medium text-foreground">{pendingQ.keyword}</span>.</> : <>Your answer covers the ad's demand for <span className="font-medium text-foreground">{pendingQ.keyword}</span>.</>}
            </p>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{isSv ? "Kryssa det som stämmer, flera går bra" : "Tick what's true, several ok"}</p>
              {optionsFor(pendingQ).map(opt => (
                <button key={opt} type="button" onClick={() => toggleChoice(pendingQ.keyword, opt)}
                  className={`w-full rounded-xl border p-3 text-left text-sm leading-relaxed transition-colors ${(kwChoice[pendingQ.keyword] || []).includes(opt) ? "border-primary bg-primary/10 font-medium" : "border-border hover:bg-muted"}`}>
                  {opt}
                </button>
              ))}
            </div>
            <Textarea rows={2} value={kwAnswers[pendingQ.keyword] || ""}
              onChange={e => setKwAnswers(prev => ({ ...prev, [pendingQ.keyword]: e.target.value }))}
              placeholder={pendingQ.hint || (isSv ? "Detalj: system, omfattning, resultat…" : "Detail: system, scope, outcome…")} className="text-sm" />
            {roleSelect(pendingQ.keyword, "h-10 text-xs")}
            <div className="flex gap-2">
              <Button className="h-11 flex-1 text-sm" disabled={!canSubmitQ(pendingQ)} onClick={() => submitOneAnswer(pendingQ)}>
                {isSv ? "Skicka" : "Submit"}
              </Button>
              <Button variant="outline" className="h-11 text-sm" onClick={() => dismissQuestion(pendingQ.keyword)}>{isSv ? "Har inte" : "Don't have it"}</Button>
            </div>
          </>);
        } else if (pIdx >= 0) {
          const p = placements![pIdx];
          content = card(`p:${pIdx}`, <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{isSv ? "Ordbyte" : "Word swap"}</span>
              <Badge variant="secondary" className="h-5 text-[9px]">{p.keyword}</Badge>
            </div>
            <p className="text-lg font-semibold leading-snug">{isSv ? "Byt några ord i en punkt:" : "Swap a few words in one bullet:"}</p>
            {renderPlacementDiff(p)}
            <div className="flex gap-2">
              <Button className="h-11 flex-1 text-sm" onClick={() => applyPlacement(p, pIdx)}>{isSv ? "Använd" : "Accept"}</Button>
              <Button variant="outline" className="h-11 text-sm" onClick={() => setDismissedPlacements(prev => new Set(prev).add(pIdx))}>{isSv ? "Avvisa" : "Dismiss"}</Button>
            </div>
          </>);
        } else if (nbIdx >= 0) {
          const nb = newBullets![nbIdx];
          content = card(`nb:${nbIdx}`, <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{isSv ? "Ny punkt, byggd på ditt svar" : "New bullet, built from your answer"}</span>
              <Badge variant="secondary" className="h-5 text-[9px]">{nb.keyword}</Badge>
            </div>
            <p className="ai-ink text-sm leading-relaxed">{nb.bullet}</p>
            <div className="flex gap-2">
              <Button className="h-11 flex-1 text-sm" onClick={() => applyNewBullet(nb, nbIdx)}>{isSv ? "Lägg till" : "Add"}</Button>
              <Button variant="outline" className="h-11 text-sm" onClick={() => setDismissedNew(prev => new Set(prev).add(nbIdx))}>{isSv ? "Avvisa" : "Dismiss"}</Button>
            </div>
          </>);
        } else if (gaps.length > 0) {
          const g = gaps[0];
          const r = ratingOf(g);
          const terms = g.supporting_terms_missing || [];
          content = card(`gap:${g.theme}`, <>
            <div className="flex items-center gap-1.5">
              {g.importance === "must" && <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">{isSv ? "Krav i annonsen" : "Required in the ad"}</span>}
              <span className="ml-auto flex items-center gap-0.5">{[1, 2, 3, 4, 5].map(n => <span key={n} className={`h-1.5 w-1.5 rounded-full ${n <= r ? (r >= 4 ? "bg-green-600" : r >= 2 ? "bg-warning" : "bg-destructive") : "bg-muted"}`} />)}</span>
            </div>
            <p className="text-lg font-semibold leading-snug [text-wrap:balance]">
              {isSv ? <>Annonsen kräver: {g.theme}</> : <>The ad requires: {g.theme}</>}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">{g.evidence_note || (isSv ? "Ditt CV visar det inte än." : "Your CV doesn't show it yet.")}</p>
            {/* What the NEXT level takes (SFIA logic) — the question targets exactly this. */}
            {(() => {
              const nxt: Record<number, [string, string]> = {
                1: ["grundbevis: var och när du gjort arbetet", "basic proof: where and when you did the work"],
                2: ["eget ansvar: att du drev arbetet, inte bara deltog", "ownership: you drove the work, not just took part"],
                3: ["ägarskap plus mätbart utfall, siffror på effekten", "ownership plus a measurable outcome, numbers on the effect"],
                4: ["att CV:t självt visar det, femman kräver synlighet", "the CV itself showing it, a five requires visibility"],
              };
              const t = nxt[Math.min(r, 4)];
              return t ? (
                <p className="text-[11px] text-muted-foreground">
                  {isSv ? "För nivå" : "For level"} {Math.min(r + 1, 5)}: {isSv ? t[0] : t[1]}
                </p>
              ) : null;
            })()}
            <div className="space-y-2 pt-1">
              {canFix && (
                <Button className="h-11 w-full text-sm" onClick={() => { markHandled(g.theme); fetchQuestions([g.theme, ...terms]); }}>
                  {isSv ? "Svara på en fråga" : "Answer one question"}
                </Button>
              )}
              <div className="flex gap-2">
                {terms.length > 0 && canFix && (
                  <Button variant="outline" className="h-10 flex-1 text-sm" onClick={() => { markHandled(g.theme); runPlacements(terms); }}>
                    {isSv ? `Ordval (${terms.length})` : `Wording (${terms.length})`}
                  </Button>
                )}
                {onUpdateMeta && (
                  <Button variant="outline" className="h-10 flex-1 text-sm" onClick={() => onUpdateMeta({ acceptedGaps: [...(cv.__meta?.acceptedGaps || []), g.theme] })}>
                    {isSv ? "Ärligt gap" : "Honest gap"}
                  </Button>
                )}
              </div>
              <button type="button" className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => markHandled(g.theme)}>
                {isSv ? "Hoppa över →" : "Skip →"}
              </button>
            </div>
          </>);
        } else if (rfIdx >= 0) {
          const rf = reframes![rfIdx];
          content = card(`rf:${rfIdx}`, <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{isSv ? "Omformulering" : "Reframe"}</span>
              <span className="text-[10px] text-muted-foreground">{rfLeft} {isSv ? "kvar" : "left"}</span>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground line-through">{rf.original}</p>
            <p className="ai-ink text-sm leading-relaxed">{rf.suggested}</p>
            <p className="text-[11px] text-muted-foreground">{rf.reason}</p>
            <div className="flex gap-2">
              <Button className="h-11 flex-1 text-sm" onClick={() => {
                appliedSinceScanRef.current = true;
                const ok = onApplyReframe?.(rf.experience_id, rf.original, rf.suggested);
                if (ok === false) toast({ title: isSv ? "Hittade inte punkten" : "Couldn't find the bullet", description: isSv ? "Punkten kan ha ändrats sedan analysen." : "The bullet may have changed since the analysis.", variant: "destructive" });
                setAppliedReframes(prev => new Set(prev).add(rfIdx));
              }}>{isSv ? "Använd" : "Accept"}</Button>
              <Button variant="outline" className="h-11 text-sm" onClick={() => setDismissedReframes(prev => new Set(prev).add(rfIdx))}>{isSv ? "Avvisa" : "Dismiss"}</Button>
            </div>
          </>);
        } else if ((() => themes.some(t => (t as any).lifted_by_evidence && ratingOf(t) >= 4 && !handledComm.has(t.theme)))()) {
          // Proven via answers but invisible in the CV — a communication gap, not a
          // competence gap. The recruiter only sees the CV; get it in there.
          const g = themes.find(t => (t as any).lifted_by_evidence && ratingOf(t) >= 4 && !handledComm.has(t.theme))!;
          content = card(`comm:${g.theme}`, <>
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-green-700 dark:text-green-500">{isSv ? "Bevisat" : "Proven"}</span>
            <p className="text-lg font-semibold leading-snug [text-wrap:balance]">{g.theme}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {isSv ? "Styrkt via dina svar, men CV:t visar det inte än. Rekryteraren ser bara CV:t." : "Verified through your answers, but the CV doesn't show it yet. The recruiter only sees the CV."}
            </p>
            <div className="flex gap-2">
              <Button className="h-11 flex-1 text-sm" onClick={() => {
                setHandledComm(prev => new Set(prev).add(g.theme));
                const nn = (s: string) => s.toLowerCase().trim();
                const evs = (cv.__meta?.verifiedEvidence || []).filter(e => nn(g.theme).includes(nn(e.keyword)) || nn(e.keyword).includes(nn(g.theme)));
                runPlacements(
                  g.supporting_terms_missing?.length ? g.supporting_terms_missing : [g.theme],
                  evs.map(e => ({ keyword: e.keyword, answer: e.role ? `${e.answer} (i rollen: ${e.role})` : e.answer, role: e.role })),
                );
              }}>{isSv ? "Få in det i CV:t" : "Get it into the CV"}</Button>
              <Button variant="outline" className="h-11 text-sm" onClick={() => setHandledComm(prev => new Set(prev).add(g.theme))}>{isSv ? "Senare" : "Later"}</Button>
            </div>
          </>);
        } else if (readiness.length > 0) {
          // Färdigmodellen as cards: document-level checks the score can't see —
          // top-third visibility, profile coverage, empty fields, page budget, skills.
          const rc = readiness[0];
          const KIND_LABEL: Record<typeof rc.kind, [string, string]> = {
            issues: ["Dokumentet", "Document"],
            six: ["Sexsekunderstestet", "Six-second test"],
            profile: ["Profiltexten", "Profile paragraph"],
            scope: ["Rollomfång", "Role scope"],
            length: ["Längden", "Length"],
            skills: ["Skills-sektionen", "Skills section"],
          };
          const sixFix = rc.kind === "six" && six?.suggestion && six.suggestion.theme === rc.theme;
          content = card(`ready:${rc.id}`, <>
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{isSv ? KIND_LABEL[rc.kind][0] : KIND_LABEL[rc.kind][1]}</span>
            <p className="text-lg font-semibold leading-snug [text-wrap:balance]">{rc.title}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">{rc.body}</p>
            {rc.kind === "skills" && skillsRows()}
            {rc.kind === "length" && (
              <ul className="list-disc pl-4 text-[11px] text-muted-foreground">
                {shortenTargets(cv).map(t => <li key={t.label}>{t.label}</li>)}
              </ul>
            )}
            {rc.kind === "profile" && rc.theme && (() => {
              const dp = themes.find(t => t.theme === rc.theme);
              const words = [...(dp?.supporting_terms_present || []), ...(dp?.supporting_terms_missing || [])].slice(0, 4);
              return words.length ? (
                <p className="text-[11px] text-muted-foreground">{isSv ? "Ord att väva in:" : "Words to weave in:"} <span className="font-medium text-foreground">{words.join(" · ")}</span></p>
              ) : null;
            })()}
            <div className="flex gap-2">
              {rc.kind === "issues" && (
                <Button className="h-11 flex-1 text-sm" onClick={() => setShowDetails(true)}>{isSv ? "Visa problemen" : "Show the issues"}</Button>
              )}
              {sixFix && (
                <Button className="h-11 flex-1 text-sm" onClick={moveProofUp}>{isSv ? "Flytta upp bevispunkten" : "Move the proof bullet up"}</Button>
              )}
              {rc.kind === "six" && !sixFix && (
                <Button className="h-11 flex-1 text-sm" onClick={() => onNavigateToSection?.("experience")}>{isSv ? "Öppna erfarenheten" : "Open experience"}</Button>
              )}
              {rc.kind === "profile" && (
                <Button className="h-11 flex-1 text-sm" onClick={() => onNavigateToSection?.("profile")}>{isSv ? "Öppna profilen" : "Open the profile"}</Button>
              )}
              {(rc.kind === "scope" || rc.kind === "length") && (
                <Button className="h-11 flex-1 text-sm" onClick={() => onNavigateToSection?.("experience")}>{isSv ? "Öppna erfarenheten" : "Open experience"}</Button>
              )}
              {rc.kind === "skills" && (
                <Button className="h-11 flex-1 text-sm" onClick={() => acceptCheck(rc.id)}>{isSv ? "Klart för nu" : "Done for now"}</Button>
              )}
              {rc.kind !== "skills" && onUpdateMeta && (
                <Button variant="outline" className="h-11 text-sm" onClick={() => acceptCheck(rc.id)}>{isSv ? "Lämna som det är" : "Leave as is"}</Button>
              )}
            </div>
          </>);
        } else {
          const anyHandled = handledThemes.size > 0 || appliedReframes.size > 0;
          const curScore = computeMatchScore(themes) ?? (deepResult ? Math.round(deepResult.overall_score) : null);
          const showDelta = !anyHandled && curScore !== null && lastDelta !== null && lastDelta !== 0;
          content = card("done", <>
            {showDelta ? (
              <p className="font-serif text-4xl font-medium tabular-nums">
                <span className="text-muted-foreground/50">{curScore! - lastDelta!}</span>
                <span className="mx-2 text-muted-foreground/50">→</span>
                <span className={scoreColor(curScore!)}>{curScore}</span>
              </p>
            ) : (
              <p className="text-lg font-semibold leading-snug text-green-700 dark:text-green-500">✓ {isSv ? "Alla kort hanterade" : "All cards handled"}</p>
            )}
            <p className="text-sm text-muted-foreground">
              {anyHandled
                ? (isSv ? "Kör om analysen så ser du nya poängen." : "Re-run the analysis to see the new score.")
                : (isSv ? "Nedladdningen ligger i rutan ovanför." : "The download lives in the box above.")}
            </p>
            {/* Download lives ONLY in the "ready to send" box up top — one end state,
                not two competing ones. */}
            {anyHandled && (
              <Button className="h-11 w-full text-sm" disabled={loading} onClick={() => { setHandledThemes(new Set()); runDeep(); }}>
                {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}{isSv ? "Uppdatera poängen" : "Update the score"}
              </Button>
            )}
            {/* Skill inference, honesty preserved: the AI only proposes QUESTIONS about
                what the CV implies but never states — you stay the gate. */}
            <button type="button" className="w-full text-center text-[11px] text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
              disabled={inferring} onClick={exploreHidden}>
              {inferring ? (isSv ? "Letar dold kompetens…" : "Looking for hidden competence…") : (isSv ? "Utforska dold kompetens →" : "Explore hidden competence →")}
            </button>
          </>);
        }
        return <div className="space-y-2">{trail}{content}</div>;
      })()}

      {/* One toggle between guided queue and the full dashboard. */}
      {themes.length > 0 && (
        <button type="button" className="w-full text-center text-[11px] text-muted-foreground underline-offset-2 hover:underline" onClick={() => setShowDetails(v => !v)}>
          {showDetails ? (isSv ? "↑ Tillbaka till guiden" : "↑ Back to the guide") : (isSv ? "Visa detaljer" : "Show details")}
        </button>
      )}

      <div className={themes.length > 0 && !showDetails ? "hidden" : "space-y-4"}>
      {/* ── What to fix: ATS buckets ── */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
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
      {/* Observability: which engine actually answered, and how often the guards fired. */}
      {(deepResult as any)?._meta?.model && (
        <p className="text-center text-[10px] text-muted-foreground">
          {isSv ? "Motor" : "Engine"}: {(deepResult as any)._meta.model}
          {Object.entries(((deepResult as any)._meta.guards || {}) as Record<string, number>)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => ` · ${k}: ${v}`)
            .join("")}
        </p>
      )}
      </div>{/* end details wrapper (hidden in guided mode) */}
    </div>
  );
}
