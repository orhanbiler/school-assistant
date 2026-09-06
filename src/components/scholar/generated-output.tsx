"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Feather,
  Loader2,
  Sparkles,
  Eye,
  FileCode,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { countCharacters, countWords, readingTime } from "@/lib/text";

interface GeneratedOutputProps {
  content: string;
  isLoading: boolean;
  isRevising: boolean;
  reviseDisabled?: boolean;
  onRevise: () => void;
  onDownload: () => void;
}

export function GeneratedOutput({
  content,
  isLoading,
  isRevising,
  reviseDisabled = false,
  onRevise,
  onDownload,
}: GeneratedOutputProps) {
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<"rendered" | "raw">("rendered");

  const stats = useMemo(
    () => ({
      words: countWords(content),
      chars: countCharacters(content),
      reading: readingTime(content),
    }),
    [content],
  );

  const copyToClipboard = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <Card className="glass border-border/50 h-full flex flex-col animate-fade-in stagger-3">
      <CardHeader className="flex-shrink-0">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Feather className="w-5 h-5 text-primary" />
              Generated Content
            </CardTitle>
            <CardDescription>
              Review your draft for voice, accuracy, and assignment requirements
            </CardDescription>
          </div>
          {content && !isLoading && (
            <div className="flex items-center gap-2 flex-wrap">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRevise}
                    disabled={isRevising || reviseDisabled}
                    className="flex items-center gap-2"
                  >
                    {isRevising ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Revising
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Refine Writing
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Improve clarity and flow using your voice settings</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onDownload}
                    className="flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    <span className="sr-only sm:not-sr-only">Download</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Download as .txt</TooltipContent>
              </Tooltip>
              <Button
                variant={copied ? "default" : "outline"}
                size="sm"
                onClick={copyToClipboard}
                className="flex items-center gap-2"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {content && !isLoading && (
          <div className="mt-3 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">
              {stats.words.toLocaleString()} words
            </span>
            <span>&middot;</span>
            <span className="font-mono tabular-nums">
              {stats.chars.toLocaleString()} chars
            </span>
            <span>&middot;</span>
            <span>{stats.reading}</span>
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 flex flex-col min-h-0">
        {content && !isLoading ? (
          <Tabs
            value={view}
            onValueChange={(v) => setView(v as "rendered" | "raw")}
            className="flex-1 flex flex-col min-h-0"
          >
            <TabsList className="self-start mb-3">
              <TabsTrigger value="rendered" className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                Rendered
              </TabsTrigger>
              <TabsTrigger value="raw" className="flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5" />
                Raw
              </TabsTrigger>
            </TabsList>

            <TabsContent value="rendered" className="flex-1 min-h-0 mt-0">
              <ScrollArea className="h-full rounded-lg border border-border/50 bg-background/30">
                <article className="prose prose-neutral dark:prose-invert max-w-none p-6 prose-p:leading-relaxed prose-headings:font-semibold prose-pre:bg-muted/50">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                    img: () => null,
                    a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
                  }}>
                    {content}
                  </ReactMarkdown>
                </article>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="raw" className="flex-1 min-h-0 mt-0">
              <ScrollArea className="h-full rounded-lg border border-border/50 bg-background/30">
                <pre className="p-6 text-[14px] leading-relaxed whitespace-pre-wrap font-mono">
                  {content}
                </pre>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        ) : (
          <ScrollArea className="flex-1 rounded-lg border border-border/50 bg-background/30">
            <div className="p-6 min-h-[400px]">
              {isLoading ? <LoadingSkeleton /> : <EmptyState />}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center justify-center py-8">
        <div className="relative">
          <div className="w-14 h-14 border-4 border-primary/20 rounded-full" />
          <div className="absolute top-0 left-0 w-14 h-14 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground animate-pulse-subtle">
          Drafting your content&hellip;
        </p>
      </div>
      <div className="space-y-3 mt-4">
        <Skeleton className="h-4 w-[90%]" />
        <Skeleton className="h-4 w-[95%]" />
        <Skeleton className="h-4 w-[80%]" />
        <Skeleton className="h-4 w-[88%]" />
        <div className="h-2" />
        <Skeleton className="h-4 w-[92%]" />
        <Skeleton className="h-4 w-[85%]" />
        <Skeleton className="h-4 w-[78%]" />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-accent/50 flex items-center justify-center mb-4">
        <Feather className="w-8 h-8 text-muted-foreground" />
      </div>
      <p className="text-muted-foreground font-medium">No content generated yet</p>
      <p className="text-sm text-muted-foreground/70 mt-1 max-w-[280px]">
        Upload your materials and choose a content type to get started.{" "}
        <span className="font-medium">Tip:</span> press{" "}
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono">
          ⌘ Enter
        </kbd>{" "}
        to generate.
      </p>
    </div>
  );
}
