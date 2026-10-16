import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

/** Render the real PDF on canvas; works in browsers without an embedded PDF viewer. */
export function PdfSpacingPreview({ blob, sv }: { blob: Blob; sv: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const host = container.current;
    if (!host) return;
    host.replaceChildren();
    setLoading(true);
    setFailed(false);
    async function render() {
      const pdfjs = await import("pdfjs-dist");
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const task = pdfjs.getDocument({ data: await blob.arrayBuffer() });
      const doc = await task.promise;
      try {
        for (let i = 1; i <= doc.numPages; i++) {
          if (cancelled || !host) return;
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "w-full h-auto border border-border";
          canvas.setAttribute("aria-label", `${sv ? "Sida" : "Page"} ${i}`);
          const context = canvas.getContext("2d");
          if (!context) continue;
          await page.render({ canvasContext: context, canvas, viewport }).promise;
          if (!cancelled) host.appendChild(canvas);
        }
      } finally { await task.destroy(); }
      if (!cancelled) setLoading(false);
    }
    render().catch((error: unknown) => { if (!cancelled) { console.error("PDF spacing preview failed", error); setFailed(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [blob, sv]);
  return <div className="h-[60vh] min-h-[360px] overflow-auto rounded-md border border-border bg-muted p-3">
    {loading && <Loader2 className="mx-auto my-5 h-5 w-5 animate-spin text-muted-foreground" aria-label={sv ? "Laddar PDF" : "Loading PDF"} />}
    {failed && <p className="text-sm text-destructive">{sv ? "Förhandsvisningen kunde inte laddas." : "The preview could not load."}</p>}
    <div ref={container} className="space-y-3" />
  </div>;
}