import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/i18n/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, FileText, Copy, Trash2, Edit3, Shield, Settings, LogOut } from "lucide-react";
import { UploadCVDialog } from "@/components/dashboard/UploadCVDialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { emptyCV, sampleCV } from "@/types/cv";
import { v4 as uuidv4 } from "uuid";

interface ResumeRow {
  id: string;
  title: string;
  language: string;
  updated_at: string;
  created_at: string;
}

const Dashboard = () => {
  const { t } = useLanguage();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [resumes, setResumes] = useState<ResumeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchResumes = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("resumes")
      .select("id, title, language, updated_at, created_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Error fetching resumes:", error);
    } else {
      setResumes((data as ResumeRow[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchResumes();
  }, [user]);

  const createResume = async (useSample = false) => {
    if (!user) return;
    const newId = uuidv4();
    const content = useSample ? sampleCV : emptyCV;
    const title = useSample ? "Strategy & Transformation Lead – CV" : "Nytt CV";

    const { error } = await supabase.from("resumes").insert({
      id: newId,
      user_id: user.id,
      title,
      language: "sv",
      template_id: "default",
      content_json: content as any,
    });

    if (error) {
      toast({ title: t("error"), description: error.message, variant: "destructive" });
    } else {
      navigate(`/editor/${newId}`);
    }
  };

  const duplicateResume = async (resume: ResumeRow) => {
    if (!user) return;
    const { data: original } = await supabase
      .from("resumes")
      .select("content_json")
      .eq("id", resume.id)
      .single();

    if (!original) return;

    const newId = uuidv4();
    const { error } = await supabase.from("resumes").insert({
      id: newId,
      user_id: user.id,
      title: `${resume.title} (kopia)`,
      language: resume.language,
      template_id: "default",
      content_json: original.content_json,
    });

    if (error) {
      toast({ title: t("error"), description: error.message, variant: "destructive" });
    } else {
      fetchResumes();
      toast({ title: t("dashDuplicate"), description: "CV duplicerat" });
    }
  };

  const deleteResume = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("resumes").delete().eq("id", deleteId);
    if (error) {
      toast({ title: t("error"), description: error.message, variant: "destructive" });
    } else {
      setResumes((prev) => prev.filter((r) => r.id !== deleteId));
    }
    setDeleteId(null);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
            <Shield className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold font-['Space_Grotesk']">CVSäkert</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
              <Settings className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-10 max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold font-['Space_Grotesk']">{t("dashTitle")}</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => createResume(true)}>
              <FileText className="mr-2 h-4 w-4" />
              Exempel-CV
            </Button>
            <Button onClick={() => createResume(false)}>
              <Plus className="mr-2 h-4 w-4" />
              {t("dashCreate")}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-muted-foreground">{t("loading")}</div>
        ) : resumes.length === 0 ? (
          <Card className="text-center py-16">
            <CardContent>
              <FileText className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
              <h2 className="text-xl font-semibold mb-2">{t("dashEmpty")}</h2>
              <p className="text-muted-foreground mb-6">{t("dashEmptyDesc")}</p>
              <Button onClick={() => createResume(false)}>
                <Plus className="mr-2 h-4 w-4" />
                {t("dashCreate")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {resumes.map((resume) => (
              <Card key={resume.id} className="hover:shadow-md transition-shadow">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium truncate">{resume.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {t("dashLastEdited")} {format(new Date(resume.updated_at), "yyyy-MM-dd HH:mm")} · {resume.language.toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => navigate(`/editor/${resume.id}`)}>
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => duplicateResume(resume)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(resume.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dashDelete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("dashConfirmDelete")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={deleteResume}>{t("confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Dashboard;
