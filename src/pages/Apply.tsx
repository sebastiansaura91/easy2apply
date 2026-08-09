import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { ApplyFlow, ApplyTemplate } from "@/components/apply/ApplyFlow";
import { splitTemplatesApplications } from "@/lib/resume-grouping";
import { Loader2 } from "lucide-react";

/**
 * The apply journey as a full page (the Teal "Matching Mode" pattern): paste the ad,
 * read the report with coverage against your whole profile, create the tailored CV.
 */
export default function Apply() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialRoleId = searchParams.get("role") || undefined;
  const [templates, setTemplates] = useState<ApplyTemplate[] | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("resumes")
        .select("id, title, language, updated_at, created_at, content_json")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      const rows = ((data as any[]) || []).filter(r => !(r.content_json?.__meta)?.isRegistryRow);
      setTemplates(splitTemplatesApplications(rows as any).templates as ApplyTemplate[]);
    })();
  }, [user]);

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="min-w-0 flex-1">
        {templates === null ? (
          <p className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Laddar…
          </p>
        ) : (
          <ApplyFlow
            asPage
            open
            onOpenChange={(o) => { if (!o) navigate("/dashboard"); }}
            templates={templates}
            userId={user?.id}
            initialRoleId={initialRoleId}
          />
        )}
      </main>
    </div>
  );
}
