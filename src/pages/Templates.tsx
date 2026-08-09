import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Copy, Trash2, Edit3, Plus, Tag } from "lucide-react";
import { RolePicker, CUSTOM_ROLE } from "@/components/role/RolePicker";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { CVMeta } from "@/types/cv";
import { getResumeMeta, splitTemplatesApplications } from "@/lib/resume-grouping";
import { roleLabel } from "@/lib/role-advice";
import { useLanguage } from "@/i18n/LanguageContext";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { v4 as uuidv4 } from "uuid";

interface ResumeRow { id: string; title: string; language: string; updated_at: string; created_at: string; content_json?: { __meta?: CVMeta } | null; }

/**
 * The templates room (OOUX: a template is a different object than an application —
 * it gets its own home). Home shows the pipeline; this page holds the masters.
 */
const Templates = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { language } = useLanguage();
  const isSv = language === "sv";
  const [resumes, setResumes] = useState<ResumeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [roleForId, setRoleForId] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState<string>("");
  const [roleCustom, setRoleCustom] = useState<string>("");

  const fetchResumes = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("resumes").select("id, title, language, updated_at, created_at, content_json")
      .eq("user_id", user.id).order("updated_at", { ascending: false });
    setResumes(((data as ResumeRow[]) || []).filter(r => !(r.content_json?.__meta as any)?.isRegistryRow));
    setLoading(false);
  };
  useEffect(() => { fetchResumes(); }, [user]);

  const { templates } = splitTemplatesApplications(resumes);

  const duplicateResume = async (r: ResumeRow) => {
    if (!user) return;
    const { data } = await supabase.from("resumes").select("content_json").eq("id", r.id).single();
    if (!data) return;
    const content = { ...((data.content_json as any) || {}), __meta: { ...getResumeMeta(r), createdFrom: r.id } };
    const { error } = await supabase.from("resumes").insert({
      id: uuidv4(), user_id: user.id, title: `${r.title} (kopia)`, language: r.language, template_id: "default", content_json: content,
    });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { fetchResumes(); toast({ title: isSv ? "Mall kopierad" : "Template duplicated" }); }
  };

  const deleteResume = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("resumes").delete().eq("id", deleteId);
    if (!error) setResumes(p => p.filter(r => r.id !== deleteId));
    else toast({ title: "Error", description: error.message, variant: "destructive" });
    setDeleteId(null);
  };

  const openRole = (r: ResumeRow) => {
    const m = getResumeMeta(r);
    setRoleForId(r.id);
    setRoleDraft(m.targetRoleLabel ? CUSTOM_ROLE : (m.targetRole ?? ""));
    setRoleCustom(m.targetRoleLabel ?? "");
  };

  const saveRole = async () => {
    if (!roleForId) return;
    const isCustom = roleDraft === CUSTOM_ROLE;
    const { data } = await supabase.from("resumes").select("content_json").eq("id", roleForId).single();
    const prev = (data?.content_json as any) || {};
    const content = {
      ...prev,
      __meta: {
        ...(prev.__meta || {}),
        targetRole: isCustom ? undefined : (roleDraft || undefined),
        targetRoleLabel: isCustom ? (roleCustom.trim() || undefined) : undefined,
      },
    };
    const { error } = await supabase.from("resumes").update({ content_json: content }).eq("id", roleForId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { setRoleForId(null); fetchResumes(); toast({ title: isSv ? "Roll uppdaterad" : "Role updated" }); }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-3xl px-6 py-12">
          <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-serif text-3xl font-medium tracking-tight">{isSv ? "Mallar" : "Templates"}</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {isSv ? "Dina master-CV:n, ett per roll du siktar på. Ansökningar skapas alltid ur en mall." : "Your master CVs, one per role you target. Applications are always created from a template."}
              </p>
            </div>
            <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => navigate("/wizard/create")}>
              <Plus className="mr-1 h-3.5 w-3.5" />{isSv ? "Ny mall" : "New template"}
            </Button>
          </div>

          {loading ? (
            <div className="py-20 text-center text-muted-foreground">{isSv ? "Laddar…" : "Loading..."}</div>
          ) : templates.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-12 text-center">
              <p className="text-sm text-muted-foreground">{isSv ? "Inga mallar än. Skapa en master för en roll du söker." : "No templates yet. Create a master for a role you target."}</p>
              <Button className="mt-5" onClick={() => navigate("/wizard/create")}>
                <Plus className="mr-1.5 h-4 w-4" />{isSv ? "Skapa mall" : "Create template"}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map(r => {
                const meta = getResumeMeta(r);
                return (
                  <Card key={r.id} className="transition-shadow hover:shadow-md">
                    <CardContent className="flex items-center justify-between gap-3 p-4">
                      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => navigate(`/editor/${r.id}`)}>
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate font-medium">{r.title}</h3>
                            {(meta.targetRole || meta.targetRoleLabel) && (
                              <Badge variant="outline" className="h-5 max-w-[200px] truncate whitespace-nowrap border-primary/30 text-[10px] text-primary">
                                {roleLabel(meta.targetRole, meta.targetRoleLabel, language)}
                              </Badge>
                            )}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {format(new Date(r.updated_at), "yyyy-MM-dd")} · {r.language.toUpperCase()}
                          </p>
                        </div>
                      </button>
                      <div className="flex flex-shrink-0 items-center gap-0.5">
                        <Button size="sm" className="h-9 text-xs" onClick={() => navigate(meta.targetRole ? `/apply?role=${encodeURIComponent(meta.targetRole)}` : "/apply")}>
                          {isSv ? "Sök" : "Apply"}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-9 w-9" title={isSv ? "Kategorisera roll" : "Set role"} onClick={() => openRole(r)}><Tag className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-9 w-9" title={isSv ? "Redigera" : "Edit"} onClick={() => navigate(`/editor/${r.id}`)}><Edit3 className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-9 w-9" title={isSv ? "Kopiera" : "Duplicate"} onClick={() => duplicateResume(r)}><Copy className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-9 w-9" title={isSv ? "Radera" : "Delete"} onClick={() => setDeleteId(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <Dialog open={!!roleForId} onOpenChange={(o) => !o && setRoleForId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isSv ? "Kategorisera roll" : "Categorize role"}</DialogTitle>
            <DialogDescription>{isSv ? "Välj vilken roll det här CV:t är en mall för." : "Choose which role this CV is a template for."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <RolePicker value={roleDraft} onChange={setRoleDraft} selectedLabel={roleLabel(roleDraft, roleCustom, language)} onCustomLabel={(l) => setRoleCustom(l)} />
            {roleDraft === CUSTOM_ROLE && (
              <Input autoFocus value={roleCustom} onChange={e => setRoleCustom(e.target.value)} placeholder={isSv ? "Rolltitel" : "Role title"} />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleForId(null)}>{isSv ? "Avbryt" : "Cancel"}</Button>
            <Button onClick={saveRole}>{isSv ? "Spara" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isSv ? "Radera mallen?" : "Delete this template?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {isSv ? "Ansökningar skapade från den påverkas inte, men mallen försvinner permanent." : "Applications created from it are unaffected, but the template is gone for good."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isSv ? "Avbryt" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction onClick={deleteResume}>{isSv ? "Radera" : "Delete"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Templates;
