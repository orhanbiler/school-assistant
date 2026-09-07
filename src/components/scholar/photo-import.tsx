"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2, RotateCw, ScanText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { preparePhoto } from "@/lib/prepare-photo-client";
import { DocumentReview } from "./document-review";
import type { MaterialMetadata } from "./material-metadata-fields";

export function PhotoImport({ file, defaultWeek, onUse, onCancel }: {
  file: File; defaultWeek: number; onUse: (text: string, metadata: MaterialMetadata) => void; onCancel: () => void;
}) {
  const router = useRouter();
  const [rotation, setRotation] = useState(0);
  const [prepared, setPrepared] = useState<{ file: File; url: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    let active = true;
    let previewUrl: string | undefined;
    setPrepared(null);
    setError("");
    void preparePhoto(file, rotation).then((photo) => {
      if (!active) return;
      previewUrl = URL.createObjectURL(photo);
      setPrepared({ file: photo, url: previewUrl });
    }).catch((error) => { if (active) setError(error instanceof Error ? error.message : "The photo could not be opened."); });
    return () => { active = false; if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [file, rotation]);
  useEffect(() => () => { controller.current?.abort(); }, []);

  async function readText() {
    if (!prepared || inFlight.current) return;
    inFlight.current = true;
    setReading(true);
    setError("");
    const abort = new AbortController();
    controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 90_000);
    try {
      const body = new FormData();
      body.set("image", prepared.file);
      const response = await fetch("/api/extract-image", { method: "POST", headers: { "X-Scholar-Request": "1" }, credentials: "same-origin", body, signal: abort.signal });
      if (response.status === 401) { router.replace("/login"); return; }
      const data = await response.json().catch(() => null);
      if (!response.ok || typeof data?.text !== "string") throw new Error(data?.error || "The photo could not be read. Try a smaller image.");
      if (!abort.signal.aborted) setText(data.text);
    } catch (error) {
      setError(abort.signal.aborted ? "Photo reading timed out. Try a closer photo of a smaller section." : error instanceof Error ? error.message : "Photo reading failed. Check your connection and try again.");
    } finally { clearTimeout(timeout); inFlight.current = false; setReading(false); }
  }

  if (text !== null) return <DocumentReview name={file.name} document={{ text }} defaultWeek={defaultWeek} photo previewUrl={prepared?.url} onCancel={onCancel} onUse={(value, _pages, metadata) => onUse(value, metadata)} />;
  return <Dialog open onOpenChange={(open) => { if (!open && !reading) onCancel(); }}>
    <DialogContent className="document-dialog sm:max-w-xl max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden p-4 sm:p-6" onInteractOutside={(event) => { if (reading) event.preventDefault(); }}>
      <DialogHeader>
        <DialogTitle>Read a textbook photo</DialogTitle>
        <DialogDescription>Use a clear photo of one page, with all four corners visible. Rotate it if needed.</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto space-y-3">
        {prepared ? <Image src={prepared.url} width={1200} height={1600} unoptimized alt="Textbook page ready for text recognition" className="h-auto max-h-[42dvh] w-full rounded-lg object-contain bg-muted" /> : !error && <p role="status" className="flex items-center gap-2 py-8"><Loader2 className="size-5 animate-spin" />Preparing photo…</p>}
        <Button variant="outline" disabled={!prepared || reading} onClick={() => setRotation((value) => (value + 90) % 360)}><RotateCw />Rotate photo</Button>
        <p className="text-sm text-muted-foreground">Reading sends this photo to OpenAI and uses one AI request. You can correct the text before saving it. The app saves the text, not the photo.</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {reading && <p role="status" className="text-sm">Reading the page… Keep this screen open.</p>}
      </div>
      <DialogFooter className="shrink-0 border-t pt-3">
        <Button variant="outline" disabled={reading} onClick={onCancel}>Cancel</Button>
        <Button disabled={!prepared || reading} onClick={readText}>{reading ? <Loader2 className="animate-spin" /> : <ScanText />}{reading ? "Reading…" : "Read text from photo"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
