import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Shield, CheckCircle2, Zap } from "lucide-react";
import { motion } from "framer-motion";

const fade = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: i * 0.1, ease: "easeOut" as const },
  }),
};

const Landing = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const handleCTA = () => navigate("/onboarding");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 text-foreground">
            <Shield className="h-5 w-5 text-primary" />
            <span className="text-base font-semibold tracking-tight">CVSäkert</span>
          </button>
          <div className="flex items-center gap-5 text-sm">
            {user ? (
              <Button onClick={() => navigate("/dashboard")} size="sm">Mina CV</Button>
            ) : (
              <>
                <button onClick={() => navigate("/auth")} className="text-muted-foreground hover:text-foreground transition-colors">Logga in</button>
                <Button onClick={handleCTA} size="sm">
                  Kom igång
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-background">
        <div className="mx-auto max-w-3xl px-6 pb-24 pt-24 text-center">
          <motion.div initial="hidden" animate="visible">
            <motion.h1 custom={0} variants={fade} className="text-4xl font-semibold leading-[1.15] tracking-tight sm:text-5xl">
              Optimera ditt CV
              <br />
              <span className="text-muted-foreground">för jobbet du söker.</span>
            </motion.h1>
            <motion.p custom={1} variants={fade} className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-muted-foreground">
              Klistra in en jobbannons. Ladda upp ditt CV. Se direkt hur väl du matchar — och vad du behöver förbättra.
            </motion.p>
            <motion.div custom={2} variants={fade} className="mt-8 flex justify-center gap-3">
              <Button onClick={handleCTA} size="lg" className="rounded-lg px-6 text-sm font-medium">
                Kom igång
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border bg-card">
        <div className="mx-auto max-w-4xl px-6 py-20">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }}>
            <motion.p custom={0} variants={fade} className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Så fungerar det</motion.p>
            <motion.h2 custom={1} variants={fade} className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Från jobbannons till färdigt CV i&nbsp;fyra&nbsp;steg.
            </motion.h2>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} className="mt-12 space-y-6">
            {[
              { step: "1", title: "Välj vad du vill göra", desc: "Söka ett jobb, förbättra ditt CV, skapa nytt eller kolla styrkan." },
              { step: "2", title: "Ge oss kontext", desc: "Klistra in jobbannonsen eller ladda upp ditt CV. Vi anpassar allt efter din situation." },
              { step: "3", title: "Se resultatet direkt", desc: "Match-score, saknade nyckelord, svaga formuleringar och ATS-problem — allt på ett ställe." },
              { step: "4", title: "Förbättra och exportera", desc: "Använd AI-förslag för att stärka varje punkt. Exportera när du är nöjd." },
            ].map((item, i) => (
              <motion.div key={i} custom={i + 1} variants={fade} className="flex gap-5 rounded-lg border border-border bg-background p-5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {item.step}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-border bg-background">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} className="text-center">
            <motion.p custom={0} variants={fade} className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Pris</motion.p>
            <motion.h2 custom={1} variants={fade} className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Enkelt och transparent
            </motion.h2>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} className="mt-12 grid gap-6 sm:grid-cols-2">
            <motion.div custom={1} variants={fade} className="rounded-lg border border-border bg-card p-6">
              <p className="text-sm font-semibold text-foreground">Free</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-foreground">0 kr<span className="text-base font-normal text-muted-foreground">/mån</span></p>
              <ul className="mt-5 space-y-2.5">
                {["1 CV", "3 analyser per månad", "DOCX-export"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button onClick={handleCTA} variant="outline" className="mt-6 w-full rounded-lg text-sm">Kom igång gratis</Button>
            </motion.div>

            <motion.div custom={2} variants={fade} className="relative rounded-lg border-2 border-primary bg-card p-6">
              <div className="absolute -top-3 right-4 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">Populärast</div>
              <p className="text-sm font-semibold text-foreground">Pro</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-foreground">149 kr<span className="text-base font-normal text-muted-foreground">/mån</span></p>
              <ul className="mt-5 space-y-2.5">
                {["Obegränsade CV:n", "Obegränsade analyser", "Keyword gap-analys", "AI bullet-förslag", "PDF + DOCX-export"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button onClick={handleCTA} className="mt-6 w-full rounded-lg text-sm">
                Starta Pro
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border bg-card">
        <div className="mx-auto max-w-5xl px-6 py-20 text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }}>
            <motion.h2 custom={0} variants={fade} className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Sluta gissa. Optimera.
            </motion.h2>
            <motion.p custom={1} variants={fade} className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
              Se hur ditt CV presterar — och förbättra det på några minuter.
            </motion.p>
            <motion.div custom={2} variants={fade} className="mt-8">
              <Button onClick={handleCTA} size="lg" className="rounded-lg px-8 text-sm font-medium">
                Kom igång
                <Zap className="ml-1.5 h-4 w-4" />
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-background py-8">
        <div className="mx-auto max-w-5xl px-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} CVSäkert
        </div>
      </footer>
    </div>
  );
};

export default Landing;
