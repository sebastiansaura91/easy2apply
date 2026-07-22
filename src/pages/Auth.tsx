import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "@/i18n/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Mail, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Auth = () => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [params] = useSearchParams();
  // Preserve consent-route return path through the magic-link round-trip so external
  // OAuth clients land back on /.lovable/oauth/consent instead of the app home.
  const rawNext = params.get("next") ?? "";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin + next,
      },
    });

    setLoading(false);
    if (error) {
      toast({ title: t("authError"), description: error.message, variant: "destructive" });
    } else {
      setSent(true);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Shield className="h-8 w-8 text-primary" />
          <span className="text-2xl font-bold font-['Fraunces']">CVSäkert</span>
        </div>

        <Card>
          <CardHeader className="text-center">
            {sent ? (
              <>
                <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-accent" />
                </div>
                <CardTitle>{t("authSent")}</CardTitle>
                <CardDescription>{t("authSentDesc")}</CardDescription>
              </>
            ) : (
              <>
                <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Mail className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>{t("authTitle")}</CardTitle>
                <CardDescription>{t("authSubtitle")}</CardDescription>
              </>
            )}
          </CardHeader>
          {!sent && (
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <Input
                    type="email"
                    placeholder={t("authEmail")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t("loading") : t("authSend")}
                </Button>
              </form>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Auth;
