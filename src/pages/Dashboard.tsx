import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Copy, Trash2, Edit3, Settings, LogOut, Briefcase, Target, Plus, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { RoleTemplateDialog } from "@/components/role/RoleTemplateDialog";
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

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { language } = useLanguage();
  const isSv = language === "sv";
  const [resumes, setResumes] = useState<ResumeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [riktaOpen, setRiktaOpen] = useState(false);
  const [riktaBaseId, setRiktaBaseId] = useState<string | undefined>(undefined);

  const fetchResumes = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("resumes").select("id, title, language, updated_at, created_at, content_json")
      .eq("user_id", user.id).order("updated_at", { ascending: false });
    if (error) { setFetchError(true); setLoading(false); return; }
    setFetchError(false);
    setResumes((data as ResumeRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchResumes(); }, [user]);

  const { templates, applications } = splitTemplatesApplications(resumes);
  const baseOptions = templates.map((r) => ({ id: r.id, title: r.title, language: r.language }));
  const openTailor = (baseId?: string) => { setRiktaBaseId(baseId ?? baseOptions[0]?.id); setRiktaOpen(true); };

  const duplicateResume = async (r: ResumeRow) => {
    if (!user) return;
    const { data } = await supabase.from("resumes").select("content_json").eq("id", r.id).single();
    if (!data) return;
    const id = uuidv4();
    const content = { ...((data.content_json as any) || {}), __meta: { ...getResumeMeta(r), createdFrom: r.id } };
    const { error } = await supabase.from("resumes").insert({
      id, user_id: user.id, title: `${r.title} (kopia)`, language: r.language, template_id: "default", content_json: content,
    });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { fetchResumes(); toast({ title: isSv ? "CV kopierat" : "CV duplicated" }); }
  };

  const deleteResume = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("resumes").delete().eq("id", deleteId);
    if (!error) setResumes((p) => p.filter((r) => r.id !== deleteId));
    else toast({ title: "Error", description: error.message, variant: "destructive" });
    setDeleteId(null);
  };

  const renderCard = (r: ResumeRow, kind: "template" | "application") => {
    const meta = getResumeMeta(r);
    const isTemplate = kind === "template";
    return (
      <Card key={r.id} className="transition-shadow hover:shadow-md">
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => navigate(`/editor/${r.id}`)}>
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
              {isTemplate ? <Star className="h-5 w-5 text-primary" /> : <FileText className="h-5 w-5 text-primary" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate font-medium">{r.title}</h3>
                {(meta.targetRole || meta.targetRoleLabel) && (
                  <Badge variant="outline" className="h-5 gap-0.5 border-primary/30 text-[10px] text-primary">
                    <Target className="h-2.5 w-2.5" />
                    {roleLabel(meta.targetRole, meta.targetRoleLabel, language)}
                  </Badge>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {meta.tailoredForJob ? `${isSv ? "för" : "for"} ${meta.tailoredForJob} · ` : ""}
                {format(new Date(r.updated_at), "yyyy-MM-dd")} · {r.language.toUpperCase()}
              </p>
            </div>
          </button>
          <div className="flex flex-shrink-0 items-center gap-0.5">
            {isTemplate && (
              <Button size="sm" className="h-9 text-xs" onClick={() => openTailor(r.id)}>
                <Target className="mr-1.5 h-3.5 w-3.5" />{isSv ? "Rikta" : "Tailor"}
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-9 w-9" title={isSv ? "Redigera" : "Edit"} onClick={() => navigate(`/editor/${r.id}`)}><Edit3 className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-9 w-9" title={isSv ? "Kopiera" : "Duplicate"} onClick={() => duplicateResume(r)}><Copy className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-9 w-9" title={isSv ? "Radera" : "Delete"} onClick={() => setDeleteId(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="min-w-0 flex-1">
      <div className="mx-auto max-w-3xl px-6 py-12">
        {loading ? (
          <div className="py-20 text-center text-muted-foreground">{isSv ? "Laddar…" : "Loading..."}</div>
        ) : fetchError ? (
          <div className="space-y-3 py-20 text-center">
            <p className="text-sm text-muted-foreground">{isSv ? "Kunde inte ladda dina CV:n — kolla anslutningen." : "Couldn't load your CVs — check your connection."}</p>
            <Button variant="outline" onClick={fetchResumes}>{isSv ? "Försök igen" : "Try again"}</Button>
          </div>
        ) : resumes.length === 0 ? (
          <div className="mx-auto max-w-md py-24 text-center">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Star className="h-6 w-6 text-primary" />
            </div>
            <h1 className="font-sans text-3xl font-semibold tracking-tight">{isSv ? "Skapa din första mall" : "Create your first template"}</h1>
            <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground">
              {isSv ? "En stark master för en roll du söker. Rikta den sedan mot varje jobb." : "A strong master for a role you target. Then tailor it to each job."}
            </p>
            <Button size="lg" className="mt-8" onClick={() => navigate("/wizard/create")}>
              <Plus className="mr-1.5 h-4 w-4" />{isSv ? "Skapa CV" : "Create CV"}
            </Button>
          </div>
        ) : (
          <div className="space-y-10">
            <div>
              <h1 className="font-sans text-2xl font-semibold tracking-tight">{isSv ? "Hem" : "Home"}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {isSv ? "Dina mallar är grunden. Rikta ett CV när du ska söka något." : "Your templates are the base. Tailor one when you apply."}
              </p>
            </div>

            {/* Templates */}
            <section>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Star className="h-3.5 w-3.5 text-primary" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{isSv ? "Mallar" : "Templates"}</p>
                </div>
                <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => navigate("/wizard/create")}>
                  <Plus className="mr-1 h-3.5 w-3.5" />{isSv ? "Ny mall" : "New template"}
                </Button>
              </div>
              {templates.length > 0 ? (
                <div className="space-y-2">{templates.map((r) => renderCard(r, "template"))}</div>
              ) : (
                <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                  {isSv ? "Inga mallar än." : "No templates yet."}
                </div>
              )}
            </section>

            {/* Applications */}
            <section>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{isSv ? "Ansökningar" : "Applications"}</p>
                </div>
                <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => openTailor()} disabled={templates.length === 0}>
                  <Target className="mr-1 h-3.5 w-3.5" />{isSv ? "Rikta CV" : "Tailor a CV"}
                </Button>
              </div>
              {applications.length > 0 ? (
                <div className="space-y-2">{applications.map((r) => renderCard(r, "application"))}</div>
              ) : (
                <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                  {isSv ? "Inga ansökningar än. Rikta en mall mot ett jobb." : "No applications yet. Tailor a template to a job."}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
      </main>

      <RoleTemplateDialog
        open={riktaOpen}
        onOpenChange={setRiktaOpen}
        bases={baseOptions}
        userId={user?.id}
        onCreated={fetchResumes}
        mode="application"
        defaultBaseId={riktaBaseId}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isSv ? "Radera CV?" : "Delete CV?"}</AlertDialogTitle>
            <AlertDialogDescription>{isSv ? "Det här går inte att ångra." : "This can't be undone."}</AlertDialogDescription>
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

export default Dashboard;
