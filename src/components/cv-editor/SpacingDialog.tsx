import { useEffect, useMemo, useState } from "react";
import { CVContent, CVSection } from "@/types/cv";
import { CV_SPACING, CVSpacingId, getCVSpacing } from "@/lib/cv-spacing";
import { buildPdf } from "@/lib/export-pdf";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cv: CVContent;
  sections: CVSection[];
  t: (key: string) => string;
  language: "sv" | "en";
  appLanguage: "sv" | "en";
  onApply: (id: CVSpacingId) => void;
}

export function SpacingDialog({ open, onOpenChange, cv, sections, t, language, appLanguage, onApply }: Props) {
  const sv = appLanguage === "sv";
  const options = useMemo(() => {
    if (!open) return [];
    return CV_SPACING.map(spacing => {
      const candidate = { ...cv, __meta: { ...cv.__meta, spacingPreset: spacing.id } };
      const pdf = buildPdf(candidate, sections, t, cv.__meta?.templateStyle, cv.__meta?.templateAccent, language);
      return { spacing, pages: pdf.getNumberOfPages(), blob: pdf.output("blob") };
    });
  }, [open, cv, sections, t, language]);
  const recommended = options.find(option => option.pages <= 2);
  const [selected, setSelected] = useState<CVSpacingId>("standard");
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (open) setSelected(recommended?.spacing.id ?? getCVSpacing(cv.__meta?.spacingPreset).id);
  }, [open, recommended?.spacing.id, cv.__meta?.spacingPreset]);
  const current = options.find(option => option.spacing.id === selected);
  useEffect(() => {
    if (!current) { setUrl(undefined); return; }
    const next = URL.createObjectURL(current.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [current]);

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{sv ? "Spacing för två sidor" : "Spacing for two pages"}</DialogTitle></DialogHeader>
      <div className="grid gap-5 md:grid-cols-[280px_1fr]">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{sv ? "All text och alla teckenstorlekar behålls." : "All text and font sizes are preserved."}</p>
          <fieldset className="space-y-2">
            <legend className="sr-only">{sv ? "Spacing" : "Spacing"}</legend>
            {options.map(({ spacing, pages }) => <label key={spacing.id} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${selected === spacing.id ? "border-primary bg-accent" : "border-border"}`}>
              <input type="radio" name="cv-spacing" value={spacing.id} checked={selected === spacing.id} onChange={() => setSelected(spacing.id)} className="mt-1 accent-primary" />
              <span className="min-w-0 text-sm">
                <span className="flex flex-wrap gap-x-2 font-medium">{spacing.label[appLanguage]} <span>{pages} {sv ? "sidor" : "pages"}</span></span>
                {recommended?.spacing.id === spacing.id && <span className="block text-xs text-primary">{sv ? "Rekommenderad" : "Recommended"}</span>}
                <span className="mt-1 block text-xs text-muted-foreground">{sv ? "Radavstånd" : "Line spacing"} {spacing.lineHeight.toFixed(2)}<br />{sv ? "Sidmarginal" : "Side margins"} {spacing.marginX} mm · {sv ? "Topp/botten" : "Top/bottom"} {spacing.marginY} mm<br />{sv ? "Mellanrum" : "Gaps"} {Math.round(spacing.gapScale * 100)}%</span>
              </span>
            </label>)}
          </fieldset>
          {!recommended && <p className="text-sm text-warning">{sv ? "Texten ryms inte på två sidor med dessa läsbara layoutval. Allt innehåll behålls; inga roller klipps." : "The text cannot fit on two pages with these readable layouts. All content is preserved; no roles are clipped."}</p>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { onApply(selected); onOpenChange(false); }} disabled={!current}>{sv ? "Använd layout" : "Apply layout"}</Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>{sv ? "Avbryt" : "Cancel"}</Button>
          </div>
        </div>
        {url && <iframe title={sv ? "PDF med föreslagen spacing" : "PDF with suggested spacing"} src={url} className="h-[60vh] min-h-[360px] w-full rounded-md border border-border bg-muted" />}
      </div>
    </DialogContent>
  </Dialog>;
}