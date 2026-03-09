import { useLanguage } from "@/i18n/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { FileText, Target, Download, GitBranch, Shield, ArrowRight } from "lucide-react";

const Landing = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleCTA = () => {
    if (user) {
      navigate("/dashboard");
    } else {
      navigate("/auth");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold font-['Space_Grotesk']">CVSäkert</span>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <Button onClick={() => navigate("/dashboard")} variant="default">
                {t("navDashboard")}
              </Button>
            ) : (
              <>
                <Button onClick={() => navigate("/auth")} variant="ghost">
                  {t("ctaLogin")}
                </Button>
                <Button onClick={() => navigate("/auth")} variant="default">
                  {t("ctaCreate")}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="container mx-auto px-4 pt-20 pb-24">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary mb-6">
            <Shield className="h-4 w-4" />
            {t("featureAts")}
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 font-['Space_Grotesk']">
            {t("heroTitle")}
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            {t("heroSubtitle")}
          </p>
          <Button onClick={handleCTA} size="lg" className="text-base px-8 py-6 rounded-xl shadow-lg">
            {t("ctaCreate")}
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>

        {/* Mock CV Preview */}
        <div className="mt-16 max-w-2xl mx-auto">
          <div className="bg-card rounded-xl border border-border shadow-xl p-8 space-y-4">
            <div className="h-6 w-48 bg-foreground/10 rounded" />
            <div className="h-3 w-64 bg-muted-foreground/20 rounded" />
            <div className="border-t border-border pt-4 mt-4">
              <div className="h-4 w-40 bg-foreground/10 rounded mb-3" />
              <div className="space-y-2">
                <div className="h-3 w-full bg-muted rounded" />
                <div className="h-3 w-5/6 bg-muted rounded" />
                <div className="h-3 w-4/6 bg-muted rounded" />
              </div>
            </div>
            <div className="border-t border-border pt-4">
              <div className="h-4 w-52 bg-foreground/10 rounded mb-3" />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-32 bg-primary/20 rounded" />
                  <div className="h-3 w-24 bg-muted rounded" />
                </div>
                <div className="space-y-1.5 pl-4">
                  <div className="h-2.5 w-full bg-muted rounded" />
                  <div className="h-2.5 w-5/6 bg-muted rounded" />
                </div>
              </div>
            </div>
            <div className="border-t border-border pt-4">
              <div className="h-4 w-36 bg-foreground/10 rounded mb-3" />
              <div className="flex flex-wrap gap-2">
                {["Strategi", "CRM", "Förändring", "Analys", "Projektledning"].map((s) => (
                  <div key={s} className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                    {s}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border bg-card/50">
        <div className="container mx-auto px-4 py-20">
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {[
              { icon: Shield, title: t("featureAts"), desc: t("featureAtsDesc") },
              { icon: Target, title: t("featureTailor"), desc: t("featureTailorDesc") },
              { icon: Download, title: t("featureExport"), desc: t("featureExportDesc") },
              { icon: GitBranch, title: t("featureVersions"), desc: t("featureVersionsDesc") },
            ].map((f, i) => (
              <div key={i} className="flex gap-4 p-6 rounded-xl bg-card border border-border">
                <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-base mb-1">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} CVSäkert. ATS-säkra CV:n för svenska jobbsökare.
        </div>
      </footer>
    </div>
  );
};

export default Landing;
