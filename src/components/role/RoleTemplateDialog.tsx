import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/i18n/LanguageContext";
import { useFlow } from "@/contexts/FlowContext";
import { ROLE_PRESETS, roleLabel } from "@/lib/role-advice";
import { RoleAdvicePanel } from "./RoleAdvicePanel";

const CUSTOM = "__custom__";

/** A CV the user can start a template/application from (profile or an existing template). */
export interface BaseOption { id: string; title: string; language: string; }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** CVs the user can start from — profile first, then templates. */
  bases: BaseOption[];
  userId: string | undefined;
  onCreated?: () => void;
  /** "application" tailors a job-specific copy (default); "template" creates a reusable role master. */
  mode?: "application" | "template";
  /** Preselect a source (e.g. tailoring from a specific template). */
  defaultBaseId?: string;
}

/**
 * Create either a reusable role TEMPLATE or a job-tailored APPLICATION from a chosen base
 * (profile or an existing template). The base's facts are copied; only emphasis/metadata
 * change. Never mutates the base.
 */
export function RoleTemplateDialog({ open, onOpenChange, bases, userId, onCreated, mode = "application", defaultBaseId }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { language } = useLanguage();
  const flow = useFlow();
  const isSv = language === "sv";
  const isTemplateMode = mode === "template";
  const [roleId, setRoleId] = useState<string>(ROLE_PRESETS[0].id);
  const [customLabel, setCustomLabel] = useState("");
  const [jobText, setJobText] = useState("");
  const [selectedBaseId, setSelectedBaseId] = useState<string | undefined>(defaultBaseId ?? bases[0]?.id);
  const [creating, setCreating] = useState(false);

  // Reset the source selection each time the dialog opens.
  useEffect(() => {
    if (open) setSelectedBaseId(defaultBaseId ?? bases[0]?.id);
  }, [open, defaultBaseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const base = bases.find((b) => b.id === selectedBaseId) ?? bases[0] ?? null;
  const isCustom = roleId === CUSTOM;
  const selectedLabel = isCustom ? (customLabel.trim() || (isSv ? "Egen roll" : "Custom role")) : roleLabel(roleId, null, language);

  const create = async () => {
    if (!base || !userId) return;
    if (isCustom && !customLabel.trim()) {
      toast({ title: isSv ? "Ange en rolltitel" : "Enter a role title", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const { data, error: fetchErr } = await supabase
        .from("resumes").select("content_json").eq("id", base.id).single();
      if (fetchErr) throw fetchErr;

      const baseContent = (data?.content_json as any) || {};
      const prevMeta = baseContent.__meta || {};
      const newId = uuidv4();
      const title = isTemplateMode
        ? `${selectedLabel} (${isSv ? "mall" : "template"})`
        : `${selectedLabel} – ${base.title}`;

      const content = {
        ...baseContent,
        __meta: {
          ...prevMeta,
          isTemplate: isTemplateMode,
          isBaseProfile: false,
          createdFrom: base.id,
          targetRole: isCustom ? undefined : roleId,
          targetRoleLabel: isCustom ? customLabel.trim() : undefined,
          tailoredForJob: undefined,
          tailoredForCompany: undefined,
          // Templates aren't tied to a specific posting; applications persist the pasted one.
          jobPostingText: isTemplateMode ? undefined : (jobText.trim() || undefined),
        },
      };

      const { error } = await supabase.from("resumes").insert({
        id: newId, user_id: userId, title, language: base.language,
        template_id: "default", content_json: content,
      });
      if (error) throw error;

      if (!isTemplateMode) {
        // Carry the pasted posting into the editor so role-fit can sharpen against it.
        flow.setResumeId(newId);
        flow.setJobPostingText(jobText.trim());
      }

      onCreated?.();
      toast({
        title: isTemplateMode
          ? (isSv ? "Mall skapad" : "Template created")
          : (isSv ? "Ansökan skapad" : "Application created"),
      });
      onOpenChange(false);
      navigate(`/editor/${newId}`);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            {isTemplateMode ? (isSv ? "Ny mall" : "New template") : (isSv ? "Rikta CV" : "Tailor a CV")}
          </DialogTitle>
          <DialogDescription>
            {isTemplateMode
              ? (isSv
                  ? "Skapa en återanvändbar mall för en roll, byggd på dina fakta. Rikta sedan ansökningar från mallen."
                  : "Create a reusable master template for a role, built on your facts. Then tailor applications from it.")
              : (isSv
                  ? "Välj vad du utgår från och en målroll, klistra ev. in en jobbannons — vi skapar en ansökan du vinklar mot målet. Dina fakta ändras inte."
                  : "Pick what to start from and a target role, optionally paste a posting — we create an application you angle toward the target. Your facts don't change.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {bases.length > 1 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {isSv ? "Utgå från" : "Start from"}
              </label>
              <Select value={selectedBaseId} onValueChange={setSelectedBaseId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {bases.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {isSv ? "Målroll" : "Target role"}
            </label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLE_PRESETS.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.label[language]}</SelectItem>
                ))}
                <SelectItem value={CUSTOM}>{isSv ? "Egen roll…" : "Custom role…"}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isCustom ? (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {isSv ? "Rolltitel" : "Role title"}
              </label>
              <Input
                autoFocus
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder={isSv ? "t.ex. VP Customer Experience" : "e.g. VP Customer Experience"}
              />
              <p className="text-xs text-muted-foreground">
                {isSv
                  ? "Egna roller får ingen färdig rådmall — du vinklar CV:t själv i editorn."
                  : "Custom roles have no preset advice — you angle the CV yourself in the editor."}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-border p-3">
              <RoleAdvicePanel roleId={roleId} />
            </div>
          )}

          {!isTemplateMode && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {isSv ? "Jobbannons (valfritt)" : "Job posting (optional)"}
              </label>
              <Textarea
                value={jobText}
                onChange={(e) => setJobText(e.target.value)}
                placeholder={isSv ? "Klistra in annonsen för att skärpa mot just det jobbet…" : "Paste the posting to sharpen against this specific job…"}
                className="min-h-[70px] text-sm"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            {isSv ? "Avbryt" : "Cancel"}
          </Button>
          <Button onClick={create} disabled={creating || !base}>
            {creating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Target className="h-4 w-4 mr-1" />}
            {isTemplateMode ? (isSv ? "Skapa mall" : "Create template") : (isSv ? "Skapa ansökan" : "Create application")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
