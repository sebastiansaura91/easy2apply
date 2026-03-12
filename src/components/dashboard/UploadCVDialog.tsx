import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Upload, FileUp, Loader2 } from "lucide-react";

export const UploadCVDialog = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!user) return;

    const validTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];

    if (!validTypes.includes(file.type)) {
      toast({
        title: t("error"),
        description: "Endast PDF, DOCX och TXT-filer stöds.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: t("error"),
        description: "Filen får vara max 10 MB.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-cv`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: formData,
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Kunde inte tolka CV:t");
      }

      const { cv } = await res.json();

      // Create a new resume with the parsed content
      const newId = uuidv4();
      const title = cv.contact?.name
        ? `${cv.contact.name} – CV`
        : file.name.replace(/\.[^/.]+$/, "");

      const { error } = await supabase.from("resumes").insert({
        id: newId,
        user_id: user.id,
        title,
        language: "sv",
        template_id: "default",
        content_json: cv as any,
      });

      if (error) throw error;

      setOpen(false);
      toast({ title: "CV importerat!", description: "Granska och redigera ditt importerade CV." });
      navigate(`/editor/${newId}`);
    } catch (err: any) {
      console.error("Upload error:", err);
      toast({
        title: t("error"),
        description: err.message || "Något gick fel vid uppladdning.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-2 h-4 w-4" />
          Ladda upp CV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Importera befintligt CV</DialogTitle>
          <DialogDescription>
            Ladda upp ditt CV som PDF, DOCX eller TXT. Vi extraherar innehållet automatiskt med AI.
          </DialogDescription>
        </DialogHeader>

        <div
          className={`mt-4 border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Analyserar ditt CV med AI...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <FileUp className="h-10 w-10 text-muted-foreground/50" />
              <div>
                <p className="font-medium text-sm">Dra och släpp din fil här</p>
                <p className="text-xs text-muted-foreground mt-1">eller klicka för att välja fil</p>
              </div>
              <p className="text-xs text-muted-foreground">PDF, DOCX eller TXT (max 10 MB)</p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt"
            className="hidden"
            onChange={onFileChange}
            disabled={uploading}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
