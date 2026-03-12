import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Shield, Search, Sparkles, CheckCircle2, AlertTriangle, BarChart3, Zap } from "lucide-react";
import { motion } from "framer-motion";

const fade = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: i * 0.1, ease: "easeOut" },
  }),
};

const Landing = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleCTA = () => navigate(user ? "/dashboard" : "/auth");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 text-foreground">
            <Shield className="h-5 w-5 text-primary" />
            <span className="text-base font-semibold tracking-tight">CVSäkert</span>
          </button>
          <div className="flex items-center gap-6 text-sm">
            <a href="#solution" className="hidden text-muted-foreground transition-colors hover:text-foreground sm:block">Produkt</a>
            <a href="#pricing" className="hidden text-muted-foreground transition-colors hover:text-foreground sm:block">Pris</a>
            {user ? (
              <Button onClick={() => navigate("/dashboard")} size="sm">Mina CV</Button>
            ) : (
              <>
                <button onClick={() => navigate("/auth")} className="text-muted-foreground transition-colors hover:text-foreground">Logga in</button>
                <Button onClick={() => navigate("/auth")} size="sm">
                  Skapa CV
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-background">
        <div className="mx-auto grid max-w-6xl gap-16 px-6 pb-24 pt-20 lg:grid-cols-2 lg:items-center lg:gap-20 lg:pt-28">
          <motion.div initial="hidden" animate="visible" className="max-w-xl">
            <motion.div custom={0} variants={fade} className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Shield className="h-3.5 w-3.5 text-primary" />
              Parsing-säker AI-analys
            </motion.div>
            <motion.h1 custom={1} variants={fade} className="text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-[3.25rem]">
              CV som klarar ATS.
              <br />
              <span className="text-muted-foreground">Och övertygar människor.</span>
            </motion.h1>
            <motion.p custom={2} variants={fade} className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground">
              Kombinerar parsing-säker struktur med konverteringsdriven AI. Inga&nbsp;floskler. Ingen&nbsp;hallucination. Bara&nbsp;träffsäkerhet.
            </motion.p>
            <motion.div custom={3} variants={fade} className="mt-8 flex flex-wrap gap-3">
              <Button onClick={handleCTA} size="lg" className="rounded-lg px-6 text-sm font-medium">
                Skapa ditt CV
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
              <Button onClick={() => document.getElementById("solution")?.scrollIntoView({ behavior: "smooth" })} variant="outline" size="lg" className="rounded-lg px-6 text-sm font-medium">
                Se hur det fungerar
              </Button>
            </motion.div>
          </motion.div>

          {/* Score mockup */}
          <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.3 }} className="relative hidden lg:block">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">ATS-kontroll</span>
                <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">Score: 87</span>
              </div>
              <div className="space-y-3">
                {[
                  { label: "Parse Safety", score: 36, max: 40, status: "ok" },
                  { label: "Relevans", score: 24, max: 30, status: "ok" },
                  { label: "Evidens", score: 17, max: 20, status: "warn" },
                  { label: "Läsbarhet", score: 10, max: 10, status: "ok" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    {item.status === "ok" ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                    )}
                    <span className="min-w-[100px] text-sm text-foreground">{item.label}</span>
                    <div className="h-1.5 flex-1 rounded-full bg-muted">
                      <div
                        className={`h-1.5 rounded-full ${item.status === "ok" ? "bg-success" : "bg-warning"}`}
                        style={{ width: `${(item.score / item.max) * 100}%` }}
                      />
                    </div>
                    <span className="min-w-[40px] text-right text-xs text-muted-foreground">{item.score}/{item.max}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 border-t border-border pt-4">
                <p className="text-xs font-medium text-muted-foreground">Top blocker:</p>
                <p className="mt-1 text-sm text-foreground">2 bullets saknar tydlig effektbeskrivning</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Problem */}
      <section className="border-t border-border bg-card">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} className="grid gap-6 sm:grid-cols-3">
            {[
              {
                icon: AlertTriangle,
                title: "Ditt CV fastnar i systemet",
                desc: "70% av CV:n avvisas av ATS innan en människa ser dem. Layoutfel, felaktiga rubriker och dold text är vanligaste orsakerna.",
              },
              {
                icon: Search,
                title: "Du matchar inte rätt keywords",
                desc: "ATS rankar baserat på keyword-match. Utan rätt termer på rätt plats hamnar du långt ner – oavsett erfarenhet.",
              },
              {
                icon: Sparkles,
                title: "Det låter generiskt",
                desc: "\"Resultatorienterad team player\" säger ingenting. Rekryterare scrollar förbi floskler och letar efter konkret evidens.",
              },
            ].map((item, i) => (
              <motion.div key={i} custom={i} variants={fade} className="rounded-lg border border-border bg-background p-6">
                <item.icon className="mb-3 h-5 w-5 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Solution */}
      <section id="solution" className="border-t border-border bg-background">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }}>
            <motion.p custom={0} variants={fade} className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Så fungerar det</motion.p>
            <motion.h2 custom={1} variants={fade} className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Byggt för hur rekrytering faktiskt fungerar.
            </motion.h2>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} className="mt-12 grid gap-6 sm:grid-cols-3">
            {[
              {
                icon: BarChart3,
                title: "ATS-kontroll",
                points: ["Blockers & parsing-check", "Score 0–100 med betyg", "Simulera Enterprise, SaaS & SMB"],
              },
              {
                icon: Sparkles,
                title: "Bullet AI",
                points: ["Floskelfri omskrivning", "Anti-hallucination (aldrig påhittade fakta)", "Impact-fokuserade förslag"],
              },
              {
                icon: Search,
                title: "Keyword match",
                points: ["Must-have gap-analys", "Recency-viktad matchning", "Konkreta insättningsförslag"],
              },
            ].map((item, i) => (
              <motion.div key={i} custom={i + 1} variants={fade} className="rounded-lg border border-border bg-card p-6">
                <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <item.icon className="h-4.5 w-4.5 text-primary" />
                </div>
                <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                <ul className="mt-3 space-y-2">
                  {item.points.map((p, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                      {p}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Social proof */}
      <section className="border-t border-border bg-card">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} className="text-center">
            <motion.p custom={0} variants={fade} className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Trovärdighet</motion.p>
            <motion.h2 custom={1} variants={fade} className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
              Utvecklad med input från rekryterare och ATS-specialister
            </motion.h2>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              { quote: "Äntligen ett verktyg som förstår hur vi faktiskt läser CV:n. Inte bara keywords – utan kontext och struktur.", author: "Rekryteringschef, Tech" },
              { quote: "Jag slutade gissa vilka ord som fattades. Keyword-gap-funktionen visade exakt vad som saknades.", author: "Kandidat, Senior PM" },
              { quote: "Vi rekommenderar CVSäkert till alla kandidater som vill maximera sina chanser i vår ATS.", author: "HR-partner, Enterprise" },
            ].map((t, i) => (
              <motion.div key={i} custom={i + 1} variants={fade} className="rounded-lg border border-border bg-background p-6">
                <p className="text-sm leading-relaxed text-foreground">"{t.quote}"</p>
                <p className="mt-4 text-xs font-medium text-muted-foreground">— {t.author}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-border bg-background">
        <div className="mx-auto max-w-4xl px-6 py-20">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} className="text-center">
            <motion.p custom={0} variants={fade} className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Pris</motion.p>
            <motion.h2 custom={1} variants={fade} className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Enkelt och transparent
            </motion.h2>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} className="mt-12 grid gap-6 sm:grid-cols-2">
            {/* Free */}
            <motion.div custom={1} variants={fade} className="rounded-lg border border-border bg-card p-6">
              <p className="text-sm font-semibold text-foreground">Free</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-foreground">0 kr<span className="text-base font-normal text-muted-foreground">/mån</span></p>
              <p className="mt-2 text-sm text-muted-foreground">Perfekt för att komma igång.</p>
              <ul className="mt-5 space-y-2.5">
                {["1 CV", "ATS-kontroll (3/mån)", "DOCX-export", "Grundläggande bullet-förslag"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button onClick={handleCTA} variant="outline" className="mt-6 w-full rounded-lg text-sm">
                Kom igång gratis
              </Button>
            </motion.div>

            {/* Pro */}
            <motion.div custom={2} variants={fade} className="relative rounded-lg border-2 border-primary bg-card p-6">
              <div className="absolute -top-3 right-4 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
                Populärast
              </div>
              <p className="text-sm font-semibold text-foreground">Pro</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-foreground">149 kr<span className="text-base font-normal text-muted-foreground">/mån</span></p>
              <p className="mt-2 text-sm text-muted-foreground">Allt du behöver för en seriös jobbsökning.</p>
              <ul className="mt-5 space-y-2.5">
                {["Obegränsade CV:n", "Obegränsad ATS-kontroll", "Keyword gap-analys", "AI bullet-omskrivning", "Versionshantering", "PDF + DOCX-export"].map((f) => (
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
        <div className="mx-auto max-w-6xl px-6 py-20">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} className="text-center">
            <motion.h2 custom={0} variants={fade} className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Sluta gissa. Optimera.
            </motion.h2>
            <motion.p custom={1} variants={fade} className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
              Skapa ett CV som både ATS och rekryterare förstår — på några minuter.
            </motion.p>
            <motion.div custom={2} variants={fade} className="mt-8">
              <Button onClick={handleCTA} size="lg" className="rounded-lg px-8 text-sm font-medium">
                Starta gratis
                <Zap className="ml-1.5 h-4 w-4" />
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-background py-8">
        <div className="mx-auto max-w-6xl px-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} CVSäkert. ATS-säkra CV:n för svenska jobbsökare.
        </div>
      </footer>
    </div>
  );
};

export default Landing;
