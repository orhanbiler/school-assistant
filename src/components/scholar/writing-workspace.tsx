"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { AppHeader } from "@/components/scholar/app-header";
import { WorkspaceNavigation } from "@/components/scholar/workspace-navigation";
import { FileUpload, type StoredFile } from "@/components/scholar/file-upload";
import { GeneratedOutput } from "@/components/scholar/generated-output";
import { BatchResponses, type BatchResponse } from "@/components/scholar/batch-responses";

import { useLocalStorage } from "@/hooks/use-local-storage";
import { DEFAULT_MODEL } from "@/lib/models";
import { requestDraft, GenerationFailure } from "@/lib/generate-client";
import { MAX_BATCH_POSTS } from "@/lib/request-limits";
import { countWords } from "@/lib/text";
import { getWritingTone, MAX_PAPER_FOCUS_LENGTH, MAX_WRITING_SAMPLE_LENGTH, MAX_WRITER_NOTES_LENGTH, WRITING_TONES, type WritingTone } from "@/lib/writing-prompts";

const STORAGE_KEY = "scholarQuillData.v2";

interface PersistedState {
  context: string;
  additionalInstructions: string;
  pageCount: string;
  paperFocus: string;
  paraphraseOnly: boolean;
  draftParaphraseOnly: boolean;
  previousParaphraseOnly: boolean;
  discussionPost: string;
  generatedContent: string;
  previousDraft: string;
  activeTab: string;
  storedFiles: StoredFile[];
  aiModel: string;
  batchPosts: string;
  writingSample: string;
  writerNotes: string;
  writingTone: WritingTone;
  originalPost: string;
  incomingReply: string;
  recipientName: string;
  recipientRole: "student" | "professor";
  conversationHistory: string;
}

const DEFAULT_STATE: PersistedState = {
  context: "",
  additionalInstructions: "",
  pageCount: "2",
  paperFocus: "",
  paraphraseOnly: true,
  draftParaphraseOnly: false,
  previousParaphraseOnly: false,
  discussionPost: "",
  generatedContent: "",
  previousDraft: "",
  activeTab: "discussion",
  storedFiles: [],
  aiModel: DEFAULT_MODEL,
  batchPosts: "",
  writingSample: "",
  writerNotes: "",
  writingTone: "auto",
  originalPost: "",
  incomingReply: "",
  recipientName: "",
  recipientRole: "student",
  conversationHistory: "",
};

function parseBatchPosts(text: string): { name: string; post: string; recipientName?: string }[] {
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
        recipientName: firstLine.replace(/[,:]/g, "").trim(),
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

export default function WritingWorkspace() {
  const router = useRouter();
  const generateRequest = useCallback(async (formData: FormData) => {
    try { return await requestDraft(formData); }
    catch (error) {
      if (error instanceof GenerationFailure && error.status === 401) router.replace("/login");
      throw error;
    }
  }, [router]);
  const [state, setState, clearStorage, saveStatus] = useLocalStorage<PersistedState>(
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
    paperFocus = "",
    paraphraseOnly = true,
    draftParaphraseOnly = false,
    discussionPost,
    generatedContent,
    previousDraft = "",
    activeTab,
    storedFiles,
    aiModel,
    batchPosts,
    writingSample = "",
    writerNotes = "",
    writingTone = "auto",
    originalPost = "",
    incomingReply = "",
    recipientName = "",
    recipientRole = "student",
    conversationHistory = "",
  } = state;

  const hasMaterial = useMemo(
    () => Boolean(context.trim() || additionalInstructions.trim() || writerNotes.trim()) || storedFiles.length > 0,
    [context, additionalInstructions, writerNotes, storedFiles.length],
  );
  const hasPaperMaterial = hasMaterial || Boolean(paperFocus.trim());

  const buildFormData = useCallback(() => {
    const formData = new FormData();
    formData.append("aiModel", aiModel);
    formData.append("context", context);
    formData.append("additionalInstructions", additionalInstructions);
    formData.append("pageCount", pageCount);
    formData.append("writingSample", writingSample);
    formData.append("writerNotes", writerNotes);
    formData.append("writingTone", writingTone);
    formData.append("fileSources", JSON.stringify(storedFiles.map((sf) => ({
      filename: sf.name,
      sourceUrl: sf.sourceUrl,
      citationDetails: sf.citationDetails,
    }))));
    formData.append("extractedMaterials", JSON.stringify(storedFiles.filter((sf) => sf.text !== undefined).map((sf) => ({
      filename: sf.name, text: sf.text, sourceUrl: sf.sourceUrl, citationDetails: sf.citationDetails, pages: sf.pages,
    }))));
    for (const sf of storedFiles) {
      if (sf.text === undefined) formData.append("files", storedFileToFile(sf));
    }
    return formData;
  }, [aiModel, context, additionalInstructions, pageCount, writingSample, writerNotes, writingTone, storedFiles]);

  const acceptDraft = useCallback((content: string, useParaphrasesOnly = false) => {
    setState((previous) => ({ ...previous, previousDraft: previous.generatedContent, previousParaphraseOnly: previous.draftParaphraseOnly ?? false, generatedContent: content, draftParaphraseOnly: useParaphrasesOnly }));
    requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 1023px)").matches) {
        document.getElementById("draft")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
      }
    });
  }, [setState]);

  const generate = useCallback(
    async (type: "discussion" | "paper" | "response" | "followup") => {
      if (isLoading || isRevising) return;
      setIsLoading(true);

      try {
        const formData = buildFormData();
        formData.append("type", type);
        formData.append("discussionPost", discussionPost);
        if (type === "paper") {
          formData.append("paperFocus", paperFocus);
          formData.append("paraphraseOnly", String(paraphraseOnly));
        }
        if (type === "followup") {
          formData.append("originalPost", originalPost);
          formData.append("incomingReply", incomingReply);
          formData.append("recipientName", recipientName);
          formData.append("recipientRole", recipientRole);
          formData.append("conversationHistory", conversationHistory);
        }

        const data = await generateRequest(formData);

        acceptDraft(data.content, type === "paper" && paraphraseOnly);
        if (type === "discussion") set("originalPost", data.content);
        toast.success("Content generated", {
          description: `${countWords(data.content)} words ready for review`,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to generate content";
        toast.error("Generation failed", { description: msg });
      } finally {
        setIsLoading(false);
      }
    },
    [
      isLoading,
      isRevising,
      buildFormData,
      generateRequest,
      discussionPost,
      paperFocus,
      paraphraseOnly,
      originalPost,
      incomingReply,
      recipientName,
      recipientRole,
      conversationHistory,
      set,
      acceptDraft,
    ],
  );

  const handleRevise = useCallback(async (instructions = "") => {
    if (!generatedContent || isRevising || isLoading) return;
    setIsRevising(true);
    try {
      const formData = buildFormData();
      formData.append("type", "revise");
      formData.append("contentToRevise", generatedContent);
      formData.append("paraphraseOnly", String(draftParaphraseOnly));
      formData.set("additionalInstructions", instructions);
      const data = await generateRequest(formData);
      acceptDraft(data.content, draftParaphraseOnly);
      toast.success("Writing refined");
    } catch (error) {
      toast.error("Could not refine writing", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsRevising(false);
    }
  }, [generatedContent, draftParaphraseOnly, isRevising, isLoading, buildFormData, generateRequest, acceptDraft]);

  const handleBatchGenerate = useCallback(async () => {
    if (isLoading || isRevising) return;
    const posts = parseBatchPosts(batchPosts);
    if (posts.length > MAX_BATCH_POSTS) {
      toast.error(`Process at most ${MAX_BATCH_POSTS} posts at a time.`);
      return;
    }
    if (posts.length === 0) {
      toast.error("No posts to process");
      return;
    }
    setIsLoading(true);
    setBatchResponses([]);
    setBatchProgress({ current: 0, total: posts.length });

    const acc: BatchResponse[] = [];
    let succeeded = 0;
    for (let i = 0; i < posts.length; i++) {
      const { name, post, recipientName } = posts[i];
      setBatchProgress({ current: i + 1, total: posts.length });

      try {
        const formData = buildFormData();
        formData.append("type", "response");
        formData.append("discussionPost", post);
        if (recipientName) formData.append("recipientName", recipientName);

        const data = await generateRequest(formData);
        acc.push({ name, post, response: data.content });
        succeeded++;
      } catch (error) {
        acc.push({
          name,
          post,
          response: `Error: ${error instanceof Error ? error.message : "Failed"}`,
        });
        if (error instanceof GenerationFailure && [401, 403, 429, 503].includes(error.status)) {
          setBatchResponses([...acc]);
          toast.error("Batch paused", { description: error.message });
          break;
        }
      }
      setBatchResponses([...acc]);
    }

    setIsLoading(false);
    setBatchProgress({ current: 0, total: 0 });
    if (succeeded > 0) toast.success(`Generated ${succeeded} of ${posts.length} responses`);
  }, [batchPosts, isLoading, isRevising, buildFormData, generateRequest]);

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
      else if (activeTab === "paper" && hasPaperMaterial) generate("paper");
      else if (activeTab === "response" && discussionPost.trim()) generate("response");
      else if (activeTab === "followup" && originalPost.trim() && incomingReply.trim()) generate("followup");
      else if (activeTab === "batch" && batchPosts.trim()) handleBatchGenerate();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTab, hasMaterial, hasPaperMaterial, discussionPost, originalPost, incomingReply, batchPosts, isLoading, generate, handleBatchGenerate]);

  const onClearAll = () => {
    clearStorage();
    setBatchResponses([]);
    setBatchProgress({ current: 0, total: 0 });
  };

  const batchCount = useMemo(() => parseBatchPosts(batchPosts).length, [batchPosts]);

  return (
    <main className="min-h-dvh bg-pattern">
      <AppHeader
        aiModel={aiModel}
        onModelChange={(v) => set("aiModel", v)}
        onClearAll={onClearAll}
      />

      <WorkspaceNavigation />
      <div className="workspace-container container mx-auto px-3 sm:px-6 py-4 sm:py-8">
        <p role="status" className={`mb-4 text-xs ${saveStatus === "unavailable" ? "text-destructive" : "text-muted-foreground"}`}>
          {saveStatus === "loading" ? "Opening your workspace…" : saveStatus === "saved" ? "Saved on this device" : "Device storage is unavailable. Copy or download your draft before leaving."}
        </p>
        <div className="grid min-w-0 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
          {/* Left Column - Input */}
          <div className="min-w-0 space-y-4 sm:space-y-6 animate-fade-in">
            <Card id="materials" className="workspace-section glass border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Upload className="w-5 h-5 text-primary" />
                  Upload Materials
                </CardTitle>
                <CardDescription>
                  Upload PDF, Word, text, or HTML course materials
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
                  onUpdateCitation={(index, details) => set("storedFiles", storedFiles.map((file, i) => i === index ? { ...file, citationDetails: details } : file))}
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
                    placeholder="Paste lecture notes, assignment instructions, and your own view or examples to include..."
                    className="min-h-[120px] resize-y bg-background/50"
                    value={context}
                    onChange={(e) => set("context", e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card id="writing" className="workspace-section glass border-border/50">
              <CardHeader>
                <CardTitle className="text-xl">Your Voice &amp; Ideas</CardTitle>
                <CardDescription>
                  Give the draft your direction and a voice that fits.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="writer-notes">What I want to say (optional)</Label>
                  <Textarea id="writer-notes" value={writerNotes} maxLength={MAX_WRITER_NOTES_LENGTH} onChange={(event) => set("writerNotes", event.target.value)} className="min-h-28 bg-background/50" placeholder="My main point is… The reason I think this is… A detail or example I want to include is…" aria-describedby="writer-notes-help" />
                  <p id="writer-notes-help" className="text-xs text-muted-foreground">A few rough sentences in your own words help the draft express your reasoning. Include only experiences and facts you want to use.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="writing-tone">Tone</Label>
                  <Select value={writingTone} onValueChange={(value) => set("writingTone", getWritingTone(value))}>
                    <SelectTrigger id="writing-tone" className="w-full bg-background/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WRITING_TONES.map((tone) => (
                        <SelectItem key={tone.id} value={tone.id}>{tone.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="writing-sample">Your writing sample (optional)</Label>
                  <Textarea
                    id="writing-sample"
                    aria-describedby="writing-sample-help"
                    placeholder="Paste a paragraph or two you wrote. Choose something that sounds like you, preferably in a similar format."
                    className="min-h-[120px] resize-y bg-background/50"
                    maxLength={MAX_WRITING_SAMPLE_LENGTH}
                    value={writingSample}
                    onChange={(event) => set("writingSample", event.target.value)}
                  />
                  <p id="writing-sample-help" className="text-xs text-muted-foreground">
                    Around 100–300 words works well. Used as a style reference, not a factual source.
                    Saved on this device and sent to your selected model when you generate or revise.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card id="format" className="workspace-section glass border-border/50 animate-fade-in stagger-2">
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
                  <TabsList aria-label="Writing format" className="grid h-auto w-full grid-cols-3 gap-1 sm:grid-cols-5 mb-4">
                    <TabsTrigger value="discussion" aria-label="Discussion" className="min-w-0 min-h-14 flex flex-col items-center gap-1 px-1 text-xs">
                      <MessageSquare className="w-4 h-4" />
                      <span className="block">Discussion</span>
                    </TabsTrigger>
                    <TabsTrigger value="paper" aria-label="Paper" className="min-w-0 min-h-14 flex flex-col items-center gap-1 px-1 text-xs">
                      <BookOpen className="w-4 h-4" />
                      <span className="block">Paper</span>
                    </TabsTrigger>
                    <TabsTrigger value="response" aria-label="Response" className="min-w-0 min-h-14 flex flex-col items-center gap-1 px-1 text-xs">
                      <Reply className="w-4 h-4" />
                      <span className="block">Response</span>
                    </TabsTrigger>
                    <TabsTrigger value="followup" aria-label="My Thread" className="min-w-0 min-h-14 flex flex-col items-center gap-1 px-1 text-xs">
                      <MessageSquare className="w-4 h-4" />
                      <span className="block">My Thread</span>
                    </TabsTrigger>
                    <TabsTrigger value="batch" aria-label="Batch" className="min-w-0 min-h-14 flex flex-col items-center gap-1 px-1 text-xs">
                      <Users className="w-4 h-4" />
                      <span className="block">Batch</span>
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
                    {!writerNotes.trim() && <p className="text-sm text-muted-foreground">
                      To guide this post with your own view, add your main point and a reason in{" "}
                      <a href="#writing" className="text-primary underline underline-offset-4">Your Voice &amp; Ideas</a>.
                      {" "}A writing sample guides the style; your notes supply what you think.
                    </p>}
                    <GenerateBtn
                      label="Generate Discussion Post"
                      busyLabel="Crafting your post"
                      onClick={() => generate("discussion")}
                      disabled={isLoading || isRevising || !hasMaterial}
                      isLoading={isLoading}
                    />
                  </TabsContent>

                  {/* Paper Tab */}
                  <TabsContent value="paper" className="space-y-4">
                    <TabIntro
                      icon={<BookOpen className="w-5 h-5 text-primary mt-0.5" />}
                      title="Academic Paper"
                      description="Build an essay around your assignment, case, and reasoning"
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
                    <p className="text-xs text-muted-foreground">The estimate covers essay text, excluding references. Your assignment&apos;s length takes precedence. Download saves TXT; arrange the title page, spacing, margins, and references in Word if required.</p>
                    <div className="space-y-2">
                      <Label htmlFor="paper-focus">Specific community, case, or issue (optional)</Label>
                      <Textarea id="paper-focus" value={paperFocus} onChange={(event) => set("paperFocus", event.target.value)} maxLength={MAX_PAPER_FOCUS_LENGTH} className="min-h-28 bg-background/50" placeholder="Name the setting and problem. Add relevant facts or paste the part of an earlier assignment that defines your case." aria-describedby="paper-focus-help" />
                      <p id="paper-focus-help" className="text-xs text-muted-foreground">If the assignment builds on an earlier unit, include that context here or upload it. The draft cannot infer your previous choices. Saved on this device and sent when generating a paper.</p>
                    </div>
                    <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
                      <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-primary" checked={paraphraseOnly} onChange={(event) => set("paraphraseOnly", event.target.checked)} aria-describedby="paraphrase-help" />
                      <span className="space-y-1 text-sm"><span className="block font-medium">Paraphrases only · no direct quotes</span><span id="paraphrase-help" className="block text-xs text-muted-foreground">Keep source citations while explaining ideas in new wording. This requirement stays with the draft during AI editing.</span></span>
                    </label>
                    <InstructionsField
                      id="paper-instructions"
                      label="Assignment requirements (optional)"
                      placeholder="Paste the full assignment questions, required length, source rules, and formatting instructions..."
                      value={additionalInstructions}
                      onChange={(v) => set("additionalInstructions", v)}
                    />
                    <GenerateBtn
                      label="Generate Paper"
                      busyLabel="Writing your paper"
                      onClick={() => generate("paper")}
                      disabled={isLoading || isRevising || !hasPaperMaterial}
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
                      disabled={isLoading || isRevising || !discussionPost.trim()}
                      isLoading={isLoading}
                    />
                  </TabsContent>

                  <TabsContent value="followup" className="space-y-4">
                    <TabIntro
                      icon={<MessageSquare className="w-5 h-5 text-primary mt-0.5" />}
                      title="Replies Under My Discussion Post"
                      description="Continue the conversation when a student or your professor replies to your post."
                    />
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label htmlFor="my-original-post">My original discussion post *</Label>
                        <Button type="button" size="sm" variant="ghost" disabled={!generatedContent || isLoading || isRevising} onClick={() => set("originalPost", generatedContent)}>
                          Use current draft
                        </Button>
                      </div>
                      <Textarea id="my-original-post" value={originalPost} onChange={(event) => set("originalPost", event.target.value)} className="min-h-[140px] bg-background/50" placeholder="Paste the version you posted. New discussion drafts are copied here automatically." />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="recipient-role">Who replied?</Label>
                        <Select value={recipientRole} onValueChange={(value) => set("recipientRole", value === "professor" ? "professor" : "student")}>
                          <SelectTrigger id="recipient-role" className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="student">Another student</SelectItem>
                            <SelectItem value="professor">My professor</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="recipient-name">Their name or title (optional)</Label>
                        <Input id="recipient-name" maxLength={120} value={recipientName} onChange={(event) => set("recipientName", event.target.value)} placeholder="e.g., Maya or Professor Lee" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="incoming-reply">Their reply to me *</Label>
                      <Textarea id="incoming-reply" value={incomingReply} onChange={(event) => set("incomingReply", event.target.value)} className="min-h-[120px] bg-background/50" placeholder="Paste the reply or question you want to answer." />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="thread-history">Earlier replies in this conversation (optional)</Label>
                      <Textarea id="thread-history" value={conversationHistory} onChange={(event) => set("conversationHistory", event.target.value)} className="min-h-[80px] bg-background/50" placeholder="Include earlier messages if needed, labeling who wrote each one." />
                    </div>
                    <InstructionsField id="followup-instructions" value={additionalInstructions} onChange={(value) => set("additionalInstructions", value)} placeholder="What you want to clarify, your answer to their question, or a required word count..." />
                    <GenerateBtn label={recipientRole === "professor" ? "Draft Reply to Professor" : "Draft Reply to Student"} busyLabel="Writing your reply" onClick={() => generate("followup")} disabled={isLoading || isRevising || !originalPost.trim() || !incomingReply.trim()} isLoading={isLoading} />
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
                      disabled={isLoading || isRevising || !batchPosts.trim()}
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
          <div id="draft" className="workspace-section min-w-0 lg:sticky lg:top-[110px] lg:self-start">
            <GeneratedOutput
              content={generatedContent}
              isLoading={isLoading && activeTab !== "batch"}
              isRevising={isRevising}
              reviseDisabled={isLoading}
              onRevise={handleRevise}
              onDownload={handleDownload}
              onEdit={(content) => set("generatedContent", content)}
              canRestore={Boolean(previousDraft)}
              paraphraseOnly={draftParaphraseOnly}
              onRestore={() => setState((previous) => ({ ...previous, generatedContent: previous.previousDraft, previousDraft: previous.generatedContent, draftParaphraseOnly: previous.previousParaphraseOnly ?? false, previousParaphraseOnly: previous.draftParaphraseOnly ?? false }))}
            />
          </div>
        </div>

        <footer className="mt-8 text-center text-sm text-muted-foreground">
          <p>
            Review your ideas, sources, and final wording.{" "}<span className="hidden lg:inline">&middot;{" "}
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono">
              ⌘ Enter
            </kbd>{" "}
            to generate</span>
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
  label = "Special Instructions (Optional)",
  placeholder,
  value,
  onChange,
  minH = "80px",
}: {
  id: string;
  label?: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  minH?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
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
