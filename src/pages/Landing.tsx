import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";

/**
 * Lean entry for a personal tool — no marketing scaffolding (no pricing tiers,
 * no "how it works" funnel). One honest promise, one action, and the product
 * itself as the hero asset: a REAL screenshot (fictional demo data), never a
 * div-built fake. Signed-in users go straight to their work.
 */
const Landing = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate("/dashboard", { replace: true });
  }, [loading, user, navigate]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <span className="font-serif text-xl font-medium tracking-tight">CVSäkert</span>
        <button
          onClick={() => navigate("/auth")}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Logga in
        </button>
      </nav>

      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-6 pb-16 pt-6">
        <div className="grid w-full items-center gap-10 md:grid-cols-[5fr_6fr] md:gap-14">
          <div>
            <h1 className="card-enter font-serif text-5xl font-medium leading-[1.05] tracking-tight sm:text-6xl">
              Ett CV.
              <br />
              <span className="text-primary">Riktat för varje jobb.</span>
            </h1>
            <p className="card-enter mt-6 max-w-md text-lg leading-relaxed text-muted-foreground" style={{ animationDelay: "60ms" }}>
              Behåll en stark profil. Skräddarsy den till varje annons på minuter, inte 200 kopior.
            </p>
            <div className="card-enter mt-10" style={{ animationDelay: "120ms" }}>
              <Button onClick={() => navigate("/auth")} size="lg" className="text-base">
                Kom igång
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* The paper document reads naturally against both themes — it IS paper. */}
          <div className="card-enter" style={{ animationDelay: "180ms" }}>
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              <img
                src="/hero-product.png"
                alt="CVSäkert: CV-dokumentet bredvid guiden som visar matchpoäng och nästa fråga att svara på"
                width={2400}
                height={1280}
                className="h-auto w-full"
                loading="eager"
                fetchPriority="high"
              />
            </div>
          </div>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-6 py-8 text-xs text-muted-foreground">
        © {new Date().getFullYear()} CVSäkert
      </footer>
    </div>
  );
};

export default Landing;
