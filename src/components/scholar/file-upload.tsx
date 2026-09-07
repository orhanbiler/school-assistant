"use client";

import { useCallback, useRef, useState } from "react";
import { Camera, FileText, ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DocumentReview } from "./document-review";
import { PhotoImport } from "./photo-import";
import { MaterialMetadataFields, WeekSelect, type MaterialMetadata } from "./material-metadata-fields";
import { readDocument } from "@/lib/read-document-client";
import type { ExtractedDocument } from "@/lib/document-extraction";
import { materialWeek, selectedMaterials, type StoredFile } from "@/lib/materials";
import { cn } from "@/lib/utils";
import { MAX_DOCUMENT_BYTES, MAX_FILE_BYTES, MAX_FILES, MAX_PHOTO_BYTES, MAX_STORED_MATERIALS } from "@/lib/request-limits";

export type { StoredFile } from "@/lib/materials";

interface FileUploadProps {
  storedFiles: StoredFile[];
  activeWeek: number;
  onWeekChange: (week: number) => void;
  onAdd: (files: StoredFile[]) => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, patch: Partial<StoredFile>) => void;
}
type PendingMaterial = { id: string; file: File; week: number; document?: ExtractedDocument; photo?: boolean };
const ACCEPTED = ".pdf,.docx,.txt,.html,.htm,image/*";
const isPhoto = (file: File) => file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|avif|gif)$/i.test(file.name);

function fileToStored(file: File, weekNumber: number): Promise<StoredFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ id: crypto.randomUUID(), name: file.name, type: file.type, data: (reader.result as string).split(",")[1], sourceUrl: "", weekNumber });
    reader.onerror = () => reject(new Error("The file could not be opened."));
    reader.readAsDataURL(file);
  });
}

export function FileUpload({ storedFiles, activeWeek, onWeekChange, onAdd, onRemove, onUpdate }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const readingRef = useRef(false);
  const [pending, setPending] = useState<PendingMaterial[]>([]);
  const [weekFilter, setWeekFilter] = useState("all");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const selected = selectedMaterials(storedFiles);
  const busy = reading || pending.length > 0 || editingIndex !== null;
  const editing = editingIndex === null ? undefined : storedFiles[editingIndex];
  const weeks = [...new Set(storedFiles.map(materialWeek))].sort((a, b) => a - b);
  const visible = storedFiles.map((file, index) => ({ file, index })).filter(({ file }) => weekFilter === "all" || String(materialWeek(file)) === weekFilter);
  const selectedWeeks = [...new Set(selected.map(materialWeek))].sort((a, b) => a - b);

  const ingest = useCallback(async (fileList: FileList | File[]) => {
    if (readingRef.current || pending.length) return;
    const files = Array.from(fileList);
    if (files.length > MAX_FILES) { toast.error(`Add up to ${MAX_FILES} files or photos at a time.`); return; }
    if (files.length + storedFiles.length > MAX_STORED_MATERIALS) { toast.error(`Keep up to ${MAX_STORED_MATERIALS} materials on this device. Remove older materials to add more.`); return; }
    readingRef.current = true;
    setReading(true);
    const stored: StoredFile[] = [];
    const documents: PendingMaterial[] = [];
    try {
      for (const file of files) {
        try {
          const photo = isPhoto(file);
          const document = /\.(pdf|docx)$/i.test(file.name);
          if (!photo && !/\.(pdf|docx|txt|html?)$/i.test(file.name)) throw new Error("Choose a photo, PDF, Word (.docx), TXT, or HTML file.");
          const max = photo ? MAX_PHOTO_BYTES : document ? MAX_DOCUMENT_BYTES : MAX_FILE_BYTES;
          if (!file.size || file.size > max || file.name.length > 255) throw new Error(photo ? "Choose a photo under 20 MB with a shorter filename." : document ? "Choose a PDF or Word document under 25 MB with a shorter filename." : "Choose a text excerpt under 128 KB with a shorter filename.");
          if (photo) documents.push({ id: crypto.randomUUID(), file, week: activeWeek, photo: true });
          else if (document) documents.push({ id: crypto.randomUUID(), file, week: activeWeek, document: await readDocument(file) });
          else stored.push(await fileToStored(file, activeWeek));
        } catch (error) { toast.error(`Cannot read ${file.name}`, { description: error instanceof Error ? error.message : "Save a new copy and try again." }); }
      }
      if (stored.length) { onAdd(stored); toast.success(`Saved ${stored.length} material${stored.length === 1 ? "" : "s"} to Week ${activeWeek}`); }
      setPending(documents);
      setWeekFilter("all");
    } finally { readingRef.current = false; setReading(false); }
  }, [activeWeek, onAdd, pending.length, storedFiles.length]);

  function savePending(text: string, pages: string | undefined, metadata: MaterialMetadata) {
    const item = pending[0];
    if (!item || storedFiles.length >= MAX_STORED_MATERIALS) return;
    onAdd([{ id: item.id, name: item.file.name, type: "text/plain", data: "", text, pages,
      originalSize: item.file.size, ...metadata, extraction: item.photo ? "photo" : undefined }]);
    setPending((items) => items.slice(1));
    toast.success(`Text saved to Week ${metadata.weekNumber}`);
  }

  return <div className="space-y-4">
    {editing?.text !== undefined && <DocumentReview name={editing.name} document={{ text: editing.text }} defaultWeek={materialWeek(editing)} initialMetadata={editing} photo={editing.extraction === "photo"} onCancel={() => setEditingIndex(null)} onUse={(text, _pages, metadata) => { onUpdate(editingIndex!, { text, ...metadata }); setEditingIndex(null); }} />}
    {pending[0]?.photo ? <PhotoImport key={pending[0].id} file={pending[0].file} defaultWeek={pending[0].week} onCancel={() => setPending((items) => items.slice(1))} onUse={(text, metadata) => savePending(text, undefined, metadata)} />
      : pending[0]?.document && <DocumentReview key={pending[0].id} name={pending[0].file.name} document={pending[0].document} defaultWeek={pending[0].week} onCancel={() => setPending((items) => items.slice(1))} onUse={savePending} />}

    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 sm:p-4 space-y-3">
      <WeekSelect id="upload-week" label="Add materials to" value={activeWeek} onChange={onWeekChange} />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="default" className="min-h-12 whitespace-normal" disabled={busy} onClick={() => cameraRef.current?.click()}><Camera className="shrink-0" />Take photo</Button>
        <Button variant="outline" className="min-h-12 whitespace-normal" disabled={busy} onClick={() => photoRef.current?.click()}><ImagePlus className="shrink-0" />Choose photos</Button>
      </div>
      <p className="text-xs text-muted-foreground">Turn textbook pages and screenshots into text you can review and use as references.</p>
    </div>
    <input ref={cameraRef} type="file" accept="image/*" capture="environment" disabled={busy} className="hidden" aria-label="Take a textbook photo" onChange={(event) => { if (event.target.files) void ingest(event.target.files); event.target.value = ""; }} />
    <input ref={photoRef} type="file" accept="image/*" multiple disabled={busy} className="hidden" aria-label="Choose textbook photos" onChange={(event) => { if (event.target.files) void ingest(event.target.files); event.target.value = ""; }} />
    <input ref={inputRef} type="file" accept={ACCEPTED} multiple disabled={busy} className="hidden" aria-label="Choose course files" onChange={(event) => { if (event.target.files) void ingest(event.target.files); event.target.value = ""; }} />
    <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}
      onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => { event.preventDefault(); setIsDragging(false); if (event.dataTransfer.files.length) void ingest(event.dataTransfer.files); }}
      className={cn("w-full rounded-xl border-2 border-dashed p-4 text-center transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60", isDragging ? "border-primary bg-primary/5" : "border-border/70 hover:border-primary/50")}
      aria-busy={reading}>
      {reading ? <Loader2 className="mx-auto mb-2 size-6 animate-spin" /> : <Upload className="mx-auto mb-2 size-6 text-muted-foreground" />}
      <span className="block text-sm font-medium">{reading ? "Reading documents…" : isDragging ? "Drop to add materials" : "Choose files or drop them here"}</span>
      <span className="mt-1 block text-xs text-muted-foreground">PDF, Word, TXT, HTML, or photos</span>
    </button>
    <p className="text-xs text-muted-foreground">Add up to 3 at a time. Photos: 20 MB; PDF/Word: 25 MB; text: 128 KB. For a scanned PDF, save or photograph the relevant page and choose it as a photo.</p>

    {storedFiles.length > 0 && <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h3 className="text-sm font-semibold">Your materials <span className="font-normal text-muted-foreground">({storedFiles.length})</span></h3>
          <p role="status" className="mt-1 text-xs text-muted-foreground">{selected.length} of {MAX_FILES} selected for this draft{selectedWeeks.length ? ` · ${selectedWeeks.map((week) => `Week ${week}`).join(", ")}` : ""}</p></div>
        <div className="min-w-32 space-y-1"><Label htmlFor="material-week-filter" className="text-xs">Show</Label><Select value={weekFilter} onValueChange={setWeekFilter}><SelectTrigger id="material-week-filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All weeks</SelectItem>{weeks.map((week) => <SelectItem key={week} value={String(week)}>Week {week}</SelectItem>)}</SelectContent></Select></div>
      </div>
      {visible.length === 0 && <p className="text-sm text-muted-foreground">No materials in this week. Choose All weeks to see your library.</p>}
      {visible.map(({ file, index }) => <article key={file.id || `${file.name}-${index}`} className={cn("min-w-0 rounded-xl border p-3 space-y-3", file.included !== false ? "border-primary/30 bg-primary/5" : "border-border/50 bg-background/30")}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0"><p className="mb-1 text-xs font-medium text-primary">Week {materialWeek(file)}{file.extraction === "photo" ? " · Photo text" : ""}</p><h4 className="flex min-w-0 items-center gap-2 text-sm font-medium"><FileText className="size-4 shrink-0" /><span className="break-words min-w-0 [overflow-wrap:anywhere]">{file.name}</span></h4></div>
          <Button type="button" size="icon" variant="ghost" className="size-11 shrink-0 hover:text-destructive" onClick={() => onRemove(index)} aria-label={`Remove ${file.name}`}><Trash2 /></Button>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" className="size-5 accent-[var(--primary)]" aria-label={`Use ${file.name} in this draft`} checked={file.included !== false} disabled={file.included === false && selected.length >= MAX_FILES} onChange={(event) => onUpdate(index, { included: event.target.checked })} />Use in this draft</label>
        {file.materialContext && <p className="text-xs text-muted-foreground break-words [overflow-wrap:anywhere]">{file.materialContext}</p>}
        <details className="text-sm"><summary className="min-h-11 cursor-pointer content-center text-muted-foreground">Week, source link & notes</summary><div className="pt-3"><MaterialMetadataFields id={`material-${index}`} value={file} onChange={(patch) => onUpdate(index, patch)} /></div></details>
        {file.text !== undefined && <Button variant="outline" className="min-h-11 w-full" disabled={busy} onClick={() => setEditingIndex(index)}>Review or edit saved text{file.pages ? ` · pages ${file.pages}` : ""}</Button>}
      </article>)}
      <p className="text-xs text-muted-foreground">Keep up to {MAX_STORED_MATERIALS} materials on this device. Choose up to {MAX_FILES} relevant excerpts for each draft. A week filter changes the list; your selections stay the same.</p>
    </div>}
  </div>;
}
