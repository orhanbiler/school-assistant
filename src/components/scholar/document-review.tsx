"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { countWords } from "@/lib/text";
import { MAX_MATERIAL_TEXT_BYTES } from "@/lib/request-limits";
import type { ExtractedDocument } from "@/lib/document-extraction";

export function DocumentReview({ name, document, onUse, onCancel }: {
  name: string; document: ExtractedDocument; onUse: (text: string, pages?: string) => void; onCancel: () => void;
}) {
  const [start, setStart] = useState("1");
  const [end, setEnd] = useState(String(document.pages?.length || 1));
  const [text, setText] = useState(document.text);
  const [appliedPages, setAppliedPages] = useState(document.pages ? `1–${document.pages.length}` : undefined);
  const bytes = new TextEncoder().encode(text).byteLength;
  const overLimit = bytes > MAX_MATERIAL_TEXT_BYTES;
  const validRange = Number.isInteger(Number(start)) && Number.isInteger(Number(end)) && Number(start) >= 1 && Number(end) >= Number(start) && Number(end) <= (document.pages?.length || 0);
  return <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
    <DialogContent className="document-dialog sm:max-w-2xl max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden p-4 sm:p-6">
      <DialogHeader>
        <DialogTitle>Choose text to use</DialogTitle>
        <DialogDescription className="break-words">{name}{document.pages ? ` · ${document.pages.length} pages` : ""}. Review the extracted text before adding it to your materials.</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain space-y-4 pr-1">
      {document.pages && <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Page numbers refer to the PDF file, including its cover and contents.</p>
        <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_auto] items-end gap-3">
          <div className="min-w-0 space-y-1"><Label htmlFor="pdf-start">From page</Label><Input id="pdf-start" type="number" inputMode="numeric" min={1} max={document.pages.length} value={start} onChange={(event) => setStart(event.target.value)} /></div>
          <div className="min-w-0 space-y-1"><Label htmlFor="pdf-end">To page</Label><Input id="pdf-end" type="number" inputMode="numeric" min={1} max={document.pages.length} value={end} onChange={(event) => setEnd(event.target.value)} /></div>
          <Button className="col-span-2 sm:col-span-1" variant="outline" disabled={!validRange} onClick={() => {
            setText(document.pages!.slice(Number(start) - 1, Number(end)).join("\n\n"));
            setAppliedPages(`${start}–${end}`);
          }}>Use these pages</Button>
        </div>
      </div>}
      <div className="space-y-2">
        <Label htmlFor="document-excerpt">Text for this draft</Label>
        <Textarea id="document-excerpt" className="field-sizing-fixed min-h-36 h-[32dvh] sm:h-64 resize-y" value={text} onChange={(event) => setText(event.target.value)} />
        <p className="text-xs text-muted-foreground">{countWords(text).toLocaleString()} words · Only this text is saved and sent when you generate. The original document stays on your device.</p>
        {overLimit && <p role="status" className="text-sm text-destructive">This is a long document. {document.pages ? "Choose fewer pages above or " : ""}keep only the relevant passages in the text box.</p>}
        {!text.trim() && <p role="status" className="text-sm text-destructive">These pages contain no readable text. Choose other pages or paste a text excerpt.</p>}
      </div>
      </div>
      <DialogFooter className="shrink-0 border-t pt-3">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button disabled={overLimit || !text.trim()} onClick={() => onUse(text.trim(), appliedPages)}>Add selected text</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
