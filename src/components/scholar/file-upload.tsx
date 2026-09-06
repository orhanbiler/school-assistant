"use client";

import { useCallback, useRef, useState } from "react";
import { FileText, Link as LinkIcon, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DocumentReview } from "./document-review";
import { readDocument } from "@/lib/read-document-client";
import type { ExtractedDocument } from "@/lib/document-extraction";
import { cn } from "@/lib/utils";
import { MAX_DOCUMENT_BYTES, MAX_FILE_BYTES, MAX_FILES } from "@/lib/request-limits";

export interface StoredFile {
  name: string;
  type: string;
  data: string; // base64 for legacy TXT/HTML uploads; empty for extracted documents
  text?: string;
  pages?: string;
  originalSize?: number;
  sourceUrl: string;
}

interface FileUploadProps {
  storedFiles: StoredFile[];
  onAdd: (files: StoredFile[]) => void;
  onRemove: (index: number) => void;
  onUpdateSource: (index: number, url: string) => void;
}

const ACCEPTED = ".pdf,.docx,.txt,.html,.htm";

function fileToStored(file: File): Promise<StoredFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      resolve({ name: file.name, type: file.type, data: base64, sourceUrl: "" });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUpload({ storedFiles, onAdd, onRemove, onUpdateSource }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const readingRef = useRef(false);
  const [pending, setPending] = useState<{ id: string; file: File; document: ExtractedDocument }[]>([]);

  const ingest = useCallback(
    async (fileList: FileList | File[]) => {
      if (readingRef.current || pending.length) return;
      const files = Array.from(fileList);
      if (files.length + storedFiles.length > MAX_FILES) {
        toast.error(`Upload at most ${MAX_FILES} files. Keep only the relevant excerpts.`);
        return;
      }
      const valid = files.filter((f) => {
        if (!/\.(pdf|docx|txt|html?)$/i.test(f.name)) {
          toast.error(`Cannot read ${f.name}`, {
            description: "Use PDF, Word (.docx), TXT, or HTML. Save older .doc files as .docx first.",
          });
          return false;
        }
        const document = /\.(pdf|docx)$/i.test(f.name);
        if (f.size > (document ? MAX_DOCUMENT_BYTES : MAX_FILE_BYTES) || f.name.length > 255) {
          toast.error(`${f.name} is too large`, { description: document ? "Max 25 MB per PDF or Word document; keep filenames under 256 characters." : "Max 128 KB per text file. Upload a short excerpt." });
          return false;
        }
        return true;
      });
      if (valid.length === 0) return;

      readingRef.current = true;
      setReading(true);
      const stored: StoredFile[] = [];
      const documents: { id: string; file: File; document: ExtractedDocument }[] = [];
      try {
        for (const file of valid) {
          try {
            if (/\.(pdf|docx)$/i.test(file.name)) documents.push({ id: crypto.randomUUID(), file, document: await readDocument(file) });
            else stored.push(await fileToStored(file));
          } catch (error) {
            toast.error(`Cannot read ${file.name}`, { description: error instanceof Error ? error.message : "Save a new copy and try again." });
          }
        }
        if (stored.length) { onAdd(stored); toast.success(`Added ${stored.length} file${stored.length === 1 ? "" : "s"}`); }
        setPending(documents);
      } finally { readingRef.current = false; setReading(false); }
    },
    [onAdd, storedFiles.length, pending.length],
  );

  return (
    <div className="space-y-4">
      {pending[0] && <DocumentReview key={pending[0].id} name={pending[0].file.name} document={pending[0].document}
        onCancel={() => setPending((items) => items.slice(1))}
        onUse={(text, pages) => {
          const { file } = pending[0];
          if (storedFiles.length >= MAX_FILES) { toast.error(`Upload at most ${MAX_FILES} files.`); return; }
          onAdd([{ name: file.name, type: "text/plain", data: "", sourceUrl: "", text, pages, originalSize: file.size }]);
          setPending((items) => items.slice(1));
          toast.success("Selected text added");
        }} />}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload files"
        aria-disabled={reading}
        aria-busy={reading}
        onClick={() => { if (!reading) inputRef.current?.click(); }}
        onKeyDown={(e) => {
          if (!reading && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files?.length) ingest(e.dataTransfer.files);
        }}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2",
          isDragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border/70 hover:border-primary/50 hover:bg-accent/30",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          disabled={reading}
          multiple
          accept={ACCEPTED}
          onChange={(e) => {
            if (e.target.files) ingest(e.target.files);
            e.target.value = "";
          }}
          className="hidden"
        />
        {reading ? <Loader2 className="w-10 h-10 mx-auto mb-3 animate-spin text-primary" /> : <Upload
          className={cn(
            "w-10 h-10 mx-auto mb-3 transition-colors",
            isDragging ? "text-primary" : "text-muted-foreground",
          )}
        />}
        <p className="text-sm font-medium">
          {reading ? "Reading document…" : isDragging ? "Release to upload" : "Drop files here or click to browse"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          PDF, DOCX, TXT, HTML &middot; up to 3 files
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        PDFs and Word documents: up to 25 MB. Text files: up to 128 KB.
        Choose the pages or passages to use from long documents. Scanned PDFs need text recognition first.
        Source URLs are used for citations; linked pages are not fetched.
      </p>

      {storedFiles.length > 0 && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">
            Uploaded Materials{" "}
            <span className="text-muted-foreground font-normal">({storedFiles.length})</span>
          </Label>

          {storedFiles.map((sf, index) => {
            const sizeBytes = sf.originalSize || (sf.data ? Math.floor(sf.data.length * 0.75) : 0);
            return (
              <div
                key={`${sf.name}-${index}`}
                className="p-3 rounded-lg border border-border/50 bg-background/30 space-y-2 group"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-sm font-medium truncate">{sf.name}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {fileSize(sizeBytes)}
                    </span>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => onRemove(index)}
                        aria-label={`Remove ${sf.name}`}
                        className="shrink-0 hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Remove file</TooltipContent>
                  </Tooltip>
                </div>
                {sf.text !== undefined && <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">Review selected text{sf.pages ? ` · PDF pages ${sf.pages}` : ""}</summary>
                  <p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs">{sf.text}</p>
                </details>}
                <div className="flex items-center gap-2">
                  <LinkIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <Input
                    placeholder="Source URL for APA7 citation (optional)"
                    value={sf.sourceUrl}
                    onChange={(e) => onUpdateSource(index, e.target.value)}
                    className="bg-background/50 text-sm h-8"
                    inputMode="url"
                    type="url"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
