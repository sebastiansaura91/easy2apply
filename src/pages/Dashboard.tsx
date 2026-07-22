import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Copy, Trash2, Edit3, Shield, Settings, LogOut, Briefcase, TrendingUp, UserCircle, Target } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { RoleTemplateDialog } from "@/components/role/RoleTemplateDialog";
import { CVMeta } from "@/types/cv";
import { getResumeMeta } from "@/lib/resume-grouping";
import { findBaseProfile, profileCandidate } from "@/lib/profile";
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
  const healing = useRef(false);

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

  // P1: there is exactly ONE profile. If none is marked yet, the earliest-created CV
  // (your first CV) becomes the profile. Self-heals once per load.
  useEffect(() => {
    if (loading || fetchError || resumes.length === 0 || healing.current) return;
    if (findBaseProfile(resumes)) return;
    const candidate = profileCandidate(resumes);
    if (!candidate) return;
    healing.current = true;
    (async () => {
      const { data } = await supabase.from("resumes").select("content_json").eq("id", candidate.id).single();
      const content = { ...((data?.content_json as any) || {}), __meta: { ...getResumeMeta(candidate), isBaseProfile: true } };
      await supabase.from("resumes").update({ content_json: content }).eq("id", candidate.id);
      await fetchResumes();
      healing.current = false;
    })();
  }, [loading, fetchError, resumes]);

  // Redirect to onboarding only when we've CONFIRMED the account is empty (no fetch error).
  useEffect(() => {
    if (!loading && !fetchError && resumes.length === 0) navigate("/onboarding");
  }, [loading, fetchError, resumes.length]);

  const profile = findBaseProfile(resumes) ?? profileCandidate(resumes);
  const applications = resumes.filter((r) => r.id !== profile?.id);

  const duplicateResume = async (r: ResumeRow) => {
    if (!user) return;
    const { data } = await supabase.from("resumes").select("content_json").eq("id", r.id).single();
    if (!data) return;
    const id = uuidv4();
    // A duplicate is never a second profile.
    const content = { ...((data.content_json as any) || {}), __meta: { ...getResumeMeta(r), isBaseProfile: false, createdFrom: r.id } };
    const { error } = await supabase.from("resumes").insert({
      id, user_id: user.id, title: `${r.title} (copy)`, language: r.language, template_id: "default", content_json: content,
    });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { fetchResumes(); toast({ title: isSv ? "CV kopierat" : "CV duplicated" }); }
  };

  const deleteResume = async () => {
    if (!deleteId) return;
    // P1: the profile can never be deleted.
    if (deleteId === profile?.id) {
      setDeleteId(null);
      toast({ title: isSv ? "Profilen kan inte raderas" : "The profile can't be deleted", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("resumes").delete().eq("id", deleteId);
    if (!error) setResumes(p => p.filter(r => r.id !== deleteId));
    else toast({ title: "Error", description: error.message, variant: "destructive" });
    setDeleteId(null);
  };

  const renderProfileCard = (r: ResumeRow) => (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3 min-w-0 cursor-pointer" onClick={() => navigate(`/editor/${r.id}`)}>
          <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
            <UserCircle className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm truncate">{r.title}</h3>
              <Badge className="text-[9px] h-4">{isSv ? "Din profil" : "Your profile"}</Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {isSv ? "Din verkliga bakgrund — grunden för alla riktade CV:n." : "Your real background — the basis for every tailored CV."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button size="sm" className="h-8 text-xs" onClick={() => setRiktaOpen(true)}>
            <Target className="mr-1.5 h-3.5 w-3.5" />{isSv ? "Rikta CV" : "Tailor a CV"}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title={isSv ? "Redigera profil" : "Edit profile"} onClick={() => navigate(`/editor/${r.id}`)}>
            <Edit3 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderApplicationCard = (r: ResumeRow) => {
    const meta = getResumeMeta(r);
    return (
      <Card key={r.id} className="hover:shadow-md transition-shadow">
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3 min-w-0 cursor-pointer" onClick={() => navigate(`/editor/${r.id}`)}>
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-sm truncate">{r.title}</h3>
                {(meta.targetRole || meta.targetRoleLabel) && (
                  <Badge variant="outline" className="text-[9px] h-4 gap-0.5 text-primary border-primary/30">
                    <Target className="h-2.5 w-2.5" />
                    {roleLabel(meta.targetRole, meta.targetRoleLabel, language)}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {meta.tailoredForJob ? `${isSv ? "för" : "for"} ${meta.tailoredForJob}${meta.tailoredForCompany ? ` · ${meta.tailoredForCompany}` : ""} · ` : ""}
                {format(new Date(r.updated_at), "yyyy-MM-dd HH:mm")} · {r.language.toUpperCase()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" title={isSv ? "Redigera" : "Edit"} onClick={() => navigate(`/editor/${r.id}`)}><Edit3 className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" title={isSv ? "Kopiera" : "Duplicate"} onClick={() => duplicateResume(r)}><Copy className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" title={isSv ? "Radera" : "Delete"} onClick={() => setDeleteId(r.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
            <Shield className="h-5 w-5 text-primary" />
            <span className="text-base font-semibold font-['Fraunces']">CVSäkert</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}><Settings className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={signOut}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold font-['Fraunces']">{isSv ? "Hem" : "Home"}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isSv ? "Din profil är grunden. Rikta ett CV när du ska söka något." : "Your profile is the basis. Tailor a CV when you apply for something."}
          </p>
        </div>

        {loading ? (
          <div className="text-center py-16 text-muted-foreground">{isSv ? "Laddar…" : "Loading..."}</div>
        ) : fetchError ? (
          <div className="text-center py-16 space-y-3">
            <p className="text-sm text-muted-foreground">{isSv ? "Kunde inte ladda dina CV:n — kolla anslutningen." : "Couldn't load your CVs — check your connection."}</p>
            <Button variant="outline" size="sm" onClick={fetchResumes}>{isSv ? "Försök igen" : "Try again"}</Button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Profile */}
            {profile && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <UserCircle className="h-3.5 w-3.5 text-primary" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{isSv ? "Profil" : "Profile"}</p>
                </div>
                {renderProfileCard(profile)}
              </section>
            )}

            {/* Applications */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{isSv ? "Ansökningar" : "Applications"}</p>
                </div>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setRiktaOpen(true)}>
                  <Target className="mr-1 h-3 w-3" />{isSv ? "Rikta CV" : "Tailor a CV"}
                </Button>
              </div>
              {applications.length > 0 ? (
                <div className="space-y-2">
                  {applications.map((r) => renderApplicationCard(r))}
                </div>
              ) : (
                <div className="text-center py-8 border border-dashed border-border rounded-lg">
                  <TrendingUp className="mx-auto h-5 w-5 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {isSv ? "Inga ansökningar än. Rikta ett CV mot en roll eller ett jobb." : "No applications yet. Tailor a CV to a role or job."}
                  </p>
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      <RoleTemplateDialog
        open={riktaOpen}
        onOpenChange={setRiktaOpen}
        base={profile ?? null}
        userId={user?.id}
        onCreated={fetchResumes}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isSv ? "Radera CV?" : "Delete CV?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {isSv ? "Det här går inte att ångra." : "This can't be undone."}
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

export default Dashboard;
