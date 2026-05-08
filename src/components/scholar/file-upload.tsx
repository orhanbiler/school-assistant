"use client";

import { useCallback, useRef, useState } from "react";
import { FileText, Link as LinkIcon, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface StoredFile {
  name: string;
  type: string;
  data: string; // base64
  sourceUrl: string;
}

interface FileUploadProps {
  storedFiles: StoredFile[];
  onAdd: (files: StoredFile[]) => void;
  onRemove: (index: number) => void;
  onUpdateSource: (index: number, url: string) => void;
}

const ACCEPTED = ".pdf,.txt,.doc,.docx,.html,.htm";
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

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

  const ingest = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      const valid = files.filter((f) => {
        if (f.size > MAX_FILE_BYTES) {
          toast.error(`${f.name} is too large`, { description: "Max 10 MB per file." });
          return false;
        }
        return true;
      });
      if (valid.length === 0) return;

      try {
        const stored = await Promise.all(valid.map(fileToStored));
        onAdd(stored);
        toast.success(`Added ${stored.length} file${stored.length === 1 ? "" : "s"}`);
      } catch {
        toast.error("Could not read one or more files");
      }
    },
    [onAdd],
  );

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload files"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
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
          multiple
          accept={ACCEPTED}
          onChange={(e) => {
            if (e.target.files) ingest(e.target.files);
            e.target.value = "";
          }}
          className="hidden"
        />
        <Upload
          className={cn(
            "w-10 h-10 mx-auto mb-3 transition-colors",
            isDragging ? "text-primary" : "text-muted-foreground",
          )}
        />
        <p className="text-sm font-medium">
          {isDragging ? "Release to upload" : "Drop files here or click to browse"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          PDF, TXT, DOC, DOCX, HTML &middot; up to 10 MB each
        </p>
      </div>

      {storedFiles.length > 0 && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">
            Uploaded Materials{" "}
            <span className="text-muted-foreground font-normal">({storedFiles.length})</span>
          </Label>

          {storedFiles.map((sf, index) => {
            const sizeBytes = sf.data ? Math.floor(sf.data.length * 0.75) : 0;
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
