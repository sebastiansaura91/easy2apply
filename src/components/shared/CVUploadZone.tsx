import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CVContent } from "@/types/cv";
import { FileUp, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  onParsed: (cv: CVContent) => void;
  className?: string;
}

export function CVUploadZone({ onParsed, className }: Props) {
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handle = async (file: File) => {
    const ok = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
    if (!ok.includes(file.type)) { toast({ title: "Unsupported format", description: "PDF, DOCX or TXT only.", variant: "destructive" }); return; }
    if (file.size > 10 * 1024 * 1024) { toast({ title: "File too large", description: "Max 10 MB.", variant: "destructive" }); return; }
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-cv`, {
        method: "POST", headers: { Authorization: `Bearer ${session?.access_token}` }, body: fd,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Parse failed"); }
      const { cv } = await res.json();
      setDone(true);
      onParsed(cv as CVContent);
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally { setUploading(false); }
  };

  return (
    <div className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"} ${className || ""}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handle(f); }}
      onClick={() => !uploading && !done && ref.current?.click()}>
      {done ? (
        <div className="flex flex-col items-center gap-3">
          <CheckCircle2 className="h-10 w-10 text-green-500" />
          <p className="font-medium text-sm">CV uploaded and parsed</p>
        </div>
      ) : uploading ? (
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Analyzing your CV with AI...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <FileUp className="h-10 w-10 text-muted-foreground/50" />
          <p className="font-medium text-sm">Drag and drop your CV here</p>
          <p className="text-xs text-muted-foreground">or click to select · PDF, DOCX, TXT (max 10 MB)</p>
        </div>
      )}
      <input ref={ref} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handle(f); }} disabled={uploading || done} />
    </div>
  );
}
