import { useState } from "react";
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The profile the CV is tailored from — its facts stay, emphasis changes. */
  base: { id: string; title: string; language: string } | null;
  userId: string | undefined;
  onCreated?: () => void;
}

/**
 * "Rikta CV" — the single tailoring flow. From the profile, pick a target role and
 * optionally paste a specific job posting. We copy the profile into a fresh application
 * the user then angles for the role (guided by role-fit). Never mutates the profile.
 */
export function RoleTemplateDialog({ open, onOpenChange, base, userId, onCreated }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { language } = useLanguage();
  const flow = useFlow();
  const isSv = language === "sv";
  const [roleId, setRoleId] = useState<string>(ROLE_PRESETS[0].id);
  const [customLabel, setCustomLabel] = useState("");
  const [jobText, setJobText] = useState("");
  const [creating, setCreating] = useState(false);

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
      const title = `${selectedLabel} – ${base.title}`;

      const content = {
        ...baseContent,
        __meta: {
          ...prevMeta,
          // This is an application (an angled copy), never the profile or a template.
          isTemplate: false,
          isBaseProfile: false,
          createdFrom: base.id,
          targetRole: isCustom ? undefined : roleId,
          targetRoleLabel: isCustom ? customLabel.trim() : undefined,
          tailoredForJob: undefined,
          tailoredForCompany: undefined,
        },
      };

      const { error } = await supabase.from("resumes").insert({
        id: newId, user_id: userId, title, language: base.language,
        template_id: "default", content_json: content,
      });
      if (error) throw error;

      // Carry the pasted posting into the editor so role-fit can sharpen against it.
      flow.setResumeId(newId);
      flow.setJobPostingText(jobText.trim());

      onCreated?.();
      toast({ title: isSv ? "Ansökan skapad" : "Application created" });
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
            {isSv ? "Rikta CV" : "Tailor a CV"}
          </DialogTitle>
          <DialogDescription>
            {isSv
              ? "Från din profil. Välj en roll och klistra ev. in en jobbannons — vi skapar en ansökan du vinklar mot målet. Dina fakta ändras inte."
              : "From your profile. Pick a role and optionally paste a posting — we create an application you angle toward the target. Your facts don't change."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            {isSv ? "Avbryt" : "Cancel"}
          </Button>
          <Button onClick={create} disabled={creating || !base}>
            {creating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Target className="h-4 w-4 mr-1" />}
            {isSv ? "Skapa ansökan" : "Create application"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
