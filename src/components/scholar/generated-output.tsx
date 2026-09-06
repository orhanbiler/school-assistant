"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Check, Copy, Download, Feather, Loader2, Sparkles, Eye, FileCode, Pencil, Share2, Undo2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { countCharacters, countWords, readingTime } from "@/lib/text";

interface GeneratedOutputProps {
  content: string;
  isLoading: boolean;
  isRevising: boolean;
  reviseDisabled?: boolean;
  canRestore: boolean;
  onRevise: (instructions?: string) => void;
  onDownload: () => void;
  onEdit: (content: string) => void;
  onRestore: () => void;
}

const subscribeToCapabilities = () => () => {};

export function GeneratedOutput({ content, isLoading, isRevising, reviseDisabled = false, canRestore, onRevise, onDownload, onEdit, onRestore }: GeneratedOutputProps) {
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState("rendered");
  const [instructions, setInstructions] = useState("");
  const canShare = useSyncExternalStore(subscribeToCapabilities, () => typeof navigator.share === "function", () => false);
  const stats = useMemo(() => ({ words: countWords(content), chars: countCharacters(content), reading: readingTime(content) }), [content]);
  const busy = isLoading || isRevising || reviseDisabled;

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error("Could not copy. Open Edit and select the text to copy it."); }
  }

  async function shareDraft() {
    try { await navigator.share({ title: "My draft — Scholar's Quill", text: content }); }
    catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) toast.error("Sharing is unavailable. Copy or download the draft instead.");
    }
  }

  return <Card className="glass min-w-0 border-border/50 animate-fade-in stagger-3">
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-xl"><Feather className="w-5 h-5 text-primary" />My draft</CardTitle>
      <CardDescription>Read it through, add your own wording, and check the sources.</CardDescription>
      {content && !isLoading && <>
        <div className="flex flex-wrap gap-2 mt-3">
          <Button variant="outline" size="sm" onClick={() => onRevise(instructions)} disabled={busy || !content.trim()}>
            {isRevising ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {isRevising ? "Revising…" : "Light edit with AI"}
          </Button>
          <Button variant={copied ? "default" : "outline"} size="sm" onClick={copyToClipboard}>
            {copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="outline" size="sm" onClick={onDownload}><Download />Download</Button>
          {canShare && <Button variant="outline" size="sm" onClick={shareDraft}><Share2 />Share</Button>}
          {canRestore && <Button variant="ghost" size="sm" disabled={busy} onClick={() => { onRestore(); toast.success("Previous draft restored"); }}><Undo2 />Restore previous draft</Button>}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mt-2" aria-live="off">
          <span>{stats.words.toLocaleString()} words</span><span>{stats.chars.toLocaleString()} characters</span><span>{stats.reading}</span>
        </div>
      </>}
    </CardHeader>
    <CardContent className="min-w-0">
      {(content || view === "edit") && !isLoading ? <Tabs value={view} onValueChange={setView} className="min-w-0">
        <TabsList aria-label="Draft view" className="grid grid-cols-3 h-auto w-full sm:w-fit mb-2">
          <TabsTrigger value="rendered"><Eye />Read</TabsTrigger>
          <TabsTrigger value="edit"><Pencil />Edit</TabsTrigger>
          <TabsTrigger value="raw"><FileCode />Raw</TabsTrigger>
        </TabsList>
        <TabsContent value="rendered" className="min-w-0 mt-0">
          <div className="rounded-lg border border-border/50 bg-background/30 lg:max-h-[65dvh] lg:overflow-y-auto overscroll-contain">
            <article className="draft-prose prose prose-neutral dark:prose-invert max-w-none p-4 sm:p-6 prose-p:leading-relaxed prose-headings:font-semibold prose-pre:bg-muted/50">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: () => null, table: ({ children }) => <table tabIndex={0} aria-label="Scrollable table">{children}</table>, a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}>{content}</ReactMarkdown>
            </article>
          </div>
        </TabsContent>
        <TabsContent value="edit" className="min-w-0 space-y-4 mt-0">
          <div className="space-y-2">
            <Label htmlFor="draft-editor">Edit your draft</Label>
            <Textarea id="draft-editor" value={content} onChange={(event) => onEdit(event.target.value)} disabled={busy} spellCheck className="field-sizing-fixed min-h-80 h-[55dvh] resize-y bg-background/50 leading-relaxed" aria-describedby="draft-edit-help" />
            <p id="draft-edit-help" className="text-xs text-muted-foreground">Your changes save on this device. Copy, download, and share use this version. Markdown formatting is supported.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="revision-instructions">What should the AI edit? (optional)</Label>
            <Textarea id="revision-instructions" value={instructions} onChange={(event) => setInstructions(event.target.value)} maxLength={2000} disabled={busy} placeholder="For example: shorten the opening, keep my example, and leave the ending as a statement." className="min-h-24" />
            <p className="text-xs text-muted-foreground">Light editing keeps your meaning and references. Each AI edit uses one generation; your previous draft can be restored.</p>
          </div>
        </TabsContent>
        <TabsContent value="raw" className="min-w-0 mt-0">
          <pre className="draft-prose rounded-lg border border-border/50 bg-background/30 p-4 sm:p-6 text-sm leading-relaxed whitespace-pre-wrap font-mono lg:max-h-[65dvh] lg:overflow-y-auto">{content}</pre>
        </TabsContent>
      </Tabs> : <div className="rounded-lg border border-border/50 bg-background/30 p-4 sm:p-6 min-h-64" role="status">
        {isLoading ? <div className="space-y-4 py-6">
          <div className="flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" />Drafting your content…</div>
          {[90, 95, 80, 88, 92, 85].map((width, index) => <Skeleton key={index} className="h-4" style={{ width: `${width}%` }} />)}
        </div> : <div className="flex flex-col items-center justify-center py-12 text-center">
          <Feather className="w-10 h-10 text-muted-foreground mb-4" />
          <p className="font-medium text-muted-foreground">Your draft will appear here</p>
          <p className="text-sm text-muted-foreground mt-2 max-w-64">Add your materials and ideas, then choose a writing format.</p>
        </div>}
      </div>}
    </CardContent>
  </Card>;
}
