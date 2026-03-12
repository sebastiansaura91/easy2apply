import { useState, useRef, useEffect, useCallback } from "react";
import {
  MessageCircle,
  Send,
  Loader2,
  X,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { detectProfile } from "@/lib/bullet-detect";
import { getProfile, PROFILES } from "@/lib/bullet-profiles";
import type {
  BulletCoachState,
  CoachMessage,
  CoachSuggestion,
  VerifiedFact,
  FactKey,
  ProfileId,
  ProfileDetection,
} from "@/types/bullet-coach";

interface BulletCoachChatProps {
  open: boolean;
  onClose: () => void;
  bulletId: string;
  bulletText: string;
  roleTitle?: string;
  company?: string;
  surroundingBullets?: string[];
  jobPostingText?: string;
  cvLanguage: "sv" | "en";
  onApply: (bulletId: string, newText: string) => void;
}

export function BulletCoachChat({
  open,
  onClose,
  bulletId,
  bulletText,
  roleTitle,
  company,
  surroundingBullets,
  jobPostingText,
  cvLanguage,
  onApply,
}: BulletCoachChatProps) {
  const [detection, setDetection] = useState<ProfileDetection>(() =>
    detectProfile(bulletText, roleTitle, surroundingBullets, jobPostingText)
  );
  const [profileId, setProfileId] = useState<ProfileId>(detection.profile);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [facts, setFacts] = useState<VerifiedFact[]>([]);
  const [suggestions, setSuggestions] = useState<CoachSuggestion[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const [questionsAsked, setQuestionsAsked] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const profile = getProfile(profileId);

  // Re-detect when bullet changes
  useEffect(() => {
    const d = detectProfile(bulletText, roleTitle, surroundingBullets, jobPostingText);
    setDetection(d);
    setProfileId(d.profile);
    setMessages([]);
    setFacts([]);
    setSuggestions([]);
    setQuestionsAsked(0);
    setShowProfilePicker(false);
  }, [bulletId]);

  // Initial greeting
  useEffect(() => {
    if (open && messages.length === 0) {
      const p = getProfile(profileId);
      const q = p.questions[cvLanguage][0];
      const greeting: CoachMessage = {
        role: "assistant",
        content: q,
      };
      setMessages([greeting]);
      setQuestionsAsked(1);
    }
  }, [open, profileId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, suggestions]);

  const handleChangeProfile = (newId: ProfileId) => {
    setProfileId(newId);
    setShowProfilePicker(false);
    setMessages([]);
    setFacts([]);
    setSuggestions([]);
    setQuestionsAsked(0);
    // Will trigger initial greeting via useEffect
  };

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;

    const userMsg: CoachMessage = { role: "user", content: input.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("bullet-coach", {
        body: {
          action: "chat",
          original_bullet: bulletText,
          role_title: roleTitle,
          profile_id: profileId,
          profile_label: profile.label[cvLanguage],
          questions: profile.questions[cvLanguage],
          verified_facts: factsToObject(facts),
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          system_language: cvLanguage,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Extract facts
      const newFacts = [...facts];
      if (data.extracted_facts) {
        for (const [key, value] of Object.entries(data.extracted_facts)) {
          if (value && typeof value === "string" && value.trim()) {
            const existing = newFacts.findIndex((f) => f.key === key);
            if (existing >= 0) {
              newFacts[existing] = { key: key as FactKey, value: value as string, source: "user" };
            } else {
              newFacts.push({ key: key as FactKey, value: value as string, source: "user" });
            }
          }
        }
        setFacts(newFacts);
      }

      // Add assistant message
      const assistantMsg: CoachMessage = { role: "assistant", content: data.message };
      setMessages([...updatedMessages, assistantMsg]);
      setQuestionsAsked((q) => q + 1);

      // Auto-generate suggestions if enough facts
      if (data.has_enough_facts || newFacts.length >= 2) {
        generateSuggestions(newFacts);
      }
    } catch (err: any) {
      toast({
        title: cvLanguage === "en" ? "Coach error" : "Coach-fel",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [input, messages, facts, loading, bulletText, roleTitle, profileId, profile, cvLanguage]);

  const generateSuggestions = async (currentFacts?: VerifiedFact[]) => {
    setSuggestionsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("bullet-coach", {
        body: {
          action: "generate_suggestions",
          original_bullet: bulletText,
          role_title: roleTitle,
          profile_id: profileId,
          profile_label: profile.label[cvLanguage],
          verified_facts: factsToObject(currentFacts || facts),
          rewrite_templates: profile.rewrite_templates[cvLanguage],
          allowed_verbs: profile.allowed_verbs[cvLanguage],
          system_language: cvLanguage,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSuggestions(data.suggestions || []);
    } catch (err: any) {
      toast({
        title: cvLanguage === "en" ? "Suggestion error" : "Förslag-fel",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const handleApply = (text: string) => {
    onApply(bulletId, text);
    toast({
      title: cvLanguage === "en" ? "Bullet updated" : "Punkt uppdaterad",
    });
    onClose();
  };

  const confidenceColor = {
    high: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    low: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="p-4 pb-3 border-b border-border flex-shrink-0">
          <SheetTitle className="text-sm">
            {cvLanguage === "en" ? "Bullet Coach" : "Punkt-coach"}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Original bullet */}
          <div className="p-3 border-b border-border bg-muted/30 flex-shrink-0">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
              {cvLanguage === "en" ? "Original" : "Original"}
            </p>
            <p className="text-xs text-foreground">{bulletText}</p>
          </div>

          {/* Profile detection */}
          <div className="p-3 border-b border-border flex items-center gap-2 flex-wrap flex-shrink-0">
            <Badge variant="outline" className="text-[10px] h-5">
              {profile.label[cvLanguage]}
            </Badge>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-medium ${confidenceColor[detection.confidence]}`}>
              {detection.confidence === "high"
                ? (cvLanguage === "en" ? "High" : "Hög")
                : detection.confidence === "medium"
                ? (cvLanguage === "en" ? "Medium" : "Medel")
                : (cvLanguage === "en" ? "Low" : "Låg")}
            </span>
            {detection.evidence && (
              <span className="text-[9px] text-muted-foreground italic truncate max-w-[180px]">
                {detection.evidence}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-[10px] px-2 ml-auto"
              onClick={() => setShowProfilePicker(!showProfilePicker)}
            >
              {cvLanguage === "en" ? "Change" : "Ändra"}
            </Button>
          </div>

          {/* Profile picker */}
          {showProfilePicker && (
            <div className="p-3 border-b border-border bg-accent/30 flex-shrink-0">
              <p className="text-[10px] font-medium text-muted-foreground mb-2">
                {cvLanguage === "en" ? "Select profile:" : "Välj profil:"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {PROFILES.map((p) => (
                  <Button
                    key={p.id}
                    variant={p.id === profileId ? "default" : "outline"}
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={() => handleChangeProfile(p.id)}
                  >
                    {p.label[cvLanguage]}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Verified facts */}
          {facts.length > 0 && (
            <div className="p-3 border-b border-border flex-shrink-0">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                {cvLanguage === "en" ? "Verified facts" : "Bekräftade fakta"}
              </p>
              <div className="flex flex-wrap gap-1">
                {facts.map((f) => (
                  <Badge key={f.key} variant="secondary" className="text-[9px] h-5 gap-1">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    {factLabel(f.key, cvLanguage)}: {f.value}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Chat messages */}
          <ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
            <div className="p-3 space-y-3">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Suggestions A/B/C */}
          {(suggestions.length > 0 || suggestionsLoading) && (
            <div className="p-3 border-t border-border flex-shrink-0 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  {cvLanguage === "en" ? "Suggestions" : "Förslag"}
                </p>
                {suggestions.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 text-[9px] px-1.5"
                    onClick={() => generateSuggestions()}
                    disabled={suggestionsLoading}
                  >
                    <RefreshCw className={`h-2.5 w-2.5 mr-1 ${suggestionsLoading ? "animate-spin" : ""}`} />
                    {cvLanguage === "en" ? "Regenerate" : "Regenerera"}
                  </Button>
                )}
              </div>
              {suggestionsLoading && suggestions.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {cvLanguage === "en" ? "Generating suggestions..." : "Genererar förslag..."}
                </div>
              ) : (
                suggestions.map((s, i) => (
                  <Card key={i} className="border-primary/20 bg-primary/5">
                    <CardContent className="p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[9px] h-4 font-bold">
                            {s.label}
                          </Badge>
                          <span className="text-[9px] text-green-600 dark:text-green-400">
                            {s.estimated_gain}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="default"
                          className="h-5 text-[10px] px-2"
                          onClick={() => handleApply(s.text)}
                        >
                          Apply
                        </Button>
                      </div>
                      <p className="text-xs italic text-foreground">{s.text}</p>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {/* Generate button (if facts >= 2 and no suggestions yet) */}
          {facts.length >= 2 && suggestions.length === 0 && !suggestionsLoading && (
            <div className="p-3 border-t border-border flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5 text-xs"
                onClick={() => generateSuggestions()}
              >
                <Sparkles className="h-3 w-3" />
                {cvLanguage === "en" ? "Generate A/B/C suggestions" : "Generera A/B/C-förslag"}
              </Button>
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-border flex-shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
              className="flex gap-2"
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={cvLanguage === "en" ? "Your answer..." : "Ditt svar..."}
                className="text-xs h-8"
                disabled={loading}
              />
              <Button type="submit" size="sm" className="h-8 px-3" disabled={loading || !input.trim()}>
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              </Button>
            </form>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Helpers ──

function factsToObject(facts: VerifiedFact[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const f of facts) {
    obj[f.key] = f.value;
  }
  return obj;
}

function factLabel(key: FactKey, lang: "sv" | "en"): string {
  const labels: Record<FactKey, { sv: string; en: string }> = {
    decision_purpose: { sv: "Syfte", en: "Purpose" },
    stakeholders: { sv: "Intressenter", en: "Stakeholders" },
    method_tool: { sv: "Metod/verktyg", en: "Method/tool" },
    scope: { sv: "Scope", en: "Scope" },
    outcome_metric: { sv: "Utfall", en: "Outcome" },
    seniority: { sv: "Senioritet", en: "Seniority" },
  };
  return labels[key]?.[lang] || key;
}
