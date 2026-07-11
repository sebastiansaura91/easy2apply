import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Shield, UserCircle } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";

/**
 * First run: there are no CVs yet, so the only thing to do is create your PROFILE — your
 * real background. Everything else (tailored applications) is built from it later. The old
 * four-goal chooser and its wizards are retired.
 */
const Onboarding = () => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isSv = language === "sv";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-4xl items-center px-6">
          <Shield className="h-5 w-5 text-primary mr-2" />
          <span className="text-base font-semibold tracking-tight font-['Space_Grotesk']">CVSäkert</span>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md text-center">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            <div className="mx-auto mb-5 h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <UserCircle className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight font-['Space_Grotesk']">
              {isSv ? "Skapa din profil" : "Create your profile"}
            </h1>
            <p className="text-muted-foreground mt-3 text-sm">
              {isSv
                ? "Din profil är din verkliga bakgrund — allt du gjort. Den är grunden för varje CV du sen riktar mot en roll eller ett jobb. Ladda upp ett befintligt CV eller börja från noll."
                : "Your profile is your real background — everything you've done. It's the basis for every CV you later tailor to a role or job. Upload an existing CV or start from scratch."}
            </p>
            <button
              onClick={() => navigate("/wizard/create")}
              className="group mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              {isSv ? "Kom igång" : "Get started"}
              <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
