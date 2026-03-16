import { useNavigate } from "react-router-dom";
import { useFlow, UserGoal } from "@/contexts/FlowContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Briefcase, TrendingUp, FilePlus, BarChart3, ArrowRight } from "lucide-react";

const goals = [
  { id: "apply" as UserGoal, icon: Briefcase, title: "Apply for a job", desc: "Match your CV to a specific role", route: "/wizard/apply" },
  { id: "improve" as UserGoal, icon: TrendingUp, title: "Improve my CV", desc: "Full audit with ATS + recruiter scan", route: "/wizard/improve" },
  { id: "create" as UserGoal, icon: FilePlus, title: "Create a CV", desc: "Build from scratch or import", route: "/wizard/create" },
  { id: "explore" as UserGoal, icon: BarChart3, title: "Explore CV strength", desc: "Quick 30-second analysis", route: "/wizard/explore" },
];

interface Props { open: boolean; onOpenChange: (open: boolean) => void; }

export function GoalChooser({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { setGoal } = useFlow();

  const select = (g: typeof goals[0]) => {
    setGoal(g.id);
    onOpenChange(false);
    navigate(g.route);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-['Space_Grotesk']">What do you want to do?</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          {goals.map(g => (
            <button key={g.id} onClick={() => select(g)}
              className="group text-left rounded-lg border border-border p-4 hover:border-primary/50 hover:bg-primary/5 transition-all">
              <div className="flex items-start justify-between mb-2">
                <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                  <g.icon className="h-4 w-4 text-primary" />
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="font-medium text-sm">{g.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{g.desc}</p>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
