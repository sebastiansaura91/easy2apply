import { useNavigate } from "react-router-dom";
import { useFlow, UserGoal } from "@/contexts/FlowContext";
import { motion } from "framer-motion";
import { Briefcase, TrendingUp, FilePlus, BarChart3, ArrowRight, Shield } from "lucide-react";

const goals = [
  { id: "apply" as UserGoal, icon: Briefcase, title: "Apply for a job", desc: "Match your CV to a specific role and maximize your chances", route: "/wizard/apply" },
  { id: "improve" as UserGoal, icon: TrendingUp, title: "Improve my CV", desc: "Get a full audit — ATS check, recruiter scan, and bullet analysis", route: "/wizard/improve" },
  { id: "create" as UserGoal, icon: FilePlus, title: "Create a CV", desc: "Build a professional, ATS-safe CV from scratch or import", route: "/wizard/create" },
  { id: "explore" as UserGoal, icon: BarChart3, title: "Explore my CV strength", desc: "Quick analysis — see how your CV performs in 30 seconds", route: "/wizard/explore" },
];

const fade = (i: number) => ({ initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, delay: 0.08 + i * 0.07 } });

const Onboarding = () => {
  const navigate = useNavigate();
  const { setGoal } = useFlow();

  const select = (g: typeof goals[0]) => { setGoal(g.id); navigate(g.route); };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-4xl items-center px-6">
          <Shield className="h-5 w-5 text-primary mr-2" />
          <span className="text-base font-semibold tracking-tight font-['Space_Grotesk']">CVSäkert</span>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl">
          <motion.div {...fade(0)} className="text-center mb-10">
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight font-['Space_Grotesk']">
              What are you trying to do today?
            </h1>
            <p className="text-muted-foreground mt-3 text-sm max-w-md mx-auto">
              Choose your goal and we'll guide you through the best path.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {goals.map((g, i) => (
              <motion.button key={g.id} {...fade(i + 1)} onClick={() => select(g)}
                className="group text-left rounded-xl border border-border bg-card p-6 hover:border-primary/50 hover:shadow-md transition-all duration-200">
                <div className="flex items-start justify-between">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <g.icon className="h-5 w-5 text-primary" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all mt-1" />
                </div>
                <h3 className="font-semibold text-base">{g.title}</h3>
                <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{g.desc}</p>
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
