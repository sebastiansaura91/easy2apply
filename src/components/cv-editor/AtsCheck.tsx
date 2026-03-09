import { CheckCircle2, AlertTriangle } from "lucide-react";
import { CVContent } from "@/types/cv";

export function runAtsCheck(cv: CVContent, t: (k: any) => string) {
  const checks: { key: string; label: string; pass: boolean; message?: string }[] = [];

  const enabledSections = cv.sections.filter((s) => s.enabled).map((s) => s.type);
  const hasProfile = enabledSections.includes("profile") && cv.profile.length > 0;
  checks.push({ key: "headers", label: t("atsCheckHeaders"), pass: hasProfile });

  const dates = cv.experience.flatMap((e) => [e.startDate, e.endDate].filter(Boolean));
  const dateFormatOk = dates.every((d) => /^\d{4}-\d{2}$/.test(d));
  checks.push({ key: "dates", label: t("atsCheckDates"), pass: dates.length === 0 || dateFormatOk });

  const allText = JSON.stringify(cv);
  const hasSuspicious = /[\t]|(\|.*\|)/.test(allText);
  checks.push({ key: "chars", label: t("atsCheckChars"), pass: !hasSuspicious });

  const allBullets = cv.experience.flatMap((e) => e.bullets).concat(cv.projects.flatMap((p) => p.bullets));
  const longBullets = allBullets.filter((b) => b.length > 200);
  checks.push({ key: "bulletLength", label: t("atsCheckBulletLength"), pass: longBullets.length === 0, message: longBullets.length > 0 ? `${longBullets.length} bullets > 200 tecken` : undefined });

  const hasContact = cv.contact.name.length > 0 && cv.contact.email.length > 0;
  checks.push({ key: "contact", label: t("atsCheckContact"), pass: hasContact });

  return checks;
}

export function AtsCheckPanel({ cv, t }: { cv: CVContent; t: (k: any) => string }) {
  const results = runAtsCheck(cv, t);

  return (
    <div className="space-y-3">
      {results.map((check) => (
        <div key={check.key} className="flex items-center gap-3 p-3 rounded-lg border border-border">
          {check.pass ? (
            <CheckCircle2 className="h-5 w-5 text-accent flex-shrink-0" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
          )}
          <div>
            <p className="text-sm font-medium">{check.label}</p>
            {check.message && <p className="text-xs text-muted-foreground">{check.message}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
