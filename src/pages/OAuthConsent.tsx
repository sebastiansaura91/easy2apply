import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Shield } from "lucide-react";

// Beta auth.oauth namespace — thin typed wrapper so TS is happy.
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};
const oauthApi = (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) return setError("Missing authorization_id");
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      const { data, error } = await oauthApi.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) return setError(error.message);
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) { window.location.href = immediate; return; }
      setDetails(data);
    })();
    return () => { active = false; };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    const { data, error } = approve
      ? await oauthApi.approveAuthorization(authorizationId)
      : await oauthApi.denyAuthorization(authorizationId);
    if (error) { setBusy(false); return setError(error.message); }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) { setBusy(false); return setError("No redirect returned by the authorization server."); }
    window.location.href = target;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-6">
          <Shield className="h-7 w-7 text-primary" />
          <span className="text-xl font-bold font-sans">CVSäkert</span>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {details?.client?.name ? `Connect ${details.client.name} to CVSäkert` : "Authorize access"}
            </CardTitle>
            <CardDescription>
              This lets {details?.client?.name ?? "the client"} use CVSäkert as you. It cannot bypass this app's permissions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && <p className="text-sm text-destructive">Could not load this authorization request: {error}</p>}
            {!error && !details && <p className="text-sm text-muted-foreground">Loading…</p>}
            {details && (
              <>
                {details.client?.redirect_uris?.[0] && (
                  <p className="text-xs text-muted-foreground break-all">
                    Redirects to: <span className="font-mono">{details.client.redirect_uris[0]}</span>
                  </p>
                )}
                <div className="flex gap-2 pt-2">
                  <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>Approve</Button>
                  <Button variant="outline" className="flex-1" disabled={busy} onClick={() => decide(false)}>Cancel</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}