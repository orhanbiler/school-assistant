import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { DEFAULT_MODEL, findModel } from "@/lib/models";
import { createRequestAuth } from "@/lib/server/supabase";
import { getAccessConfig } from "@/lib/server/access-config";
import { isSameOriginRequest } from "@/lib/server/authorization";
import { readExtractedMaterials } from "@/lib/server/extracted-materials";
import { readGenerationForm, RequestError } from "@/lib/server/request-body";
import { getMaxOutputTokens, reserveGeneration, UsageError } from "@/lib/server/usage-limits";
import { MAX_FILES, MAX_FILE_BYTES, MAX_PROMPT_BYTES, PROVIDER_TIMEOUT_MS } from "@/lib/request-limits";
import {
  buildWritingPrompts,
  getWritingTone,
  isGenerationType,
  MAX_WRITING_SAMPLE_LENGTH,
  splitReferenceSection,
} from "@/lib/writing-prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 75;

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private");
  headers.set("Vary", "Cookie");
  return NextResponse.json(data, { ...init, headers });
}

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: PROVIDER_TIMEOUT_MS });
  }
  return _openai;
}

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set");
    }
    _gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return _gemini;
}

interface FileSource {
  filename: string;
  sourceUrl: string;
}

function textField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function POST(request: NextRequest) {
  if (!getAccessConfig().ready) return json({ error: "Private access is not configured. Generation is locked." }, { status: 503 });
  const auth = createRequestAuth(request);
  return auth.applyCookies(await generate(request, auth));
}

async function generate(request: Request, auth: ReturnType<typeof createRequestAuth>) {
  let release: (() => Promise<void>) | undefined;
  try {
    if (!getAccessConfig().ready) return json({ error: "Private access is not configured. Generation is locked." }, { status: 503 });
    if (!(await auth.hasOwnerSession())) return json({ error: "Sign in with the owner's approved account to continue." }, { status: 401 });
    if (!isSameOriginRequest(request)) return json({ error: "This request is not allowed." }, { status: 403 });
    const formData = await readGenerationForm(request);
    const type = textField(formData, "type");
    if (!isGenerationType(type)) {
      return json({ error: "Invalid generation type" }, { status: 400 });
    }

    const aiModel = textField(formData, "aiModel") || DEFAULT_MODEL;
    if (!findModel(aiModel)) {
      return json({ error: "Please select a supported model." }, { status: 400 });
    }

    const context = textField(formData, "context");
    const allowedModels = process.env.AI_ALLOWED_MODELS?.split(",").map((value) => value.trim()).filter(Boolean);
    if (allowedModels && !allowedModels.includes(aiModel)) return json({ error: "This model is disabled by the owner." }, { status: 403 });
    const additionalInstructions = textField(formData, "additionalInstructions");
    const discussionPost = textField(formData, "discussionPost");
    const contentToRevise = textField(formData, "contentToRevise");
    const writingSample = textField(formData, "writingSample");
    const writerNotes = textField(formData, "writerNotes");
    const originalPost = textField(formData, "originalPost");
    const incomingReply = textField(formData, "incomingReply");
    const recipientRole = textField(formData, "recipientRole") || "student";
    if (type === "followup" && (!originalPost.trim() || !incomingReply.trim())) return json({ error: "Add your original post and the reply you want to answer." }, { status: 400 });
    if (type === "followup" && !["student", "professor"].includes(recipientRole)) return json({ error: "Choose whether a student or your professor replied." }, { status: 400 });
    if (writingSample.length > MAX_WRITING_SAMPLE_LENGTH) {
      return json(
        { error: `Please keep your writing sample under ${MAX_WRITING_SAMPLE_LENGTH.toLocaleString()} characters.` },
        { status: 400 },
      );
    }
    if (type === "response" && !discussionPost.trim()) {
      return json({ error: "Paste a classmate's post to reply to." }, { status: 400 });
    }
    if (type === "revise" && !contentToRevise.trim()) {
      return json({ error: "Add a draft to revise." }, { status: 400 });
    }
    if (type === "revise" && !splitReferenceSection(contentToRevise).body.trim()) {
      return json({ error: "Add draft text before the reference list to revise." }, { status: 400 });
    }

    let fileSources: FileSource[] = [];
    try {
      const parsed: unknown = JSON.parse(textField(formData, "fileSources") || "[]");
      if (Array.isArray(parsed)) {
        fileSources = parsed.filter((source): source is FileSource =>
          source !== null && typeof source === "object" &&
          typeof source.filename === "string" && typeof source.sourceUrl === "string",
        );
      }
    } catch {
      // Source URLs are optional; malformed metadata must not discard readable text.
    }

    const materials = readExtractedMaterials(textField(formData, "extractedMaterials"));
    const files = formData.getAll("files");
    if (files.length + materials.length > MAX_FILES) return json({ error: `Upload at most ${MAX_FILES} files.` }, { status: 413 });
    for (const file of files) {
      if (typeof file === "string") {
        return json({ error: "Invalid uploaded file." }, { status: 400 });
      }
      if (file.size > MAX_FILE_BYTES || file.name.length > 255) {
        return json({ error: "An upload is too large. Use a short excerpt in a TXT or HTML file under 128 KB." }, { status: 413 });
      }
      const isText = /\.txt$/i.test(file.name);
      const isHtml = /\.html?$/i.test(file.name);
      if (!isText && !isHtml) {
        return json(
          { error: `Use the app's file picker to read ${file.name} first. Only selected document text can be submitted for generation.` },
          { status: 400 },
        );
      }

      let text = await file.text();
      if (isHtml) {
        text = text
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\s+/g, " ");
      }
      if (!text.trim()) {
        return json(
          { error: `${file.name} contains no readable text. Paste the relevant text into Additional Context.` },
          { status: 400 },
        );
      }
      materials.push({
        filename: file.name,
        text: text.trim(),
        sourceUrl: fileSources.find((source) => source.filename === file.name)?.sourceUrl.trim() || undefined,
      });
    }

    if ((type === "discussion" || type === "paper") &&
        !context.trim() && !additionalInstructions.trim() && !writerNotes.trim() && materials.length === 0) {
      return json({ error: "Add a topic, instructions, or source material first." }, { status: 400 });
    }

    const { systemPrompt, userPrompt, references } = buildWritingPrompts({
      type,
      context,
      additionalInstructions,
      pageCount: textField(formData, "pageCount"),
      discussionPost,
      recipientName: textField(formData, "recipientName"),
      recipientRole: recipientRole === "professor" ? "professor" : "student",
      originalPost,
      incomingReply,
      conversationHistory: textField(formData, "conversationHistory"),
      contentToRevise,
      writingSample,
      writerNotes,
      writingTone: getWritingTone(textField(formData, "writingTone")),
      materials,
    });

    if (Buffer.byteLength(systemPrompt + userPrompt, "utf8") > MAX_PROMPT_BYTES) {
      return json({ error: "There is too much material for one draft. Keep only the relevant excerpts and shorten the context." }, { status: 413 });
    }
    if (!(aiModel.startsWith("gemini") ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY)) {
      return json({ error: "The selected model is not configured. Contact the owner." }, { status: 503 });
    }
    const maxOutputTokens = getMaxOutputTokens(type);
    release = await reserveGeneration();

    let generatedContent: string;
    if (aiModel.startsWith("gemini")) {
      const model = getGemini().getGenerativeModel({ model: aiModel, systemInstruction: systemPrompt, generationConfig: { maxOutputTokens } });
      const result = await model.generateContent(userPrompt, { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
      const response = await result.response;
      if (response.candidates?.[0]?.finishReason === "MAX_TOKENS") {
        return json({ error: "The draft was cut off. Try a shorter requested length." }, { status: 502 });
      }
      generatedContent = response.text();
    } else {
      const response = await getOpenAI().responses.create({
        model: aiModel,
        max_output_tokens: maxOutputTokens,
        store: false,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });
      if (response.status === "incomplete") {
        return json({ error: "The draft was incomplete. Try again with a shorter requested length." }, { status: 502 });
      }
      generatedContent = response.output_text;
    }

    // Discard any reference list the editor unexpectedly recreated.
    if (type === "revise") generatedContent = splitReferenceSection(generatedContent || "").body;
    if (!generatedContent?.trim()) {
      return json({ error: "The model returned no draft. Please try again." }, { status: 502 });
    }

    return json({ content: generatedContent.trim() + references, type });
  } catch (error) {
    if (error instanceof RequestError || error instanceof UsageError) {
      const headers = error instanceof UsageError && error.retryAfter ? { "Retry-After": String(error.retryAfter) } : undefined;
      return json({ error: error.message }, { status: error.status, headers });
    }
    // Provider errors can include request details or credentials; never expose them.
    console.error("Generation request failed.");
    return json({ error: "The draft could not be generated. Please try again later." }, { status: 502 });
  } finally {
    await release?.();
  }
}
