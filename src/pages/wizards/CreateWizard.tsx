import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { CVContent, emptyCV } from "@/types/cv";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CVUploadZone } from "@/components/shared/CVUploadZone";
import { Shield, ArrowLeft, Upload, Linkedin, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/i18n/LanguageContext";
import { v4 as uuidv4 } from "uuid";

export default function CreateWizard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { language } = useLanguage();
  const isSv = language === "sv";
  const [mode, setMode] = useState<"choose" | "upload">("choose");
  const [source, setSource] = useState<"cv" | "linkedin">("cv");
  // Language of the CV, chosen up front (competitor parity) — no longer hardcoded.
  const [lang, setLang] = useState<"sv" | "en">(language);

  const createAndOpen = async (cv: CVContent, title?: string) => {
    if (!user) return;
    const id = uuidv4();
    const t = title || (cv.contact?.name ? `${cv.contact.name} – CV` : (isSv ? "Nytt CV" : "New CV"));
    const { error } = await supabase.from("resumes").insert({
      id, user_id: user.id, title: t, language: lang, template_id: "default", content_json: cv as any,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    navigate(`/editor/${id}`);
  };

  const openUpload = (s: "cv" | "linkedin") => { setSource(s); setMode("upload"); };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-6">
          <button onClick={() => mode === "upload" ? setMode("choose") : navigate("/onboarding")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> {isSv ? "Tillbaka" : "Back"}
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
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold font-['Space_Grotesk']">{isSv ? "Var vill du börja?" : "Where do you want to start?"}</h2>
                <p className="text-sm text-muted-foreground mt-1">{isSv ? "Välj det som passar dig bäst." : "Pick the option that works best for you."}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-[11px] text-muted-foreground">{isSv ? "Språk" : "Language"}</span>
                <Select value={lang} onValueChange={(v) => setLang(v as "sv" | "en")}>
                  <SelectTrigger className="h-8 w-28 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sv">Svenska</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <button onClick={() => openUpload("cv")}
                className="group text-left rounded-xl border border-border bg-card p-6 hover:border-primary/50 hover:shadow-md transition-all">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Upload className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-sm">{isSv ? "Ladda upp CV (PDF)" : "Upload a CV (PDF)"}</h3>
                <p className="text-xs text-muted-foreground mt-1">{isSv ? "Vi läser in allt — du granskar och redigerar." : "We'll extract everything — you review and edit."}</p>
              </button>

              <button onClick={() => openUpload("linkedin")}
                className="group text-left rounded-xl border border-border bg-card p-6 hover:border-primary/50 hover:shadow-md transition-all">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Linkedin className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-sm">{isSv ? "LinkedIn-exporterad PDF" : "Use a LinkedIn-exported PDF"}</h3>
                <p className="text-xs text-muted-foreground mt-1">{isSv ? "På LinkedIn: Profil → Mer → Spara som PDF." : "On LinkedIn: Profile → More → Save to PDF."}</p>
              </button>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button onClick={() => createAndOpen(emptyCV)} className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
                {isSv ? "Börja från noll" : "Start from scratch"}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <p className="text-xs italic text-muted-foreground">{isSv ? "Du kan ändra allt detta senare." : "You can edit this later."}</p>
            </div>
          </motion.div>
        )}

        {mode === "upload" && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full space-y-6">
            <div>
              <h2 className="text-2xl font-semibold font-['Space_Grotesk']">
                {source === "linkedin"
                  ? (isSv ? "Ladda upp din LinkedIn-PDF" : "Upload your LinkedIn PDF")
                  : (isSv ? "Ladda upp ditt CV" : "Upload your CV")}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {source === "linkedin"
                  ? (isSv ? "På LinkedIn: gå till din profil → Mer → Spara som PDF, och släpp filen här." : "On LinkedIn: go to your profile → More → Save to PDF, then drop the file here.")
                  : (isSv ? "Vi läser in det och du kan börja redigera direkt." : "We'll import it and you can start editing right away.")}
              </p>
            </div>
            <CVUploadZone onParsed={(cv) => createAndOpen(cv)} />
            <p className="text-xs italic text-muted-foreground text-center">{isSv ? "Du kan ändra allt detta senare." : "You can edit this later."}</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
