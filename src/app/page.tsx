"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  GraduationCap,
  Loader2,
  MessageSquare,
  Reply,
  Sparkles,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";

import { AppHeader } from "@/components/scholar/app-header";
import { FileUpload, type StoredFile } from "@/components/scholar/file-upload";
import { GeneratedOutput } from "@/components/scholar/generated-output";
import { BatchResponses, type BatchResponse } from "@/components/scholar/batch-responses";

import { useLocalStorage } from "@/hooks/use-local-storage";
import { DEFAULT_MODEL } from "@/lib/models";
import { countWords } from "@/lib/text";

const STORAGE_KEY = "scholarQuillData.v2";

interface PersistedState {
  context: string;
  additionalInstructions: string;
  pageCount: string;
  discussionPost: string;
  generatedContent: string;
  activeTab: string;
  storedFiles: StoredFile[];
  aiModel: string;
  batchPosts: string;
}

const DEFAULT_STATE: PersistedState = {
  context: "",
  additionalInstructions: "",
  pageCount: "2",
  discussionPost: "",
  generatedContent: "",
  activeTab: "discussion",
  storedFiles: [],
  aiModel: DEFAULT_MODEL,
  batchPosts: "",
};

function parseBatchPosts(text: string): { name: string; post: string }[] {
  const sections = text
    .split(/---+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return sections.map((section, i) => {
    const lines = section.split("\n");
    const firstLine = lines[0].trim();
    const isNameLine =
      firstLine.length < 50 && !firstLine.includes(".") && !firstLine.includes("?");
    if (isNameLine && lines.length > 1) {
      return {
        name: firstLine.replace(/[,:]/g, "").trim(),
        post: lines.slice(1).join("\n").trim(),
      };
    }
    return { name: `Response ${i + 1}`, post: section };
  });
}

function storedFileToFile(sf: StoredFile): File {
  const byteCharacters = atob(sf.data);
  const arr = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) arr[i] = byteCharacters.charCodeAt(i);
  return new File([arr], sf.name, { type: sf.type });
}

export default function Home() {
  const [state, setState, clearStorage] = useLocalStorage<PersistedState>(
    STORAGE_KEY,
    DEFAULT_STATE,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isRevising, setIsRevising] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0,
  });
  const [batchResponses, setBatchResponses] = useState<BatchResponse[]>([]);

  const set = useCallback(
    <K extends keyof PersistedState>(key: K, value: PersistedState[K]) => {
      setState((prev) => ({ ...prev, [key]: value }));
    },
    [setState],
  );

  const {
    context,
    additionalInstructions,
    pageCount,
    discussionPost,
    generatedContent,
    activeTab,
    storedFiles,
    aiModel,
    batchPosts,
  } = state;

  const hasMaterial = useMemo(
    () => Boolean(context.trim()) || storedFiles.length > 0,
    [context, storedFiles.length],
  );

  const generate = useCallback(
    async (type: "discussion" | "paper" | "response") => {
      if (isLoading) return;
      setIsLoading(true);
      set("generatedContent", "");

      try {
        const formData = new FormData();
        formData.append("type", type);
        formData.append("aiModel", aiModel);
        formData.append("context", context);
        formData.append("additionalInstructions", additionalInstructions);
        formData.append("pageCount", pageCount);
        formData.append("discussionPost", discussionPost);

        const fileSources = storedFiles.map((sf) => ({
          filename: sf.name,
          sourceUrl: sf.sourceUrl,
        }));
        formData.append("fileSources", JSON.stringify(fileSources));

        for (const sf of storedFiles) {
          formData.append("files", storedFileToFile(sf));
        }

        const response = await fetch("/api/generate", { method: "POST", body: formData });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to generate");

        set("generatedContent", data.content);
        toast.success("Content generated", {
          description: `${countWords(data.content)} words ready for review`,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to generate content";
        toast.error("Generation failed", { description: msg });
        set("generatedContent", `Error: ${msg}`);
      } finally {
        setIsLoading(false);
      }
    },
    [
      isLoading,
      aiModel,
      context,
      additionalInstructions,
      pageCount,
      discussionPost,
      storedFiles,
      set,
    ],
  );

  const handleRevise = useCallback(async () => {
    if (!generatedContent || isRevising) return;
    setIsRevising(true);
    try {
      const formData = new FormData();
      formData.append("type", "revise");
      formData.append("aiModel", aiModel);
      formData.append("contentToRevise", generatedContent);
      const response = await fetch("/api/generate", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to revise");
      set("generatedContent", data.content);
      toast.success("Content humanized");
    } catch (error) {
      toast.error("Could not humanize", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsRevising(false);
    }
  }, [generatedContent, isRevising, aiModel, set]);

  const handleBatchGenerate = useCallback(async () => {
    const posts = parseBatchPosts(batchPosts);
    if (posts.length === 0) {
      toast.error("No posts to process");
      return;
    }
    setIsLoading(true);
    setBatchResponses([]);
    setBatchProgress({ current: 0, total: posts.length });

    const acc: BatchResponse[] = [];
    for (let i = 0; i < posts.length; i++) {
      const { name, post } = posts[i];
      setBatchProgress({ current: i + 1, total: posts.length });

      try {
        const formData = new FormData();
        formData.append("type", "response");
        formData.append("aiModel", aiModel);
        formData.append("context", context);
        formData.append("additionalInstructions", additionalInstructions);
        formData.append("discussionPost", post);
        const fileSources = storedFiles.map((sf) => ({
          filename: sf.name,
          sourceUrl: sf.sourceUrl,
        }));
        formData.append("fileSources", JSON.stringify(fileSources));
        for (const sf of storedFiles) {
          formData.append("files", storedFileToFile(sf));
        }

        const res = await fetch("/api/generate", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) {
          acc.push({ name, post, response: `Error: ${data.error}` });
        } else {
          acc.push({ name, post, response: data.content });
        }
      } catch (error) {
        acc.push({
          name,
          post,
          response: `Error: ${error instanceof Error ? error.message : "Failed"}`,
        });
      }
      setBatchResponses([...acc]);
    }

    setIsLoading(false);
    setBatchProgress({ current: 0, total: 0 });
    toast.success(`Generated ${posts.length} response${posts.length === 1 ? "" : "s"}`);
  }, [batchPosts, aiModel, context, additionalInstructions, storedFiles]);

  const handleDownload = useCallback(() => {
    if (!generatedContent) return;
    const blob = new Blob([generatedContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `scholars-quill-${activeTab}-${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Downloaded");
  }, [generatedContent, activeTab]);

  // Cmd/Ctrl + Enter to generate the active tab
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmd = e.metaKey || e.ctrlKey;
      if (!cmd || e.key !== "Enter") return;
      e.preventDefault();
      if (isLoading) return;
      if (activeTab === "discussion" && hasMaterial) generate("discussion");
      else if (activeTab === "paper" && hasMaterial) generate("paper");
      else if (activeTab === "response" && discussionPost.trim()) generate("response");
      else if (activeTab === "batch" && batchPosts.trim()) handleBatchGenerate();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTab, hasMaterial, discussionPost, batchPosts, isLoading, generate, handleBatchGenerate]);

  const onClearAll = () => {
    clearStorage();
    setBatchResponses([]);
    setBatchProgress({ current: 0, total: 0 });
  };

  const batchCount = useMemo(() => parseBatchPosts(batchPosts).length, [batchPosts]);

  return (
    <main className="min-h-screen bg-pattern">
      <AppHeader
        aiModel={aiModel}
        onModelChange={(v) => set("aiModel", v)}
        onClearAll={onClearAll}
      />

      <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="grid lg:grid-cols-2 gap-6 lg:gap-8">
          {/* Left Column - Input */}
          <div className="space-y-6 animate-fade-in">
            <Card className="glass border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Upload className="w-5 h-5 text-primary" />
                  Upload Materials
                </CardTitle>
                <CardDescription>
                  Add PDFs, documents, or course materials to provide context
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FileUpload
                  storedFiles={storedFiles}
                  onAdd={(files) => set("storedFiles", [...storedFiles, ...files])}
                  onRemove={(index) =>
                    set(
                      "storedFiles",
                      storedFiles.filter((_, i) => i !== index),
                    )
                  }
                  onUpdateSource={(index, url) => {
                    const next = storedFiles.map((sf, i) =>
                      i === index ? { ...sf, sourceUrl: url } : sf,
                    );
                    set("storedFiles", next);
                  }}
                />

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="context" className="text-sm font-medium">
                      Additional Context
                    </Label>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {countWords(context).toLocaleString()} words
                    </span>
                  </div>
                  <Textarea
                    id="context"
                    placeholder="Paste lecture notes, assignment instructions, or any relevant text here..."
                    className="min-h-[120px] resize-y bg-background/50"
                    value={context}
                    onChange={(e) => set("context", e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="glass border-border/50 animate-fade-in stagger-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Sparkles className="w-5 h-5 text-primary" />
                  Generate Content
                </CardTitle>
                <CardDescription>Choose what type of content you need to create</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs
                  value={activeTab}
                  onValueChange={(v) => set("activeTab", v)}
                  className="w-full"
                >
                  <TabsList className="grid w-full grid-cols-4 mb-6">
                    <TabsTrigger value="discussion" className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      <span className="hidden sm:inline">Discussion</span>
                    </TabsTrigger>
                    <TabsTrigger value="paper" className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      <span className="hidden sm:inline">Paper</span>
                    </TabsTrigger>
                    <TabsTrigger value="response" className="flex items-center gap-2">
                      <Reply className="w-4 h-4" />
                      <span className="hidden sm:inline">Response</span>
                    </TabsTrigger>
                    <TabsTrigger value="batch" className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      <span className="hidden sm:inline">Batch</span>
                    </TabsTrigger>
                  </TabsList>

                  {/* Discussion Tab */}
                  <TabsContent value="discussion" className="space-y-4">
                    <TabIntro
                      icon={<GraduationCap className="w-5 h-5 text-primary mt-0.5" />}
                      title="Discussion Post"
                      description="Generate a thoughtful initial discussion post based on your materials"
                    />
                    <InstructionsField
                      id="disc-instructions"
                      placeholder="Any specific requirements, word count, or focus areas..."
                      value={additionalInstructions}
                      onChange={(v) => set("additionalInstructions", v)}
                    />
                    <GenerateBtn
                      label="Generate Discussion Post"
                      busyLabel="Crafting your post"
                      onClick={() => generate("discussion")}
                      disabled={isLoading || !hasMaterial}
                      isLoading={isLoading}
                    />
                  </TabsContent>

                  {/* Paper Tab */}
                  <TabsContent value="paper" className="space-y-4">
                    <TabIntro
                      icon={<BookOpen className="w-5 h-5 text-primary mt-0.5" />}
                      title="Academic Paper"
                      description="Generate a well-structured paper with proper academic conventions"
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="page-count">Page Count</Label>
                        <Input
                          id="page-count"
                          type="number"
                          min="1"
                          max="20"
                          value={pageCount}
                          onChange={(e) => set("pageCount", e.target.value)}
                          className="bg-background/50"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Estimated Words</Label>
                        <div className="h-9 px-3 flex items-center rounded-md border border-input bg-background/30 text-sm text-muted-foreground tabular-nums">
                          ~{(parseInt(pageCount) || 0) * 275} words
                        </div>
                      </div>
                    </div>
                    <InstructionsField
                      id="paper-instructions"
                      placeholder="Thesis direction, specific arguments to include, formatting requirements..."
                      value={additionalInstructions}
                      onChange={(v) => set("additionalInstructions", v)}
                    />
                    <GenerateBtn
                      label="Generate Paper"
                      busyLabel="Writing your paper"
                      onClick={() => generate("paper")}
                      disabled={isLoading || !hasMaterial}
                      isLoading={isLoading}
                    />
                  </TabsContent>

                  {/* Response Tab */}
                  <TabsContent value="response" className="space-y-4">
                    <TabIntro
                      icon={<Reply className="w-5 h-5 text-primary mt-0.5" />}
                      title="Discussion Response"
                      description="Generate a thoughtful reply to a classmate's post"
                    />
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="original-post">Classmate&apos;s Post *</Label>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {countWords(discussionPost).toLocaleString()} words
                        </span>
                      </div>
                      <Textarea
                        id="original-post"
                        placeholder="Paste the discussion post you want to respond to..."
                        className="min-h-[120px] resize-y bg-background/50"
                        value={discussionPost}
                        onChange={(e) => set("discussionPost", e.target.value)}
                      />
                    </div>
                    <InstructionsField
                      id="response-instructions"
                      placeholder="Specific points to address, tone preferences..."
                      value={additionalInstructions}
                      onChange={(v) => set("additionalInstructions", v)}
                    />
                    <GenerateBtn
                      label="Generate Response"
                      busyLabel="Crafting your response"
                      onClick={() => generate("response")}
                      disabled={isLoading || !discussionPost.trim()}
                      isLoading={isLoading}
                    />
                  </TabsContent>

                  {/* Batch Tab */}
                  <TabsContent value="batch" className="space-y-4">
                    <TabIntro
                      icon={<Users className="w-5 h-5 text-primary mt-0.5" />}
                      title="Batch Responses"
                      description="Generate replies to multiple classmates at once"
                    />
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="batch-posts">Paste All Posts (separate with ---)</Label>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {batchCount} {batchCount === 1 ? "post" : "posts"}
                        </span>
                      </div>
                      <Textarea
                        id="batch-posts"
                        placeholder={`Prof. Read
Your point about evidence preservation...
---
Syron Mckenzie
Your report shows a clear effort...
---
Greg Pilkerton
Your report is well written...`}
                        className="min-h-[200px] resize-y bg-background/50 font-mono text-sm"
                        value={batchPosts}
                        onChange={(e) => set("batchPosts", e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Put each person&apos;s name on the first line, then their post. Separate
                        posts with <code className="font-mono">---</code>.
                      </p>
                    </div>
                    <InstructionsField
                      id="batch-instructions"
                      placeholder="Context about your original post, tone preferences..."
                      value={additionalInstructions}
                      onChange={(v) => set("additionalInstructions", v)}
                      minH="60px"
                    />
                    {isLoading && batchProgress.total > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                          <span>
                            Generating {batchProgress.current} of {batchProgress.total}
                          </span>
                          <span>
                            {Math.round((batchProgress.current / batchProgress.total) * 100)}%
                          </span>
                        </div>
                        <Progress
                          value={(batchProgress.current / batchProgress.total) * 100}
                        />
                      </div>
                    )}
                    <Button
                      onClick={handleBatchGenerate}
                      disabled={isLoading || !batchPosts.trim()}
                      className="w-full"
                      size="lg"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Generating {batchProgress.current} of {batchProgress.total}
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Generate All Responses ({batchCount})
                        </>
                      )}
                    </Button>
                    <BatchResponses responses={batchResponses} />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Output */}
          <div className="lg:sticky lg:top-[100px] lg:self-start lg:max-h-[calc(100vh-120px)]">
            <GeneratedOutput
              content={generatedContent}
              isLoading={isLoading && activeTab !== "batch"}
              isRevising={isRevising}
              onRevise={handleRevise}
              onDownload={handleDownload}
            />
          </div>
        </div>

        <footer className="mt-12 text-center text-sm text-muted-foreground">
          <p>
            Crafted with care for authentic academic expression &middot;{" "}
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono">
              ⌘ Enter
            </kbd>{" "}
            to generate
          </p>
        </footer>
      </div>
    </main>
  );
}

function TabIntro({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-4 rounded-lg bg-accent/30 border border-border/50">
      <div className="flex items-start gap-3">
        {icon}
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
      </div>
    </div>
  );
}

function InstructionsField({
  id,
  placeholder,
  value,
  onChange,
  minH = "80px",
}: {
  id: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  minH?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Special Instructions (Optional)</Label>
      <Textarea
        id={id}
        placeholder={placeholder}
        className="resize-y bg-background/50"
        style={{ minHeight: minH }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function GenerateBtn({
  label,
  busyLabel,
  onClick,
  disabled,
  isLoading,
}: {
  label: string;
  busyLabel: string;
  onClick: () => void;
  disabled: boolean;
  isLoading: boolean;
}) {
  return (
    <Button onClick={onClick} disabled={disabled} className="w-full" size="lg">
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          {busyLabel}&hellip;
        </>
      ) : (
        <>
          <Sparkles className="w-4 h-4 mr-2" />
          {label}
        </>
      )}
    </Button>
  );
}
