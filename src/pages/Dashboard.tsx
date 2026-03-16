import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Copy, Trash2, Edit3, Shield, Settings, LogOut, Plus, Briefcase, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { GoalChooser } from "@/components/shared/GoalChooser";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { v4 as uuidv4 } from "uuid";

interface ResumeRow { id: string; title: string; language: string; updated_at: string; created_at: string; }

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [resumes, setResumes] = useState<ResumeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);

  const fetchResumes = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("resumes").select("id, title, language, updated_at, created_at")
      .eq("user_id", user.id).order("updated_at", { ascending: false });
    if (!error) setResumes((data as ResumeRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchResumes(); }, [user]);

  // Redirect to onboarding if no resumes
  useEffect(() => {
    if (!loading && resumes.length === 0) navigate("/onboarding");
  }, [loading, resumes.length]);

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
        ) : (
          <div className="space-y-2">
            {resumes.map(r => (
              <Card key={r.id} className="hover:shadow-md transition-shadow">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3 min-w-0 cursor-pointer" onClick={() => navigate(`/editor/${r.id}`)}>
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium text-sm truncate">{r.title}</h3>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(r.updated_at), "yyyy-MM-dd HH:mm")} · {r.language.toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/editor/${r.id}`)}><Edit3 className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => duplicateResume(r)}><Copy className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(r.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
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
