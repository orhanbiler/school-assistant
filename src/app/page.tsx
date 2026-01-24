"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileText,
  Upload,
  MessageSquare,
  BookOpen,
  Reply,
  Sparkles,
  Copy,
  Check,
  Loader2,
  GraduationCap,
  Feather,
  Link,
  Trash2,
  RotateCcw,
  Users,
} from "lucide-react";

interface StoredFile {
  name: string;
  type: string;
  data: string; // base64
  sourceUrl: string; // reference link for this material
}

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [storedFiles, setStoredFiles] = useState<StoredFile[]>([]);
  const [context, setContext] = useState("");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [pageCount, setPageCount] = useState("2");
  const [discussionPost, setDiscussionPost] = useState("");
  const [generatedContent, setGeneratedContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("discussion");
  const [batchPosts, setBatchPosts] = useState("");
  const [batchResponses, setBatchResponses] = useState<{name: string; post: string; response: string}[]>([]);
  const [batchProgress, setBatchProgress] = useState(0);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [aiModel, setAiModel] = useState("gpt-5.2");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateFileSourceUrl = (index: number, url: string) => {
    const updatedFiles = [...storedFiles];
    updatedFiles[index].sourceUrl = url;
    setStoredFiles(updatedFiles);
  };

  // Load saved data from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem("scholarQuillData");
    if (savedData) {
      try {
        const data = JSON.parse(savedData);
        if (data.context) setContext(data.context);
        if (data.additionalInstructions) setAdditionalInstructions(data.additionalInstructions);
        if (data.pageCount) setPageCount(data.pageCount);
        if (data.discussionPost) setDiscussionPost(data.discussionPost);
        if (data.generatedContent) setGeneratedContent(data.generatedContent);
        if (data.activeTab) setActiveTab(data.activeTab);
        if (data.aiModel) setAiModel(data.aiModel);
        
        // Restore files from stored base64 data
        if (data.storedFiles && data.storedFiles.length > 0) {
          // Ensure each stored file has sourceUrl (for backwards compatibility)
          const filesWithUrls = data.storedFiles.map((sf: StoredFile) => ({
            ...sf,
            sourceUrl: sf.sourceUrl || "",
          }));
          setStoredFiles(filesWithUrls);
          const restoredFiles = filesWithUrls.map((sf: StoredFile) => {
            const byteCharacters = atob(sf.data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            return new File([byteArray], sf.name, { type: sf.type });
          });
          setFiles(restoredFiles);
        }
      } catch (e) {
        console.error("Error loading saved data:", e);
      }
    }
  }, []);

  // Save data to localStorage whenever it changes
  useEffect(() => {
    const dataToSave = {
      context,
      additionalInstructions,
      pageCount,
      discussionPost,
      generatedContent,
      activeTab,
      storedFiles,
      aiModel,
    };
    localStorage.setItem("scholarQuillData", JSON.stringify(dataToSave));
  }, [context, additionalInstructions, pageCount, discussionPost, generatedContent, activeTab, storedFiles, aiModel]);

  // Clear all saved data
  const clearAllData = () => {
    localStorage.removeItem("scholarQuillData");
    setContext("");
    setAdditionalInstructions("");
    setPageCount("2");
    setDiscussionPost("");
    setGeneratedContent("");
    setFiles([]);
    setStoredFiles([]);
    setBatchPosts("");
    setBatchResponses([]);
    setAiModel("gpt-5.2");
  };

  // Parse batch posts - split by "---" or double newlines with a name pattern
  const parseBatchPosts = (text: string): {name: string; post: string}[] => {
    const sections = text.split(/---+/).map(s => s.trim()).filter(s => s.length > 0);
    return sections.map(section => {
      // Try to extract name from first line
      const lines = section.split('\n');
      const firstLine = lines[0].trim();
      // Check if first line looks like a name (short, no punctuation except comma)
      const isNameLine = firstLine.length < 50 && !firstLine.includes('.') && !firstLine.includes('?');
      if (isNameLine && lines.length > 1) {
        return {
          name: firstLine.replace(/[,:]/g, '').trim(),
          post: lines.slice(1).join('\n').trim()
        };
      }
      return {
        name: `Response ${sections.indexOf(section) + 1}`,
        post: section
      };
    });
  };

  // Generate batch responses
  const handleBatchGenerate = async () => {
    const posts = parseBatchPosts(batchPosts);
    if (posts.length === 0) return;

    setIsLoading(true);
    setBatchResponses([]);
    setBatchProgress(0);

    const responses: {name: string; post: string; response: string}[] = [];

    for (let i = 0; i < posts.length; i++) {
      const { name, post } = posts[i];
      setBatchProgress(i + 1);

      try {
        const formData = new FormData();
        formData.append("type", "response");
        formData.append("aiModel", aiModel);
        formData.append("context", context);
        formData.append("additionalInstructions", additionalInstructions);
        formData.append("discussionPost", post);
        
        const fileSources = storedFiles.map(sf => ({
          filename: sf.name,
          sourceUrl: sf.sourceUrl,
        }));
        formData.append("fileSources", JSON.stringify(fileSources));
        
        files.forEach((file) => {
          formData.append("files", file);
        });

        const res = await fetch("/api/generate", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        
        if (!res.ok) {
          responses.push({ name, post, response: `Error: ${data.error}` });
        } else {
          responses.push({ name, post, response: data.content });
        }
      } catch (error) {
        responses.push({ name, post, response: `Error: ${error instanceof Error ? error.message : "Failed"}` });
      }

      // Update responses as we go
      setBatchResponses([...responses]);
    }

    setIsLoading(false);
    setBatchProgress(0);
  };

  // Copy individual batch response
  const copyBatchResponse = async (index: number) => {
    await navigator.clipboard.writeText(batchResponses[index].response);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...newFiles]);
      
      // Convert files to base64 for storage
      const newStoredFiles: StoredFile[] = await Promise.all(
        newFiles.map(async (file) => {
          return new Promise<StoredFile>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = (reader.result as string).split(",")[1];
              resolve({
                name: file.name,
                type: file.type,
                data: base64,
                sourceUrl: "",
              });
            };
            reader.readAsDataURL(file);
          });
        })
      );
      setStoredFiles((prev) => [...prev, ...newStoredFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setStoredFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleGenerate = async (type: string) => {
    setIsLoading(true);
    setGeneratedContent("");

    try {
      const formData = new FormData();
      formData.append("type", type);
      formData.append("aiModel", aiModel);
      formData.append("context", context);
      formData.append("additionalInstructions", additionalInstructions);
      formData.append("pageCount", pageCount);
      formData.append("discussionPost", discussionPost);
      
      // Send file source URLs along with files
      const fileSources = storedFiles.map(sf => ({
        filename: sf.name,
        sourceUrl: sf.sourceUrl,
      }));
      formData.append("fileSources", JSON.stringify(fileSources));
      
      files.forEach((file) => {
        formData.append("files", file);
      });

      const response = await fetch("/api/generate", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to generate content");
      }

      setGeneratedContent(data.content);
    } catch (error) {
      console.error("Generation error:", error);
      setGeneratedContent(
        `Error: ${error instanceof Error ? error.message : "Failed to generate content. Please try again."}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(generatedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="min-h-screen bg-pattern">
      {/* Header */}
      <header className="border-b border-border/50 glass sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Feather className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Scholar&apos;s Quill</h1>
                <p className="text-sm text-muted-foreground">Academic Writing Assistant for Orhan</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="model-select" className="text-sm text-muted-foreground whitespace-nowrap">AI Model:</Label>
                <select
                  id="model-select"
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="gpt-5.2">GPT-5.2 (OpenAI)</option>
                  <option value="gpt-4o">GPT-4o (OpenAI)</option>
                  <option value="gemini-3-pro-preview">Gemini 3 Pro (Google)</option>
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                </select>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={clearAllData}
                className="flex items-center gap-2 text-muted-foreground hover:text-destructive"
              >
                <RotateCcw className="w-4 h-4" />
                Clear All
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left Column - Input */}
          <div className="space-y-6 animate-fade-in">
            {/* Context Upload Card */}
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
                <div
                  className="border-2 border-dashed border-border/70 rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-all duration-300"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.txt,.doc,.docx,.html,.htm"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <FileText className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm font-medium">Drop files here or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Supports PDF, TXT, DOC, DOCX, HTML
                  </p>
                </div>

                {files.length > 0 && (
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Uploaded Materials</Label>
                    
                    {storedFiles.map((storedFile, index) => (
                      <div key={index} className="p-3 rounded-lg border border-border/50 bg-background/30 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-primary" />
                            <span className="text-sm font-medium truncate max-w-[250px]">{storedFile.name}</span>
                          </div>
                          <button
                            onClick={() => removeFile(index)}
                            className="p-1 hover:bg-destructive/20 rounded transition-colors"
                          >
                            <Trash2 className="w-3 h-3 text-muted-foreground" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <Link className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          <Input
                            placeholder="Source link for APA7 reference (optional)"
                            value={storedFile.sourceUrl}
                            onChange={(e) => updateFileSourceUrl(index, e.target.value)}
                            className="bg-background/50 text-sm h-8"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="context" className="text-sm font-medium">
                    Additional Context
                  </Label>
                  <Textarea
                    id="context"
                    placeholder="Paste lecture notes, assignment instructions, or any relevant text here..."
                    className="min-h-[120px] resize-none bg-background/50"
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                  />
                </div>

              </CardContent>
            </Card>

            {/* Generation Options Card */}
            <Card className="glass border-border/50 animate-fade-in stagger-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Sparkles className="w-5 h-5 text-primary" />
                  Generate Content
                </CardTitle>
                <CardDescription>
                  Choose what type of content you need to create
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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

                  <TabsContent value="discussion" className="space-y-4">
                    <div className="p-4 rounded-lg bg-accent/30 border border-border/50">
                      <div className="flex items-start gap-3">
                        <GraduationCap className="w-5 h-5 text-primary mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Discussion Post</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Generate a thoughtful initial discussion post based on your materials
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="disc-instructions">Special Instructions (Optional)</Label>
                      <Textarea
                        id="disc-instructions"
                        placeholder="Any specific requirements, word count, or focus areas..."
                        className="min-h-[80px] resize-none bg-background/50"
                        value={additionalInstructions}
                        onChange={(e) => setAdditionalInstructions(e.target.value)}
                      />
                    </div>
                    <Button
                      onClick={() => handleGenerate("discussion")}
                      disabled={isLoading || (!context && files.length === 0)}
                      className="w-full"
                      size="lg"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Crafting your post...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Generate Discussion Post
                        </>
                      )}
                    </Button>
                  </TabsContent>

                  <TabsContent value="paper" className="space-y-4">
                    <div className="p-4 rounded-lg bg-accent/30 border border-border/50">
                      <div className="flex items-start gap-3">
                        <BookOpen className="w-5 h-5 text-primary mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Academic Paper</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Generate a well-structured paper with proper academic conventions
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="page-count">Page Count</Label>
                        <Input
                          id="page-count"
                          type="number"
                          min="1"
                          max="20"
                          value={pageCount}
                          onChange={(e) => setPageCount(e.target.value)}
                          className="bg-background/50"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground">Estimated Words</Label>
                        <div className="h-9 px-3 flex items-center rounded-md border border-input bg-background/30 text-sm text-muted-foreground">
                          ~{parseInt(pageCount) * 275 || 0} words
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="paper-instructions">Special Instructions (Optional)</Label>
                      <Textarea
                        id="paper-instructions"
                        placeholder="Thesis direction, specific arguments to include, formatting requirements..."
                        className="min-h-[80px] resize-none bg-background/50"
                        value={additionalInstructions}
                        onChange={(e) => setAdditionalInstructions(e.target.value)}
                      />
                    </div>
                    <Button
                      onClick={() => handleGenerate("paper")}
                      disabled={isLoading || (!context && files.length === 0)}
                      className="w-full"
                      size="lg"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Writing your paper...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Generate Paper
                        </>
                      )}
                    </Button>
                  </TabsContent>

                  <TabsContent value="response" className="space-y-4">
                    <div className="p-4 rounded-lg bg-accent/30 border border-border/50">
                      <div className="flex items-start gap-3">
                        <Reply className="w-5 h-5 text-primary mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Discussion Response</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Generate a thoughtful reply to a classmate&apos;s post
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="original-post">Classmate&apos;s Post *</Label>
                      <Textarea
                        id="original-post"
                        placeholder="Paste the discussion post you want to respond to..."
                        className="min-h-[120px] resize-none bg-background/50"
                        value={discussionPost}
                        onChange={(e) => setDiscussionPost(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="response-instructions">Special Instructions (Optional)</Label>
                      <Textarea
                        id="response-instructions"
                        placeholder="Specific points to address, tone preferences..."
                        className="min-h-[80px] resize-none bg-background/50"
                        value={additionalInstructions}
                        onChange={(e) => setAdditionalInstructions(e.target.value)}
                      />
                    </div>
                    <Button
                      onClick={() => handleGenerate("response")}
                      disabled={isLoading || !discussionPost}
                      className="w-full"
                      size="lg"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Crafting your response...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Generate Response
                        </>
                      )}
                    </Button>
                  </TabsContent>

                  <TabsContent value="batch" className="space-y-4">
                    <div className="p-4 rounded-lg bg-accent/30 border border-border/50">
                      <div className="flex items-start gap-3">
                        <Users className="w-5 h-5 text-primary mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Batch Responses</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Generate replies to multiple classmates at once
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="batch-posts">Paste All Posts (separate with ---)</Label>
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
                        className="min-h-[200px] resize-none bg-background/50 font-mono text-sm"
                        value={batchPosts}
                        onChange={(e) => setBatchPosts(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Put each person&apos;s name on the first line, then their post. Separate posts with ---
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="batch-instructions">Special Instructions (Optional)</Label>
                      <Textarea
                        id="batch-instructions"
                        placeholder="Context about your original post, tone preferences..."
                        className="min-h-[60px] resize-none bg-background/50"
                        value={additionalInstructions}
                        onChange={(e) => setAdditionalInstructions(e.target.value)}
                      />
                    </div>
                    <Button
                      onClick={handleBatchGenerate}
                      disabled={isLoading || !batchPosts.trim()}
                      className="w-full"
                      size="lg"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Generating {batchProgress} of {parseBatchPosts(batchPosts).length}...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Generate All Responses ({parseBatchPosts(batchPosts).length})
                        </>
                      )}
                    </Button>

                    {batchResponses.length > 0 && (
                      <div className="space-y-3 mt-4">
                        <Separator />
                        <Label className="text-sm font-medium">Generated Responses</Label>
                        {batchResponses.map((item, index) => (
                          <div key={index} className="p-3 rounded-lg border border-border/50 bg-background/30 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-primary">{item.name}</span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => copyBatchResponse(index)}
                                className="h-7 text-xs"
                              >
                                {copiedIndex === index ? (
                                  <>
                                    <Check className="w-3 h-3 mr-1" />
                                    Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3 mr-1" />
                                    Copy
                                  </>
                                )}
                              </Button>
                            </div>
                            <div className="text-xs text-muted-foreground line-clamp-2 italic">
                              &quot;{item.post.substring(0, 100)}...&quot;
                            </div>
                            <div className="text-sm whitespace-pre-wrap bg-background/50 p-3 rounded border">
                              {item.response}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Output */}
          <div className="animate-fade-in stagger-3">
            <Card className="glass border-border/50 h-full flex flex-col">
              <CardHeader className="flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <Feather className="w-5 h-5 text-primary" />
                      Generated Content
                    </CardTitle>
                    <CardDescription>
                      Your authentic, human-like content will appear here
                    </CardDescription>
                  </div>
                  {generatedContent && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copyToClipboard}
                      className="flex items-center gap-2"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col min-h-0">
                <ScrollArea className="flex-1 rounded-lg border border-border/50 bg-background/30">
                  <div className="p-6 min-h-[400px]">
                    {isLoading ? (
                      <div className="flex flex-col items-center justify-center h-full py-20">
                        <div className="relative">
                          <div className="w-16 h-16 border-4 border-primary/20 rounded-full" />
                          <div className="absolute top-0 left-0 w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                        <p className="mt-6 text-sm text-muted-foreground animate-pulse-subtle">
                          Crafting authentic content...
                        </p>
                      </div>
                    ) : generatedContent ? (
                      <div className="prose prose-neutral dark:prose-invert max-w-none">
                        <div className="whitespace-pre-wrap text-[15px] leading-relaxed">
                          {generatedContent}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full py-20 text-center">
                        <div className="w-16 h-16 rounded-full bg-accent/50 flex items-center justify-center mb-4">
                          <Feather className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <p className="text-muted-foreground font-medium">No content generated yet</p>
                        <p className="text-sm text-muted-foreground/70 mt-1 max-w-[250px]">
                          Upload your materials and choose a content type to get started
                        </p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 text-center text-sm text-muted-foreground">
          <p>Crafted with care for authentic academic expression</p>
        </footer>
      </div>
    </main>
  );
}
