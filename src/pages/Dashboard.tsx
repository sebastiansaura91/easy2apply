import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Copy, Trash2, Edit3, Shield, Settings, LogOut, Plus, Briefcase, TrendingUp, Star, StarOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { GoalChooser } from "@/components/shared/GoalChooser";
import { CVMeta } from "@/types/cv";
import { getResumeMeta, groupResumesByKind } from "@/lib/resume-grouping";
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
  const [resumes, setResumes] = useState<ResumeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);

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

  // Redirect to onboarding only when we've CONFIRMED the account is empty (no fetch error) —
  // a transient network error must not bounce a user who actually has CVs.
  useEffect(() => {
    if (!loading && !fetchError && resumes.length === 0) navigate("/onboarding");
  }, [loading, fetchError, resumes.length]);

  const duplicateResume = async (r: ResumeRow) => {
    if (!user) return;
    const { data } = await supabase.from("resumes").select("content_json").eq("id", r.id).single();
    if (!data) return;
    const id = uuidv4();
    const { error } = await supabase.from("resumes").insert({
      id, user_id: user.id, title: `${r.title} (copy)`, language: r.language, template_id: "default", content_json: data.content_json,
    });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { fetchResumes(); toast({ title: "CV duplicated" }); }
  };

  const deleteResume = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("resumes").delete().eq("id", deleteId);
    if (!error) setResumes(p => p.filter(r => r.id !== deleteId));
    else toast({ title: "Error", description: error.message, variant: "destructive" });
    setDeleteId(null);
  };

  const getMeta = (r: ResumeRow): CVMeta => getResumeMeta(r);

  const toggleTemplate = async (r: ResumeRow) => {
    if (!user) return;
    const nextIsTemplate = !getMeta(r).isTemplate;
    // Fetch full content_json so we don't clobber the document when writing metadata.
    const { data } = await supabase.from("resumes").select("content_json").eq("id", r.id).single();
    const content = { ...((data?.content_json as any) || {}), __meta: { ...getMeta(r), isTemplate: nextIsTemplate } };
    const { error } = await supabase.from("resumes").update({ content_json: content }).eq("id", r.id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { fetchResumes(); toast({ title: nextIsTemplate ? "Marked as template" : "Unmarked as template" }); }
  };

  const { templates, applications, others } = groupResumesByKind(resumes);

  const renderCard = (r: ResumeRow) => {
    const meta = getMeta(r);
    return (
      <Card key={r.id} className="hover:shadow-md transition-shadow">
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3 min-w-0 cursor-pointer" onClick={() => navigate(`/editor/${r.id}`)}>
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              {meta.isTemplate ? <Star className="h-4 w-4 text-primary" /> : <FileText className="h-4 w-4 text-primary" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-sm truncate">{r.title}</h3>
                {meta.isTemplate && <Badge variant="secondary" className="text-[9px] h-4">Template</Badge>}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {meta.tailoredForJob ? `for ${meta.tailoredForJob}${meta.tailoredForCompany ? ` · ${meta.tailoredForCompany}` : ""} · ` : ""}
                {format(new Date(r.updated_at), "yyyy-MM-dd HH:mm")} · {r.language.toUpperCase()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" title={meta.isTemplate ? "Unmark template" : "Mark as template"} onClick={() => toggleTemplate(r)}>
              {meta.isTemplate ? <StarOff className="h-3.5 w-3.5" /> : <Star className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => navigate(`/editor/${r.id}`)}><Edit3 className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Duplicate" onClick={() => duplicateResume(r)}><Copy className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Delete" onClick={() => setDeleteId(r.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
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
            <span className="text-base font-semibold font-['Space_Grotesk']">CVSäkert</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}><Settings className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={signOut}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-10 max-w-3xl">
        {/* Welcome + CTA */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold font-['Space_Grotesk']">Your CVs</h1>
          <p className="text-sm text-muted-foreground mt-1">Pick up where you left off or start something new.</p>
        </div>

        {/* Quick actions */}
        <div className="grid sm:grid-cols-2 gap-3 mb-8">
          <button onClick={() => { setGoalOpen(true); }}
            className="group flex items-center gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4 hover:border-primary/40 transition-all text-left">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Briefcase className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm">Start new application</p>
              <p className="text-xs text-muted-foreground">Match your CV to a specific role</p>
            </div>
          </button>
          <button onClick={() => { setGoalOpen(true); }}
            className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-all text-left">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-sm">Improve or create CV</p>
              <p className="text-xs text-muted-foreground">Audit, build, or explore</p>
            </div>
          </button>
        </div>

        {/* Resume list */}
        {loading ? (
          <div className="text-center py-16 text-muted-foreground">Loading...</div>
        ) : fetchError ? (
          <div className="text-center py-16 space-y-3">
            <p className="text-sm text-muted-foreground">Couldn't load your CVs — check your connection.</p>
            <Button variant="outline" size="sm" onClick={fetchResumes}>Try again</Button>
          </div>
        ) : (
          <div className="space-y-8">
            {templates.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Star className="h-3.5 w-3.5 text-primary" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Templates</p>
                </div>
                <div className="space-y-2">{templates.map(renderCard)}</div>
              </section>
            )}
            {applications.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Briefcase className="h-3.5 w-3.5 text-primary" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Applications</p>
                </div>
                <div className="space-y-2">{applications.map(renderCard)}</div>
              </section>
            )}
            {others.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {templates.length > 0 || applications.length > 0 ? "Other CVs" : "Your CVs"}
                  </p>
                </div>
                <div className="space-y-2">{others.map(renderCard)}</div>
              </section>
            )}
          </div>
        )}
      </div>

      <GoalChooser open={goalOpen} onOpenChange={setGoalOpen} />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete CV</AlertDialogTitle>
            <AlertDialogDescription>Are you sure? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteResume}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Dashboard;
