import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { CVContent, emptyCV } from "@/types/cv";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { CVUploadZone } from "@/components/shared/CVUploadZone";
import { Shield, ArrowLeft, Upload, FileText, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { v4 as uuidv4 } from "uuid";

export default function CreateWizard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<"choose" | "upload">("choose");

  const createAndOpen = async (cv: CVContent, title?: string) => {
    if (!user) return;
    const id = uuidv4();
    const t = title || (cv.contact?.name ? `${cv.contact.name} – CV` : "New CV");
    const { error } = await supabase.from("resumes").insert({
      id, user_id: user.id, title: t, language: "sv", template_id: "default", content_json: cv as any,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    navigate(`/editor/${id}`);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-6">
          <button onClick={() => mode === "upload" ? setMode("choose") : navigate("/onboarding")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold font-['Space_Grotesk']">CVSäkert</span>
          </div>
          <div />
        </div>
      </nav>

      <div className="flex-1 mx-auto w-full max-w-3xl px-6 py-8 flex items-center">
        {mode === "choose" && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-semibold font-['Space_Grotesk']">How do you want to start?</h2>
              <p className="text-sm text-muted-foreground mt-1">Pick the option that works best for you.</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 max-w-lg mx-auto">
              <button onClick={() => setMode("upload")}
                className="group text-left rounded-xl border border-border bg-card p-6 hover:border-primary/50 hover:shadow-md transition-all">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Upload className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-sm">Upload existing CV</h3>
                <p className="text-xs text-muted-foreground mt-1">We'll import and optimize it</p>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground mt-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
              <button onClick={() => createAndOpen(emptyCV, "New CV")}
                className="group text-left rounded-xl border border-border bg-card p-6 hover:border-primary/50 hover:shadow-md transition-all">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-sm">Start from scratch</h3>
                <p className="text-xs text-muted-foreground mt-1">Build your CV step by step</p>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground mt-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>
          </motion.div>
        )}

        {mode === "upload" && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full space-y-6">
            <div>
              <h2 className="text-2xl font-semibold font-['Space_Grotesk']">Upload your CV</h2>
              <p className="text-sm text-muted-foreground mt-1">We'll import it and you can start editing right away.</p>
            </div>
            <CVUploadZone onParsed={(cv) => createAndOpen(cv)} />
          </motion.div>
        )}
      </div>
    </div>
  );
}
