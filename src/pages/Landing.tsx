import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";

/**
 * Lean entry for a personal tool — no marketing scaffolding (no pricing tiers,
 * no "how it works" funnel). One honest promise, one action. Signed-in users go
 * straight to their work.
 */
const Landing = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate("/dashboard", { replace: true });
  }, [loading, user, navigate]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <nav className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between px-6">
        <span className="font-sans text-lg font-semibold tracking-tight">CVSäkert</span>
        <button
          onClick={() => navigate("/auth")}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Logga in
        </button>
      </nav>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 pb-24">
        <h1 className="font-sans text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
          Ett CV.
          <br />
          <span className="text-primary">Riktat för varje jobb.</span>
        </h1>
        <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">
          Behåll en stark profil. Skräddarsy den till varje annons på minuter — inte
          200 kopior.
        </p>
        <div className="mt-10">
          <Button onClick={() => navigate("/auth")} size="lg" className="text-base">
            Kom igång
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-4xl px-6 py-8 text-xs text-muted-foreground">
        © {new Date().getFullYear()} CVSäkert
      </footer>
    </div>
  );
};

export default Landing;
