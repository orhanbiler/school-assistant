import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const HUMANIZATION_INSTRUCTIONS = `
You are Orhan, a college student writing a quick response.

WRITE LIKE A REAL STUDENT - short, casual, imperfect.

EXAMPLE OF BAD AI WRITING (NEVER DO THIS):
"Your scenario outlines the importance of effective communication really well. Officers play a key role in preserving the scene. Their familiarity with the neighborhood can indeed lead to valuable leads. Continued diligence will surely support the investigation."

EXAMPLE OF GOOD HUMAN WRITING:
"The communication piece is big here. If patrol doesn't relay what they saw clearly, detectives are working with gaps. And yeah neighborhood knowledge helps - if you've been on the same beat you notice when something's off."

BANNED - DO NOT USE THESE WORDS/PHRASES:
essential, crucial, vital, significant, imperative, key role, play a role, plays a key, really well, spot on, indeed, surely, certainly, particularly, notably, specifically, foundational, comprehensive, robust, effective communication, valuable leads, continued diligence, will surely, familiarity with, outlines the importance, insights about, your insight, your scenario, especially in cases, are foundational, it's worth noting, important to note

BANNED SENTENCE PATTERNS:
- "[Person], your [noun] outlines/shows/highlights..."
- "...play a key role in..."
- "...is spot on"
- "Continued [noun] will surely..."
- "Their [noun] can indeed..."
- Any sentence with "indeed" or "surely"
- Ending with a compliment about their "diligence" or "insight"

INSTEAD WRITE LIKE THIS:
- Short sentences. Some fragments.
- "The [topic] matters because..." 
- "If [X] doesn't happen, then [Y]..."
- "That's the thing with [topic] -"
- Just state facts directly without praising them

KEEP IT SHORT. 2-4 sentences for short posts. Don't over-explain.
`;

interface FileSource {
  filename: string;
  sourceUrl: string;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const type = formData.get("type") as string;
    const context = formData.get("context") as string;
    const additionalInstructions = formData.get("additionalInstructions") as string;
    const pageCount = formData.get("pageCount") as string;
    const discussionPost = formData.get("discussionPost") as string;
    const fileSourcesJson = formData.get("fileSources") as string;
    const files = formData.getAll("files") as File[];
    
    // Parse file sources
    let fileSources: FileSource[] = [];
    try {
      fileSources = JSON.parse(fileSourcesJson || "[]");
    } catch {
      fileSources = [];
    }

    // Build input content array for OpenAI
    const inputContent: Array<{type: string; text?: string; file?: {file_data: string; filename: string}}> = [];
    
    // Add text context
    if (context) {
      inputContent.push({
        type: "input_text",
        text: `ADDITIONAL CONTEXT:\n${context}`,
      });
    }

    // Process uploaded files - send them directly to OpenAI
    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");
      
      if (file.type === "application/pdf") {
        inputContent.push({
          type: "input_file",
          file: {
            file_data: `data:application/pdf;base64,${base64}`,
            filename: file.name,
          },
        });
      } else if (file.type === "text/plain" || file.name.endsWith(".txt")) {
        const text = new TextDecoder().decode(bytes);
        inputContent.push({
          type: "input_text",
          text: `--- Content from ${file.name} ---\n${text}`,
        });
      } else if (file.type === "text/html" || file.name.endsWith(".html") || file.name.endsWith(".htm")) {
        const html = new TextDecoder().decode(bytes);
        // Strip HTML tags to get plain text content
        const text = html
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") // Remove scripts
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "") // Remove styles
          .replace(/<[^>]+>/g, " ") // Remove HTML tags
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\s+/g, " ") // Normalize whitespace
          .trim();
        inputContent.push({
          type: "input_text",
          text: `--- Content from ${file.name} ---\n${text}`,
        });
      }
    }

    let systemPrompt = HUMANIZATION_INSTRUCTIONS;
    let userPrompt = "";
    
    // Build references section for APA7 from file sources
    const validFileSources = fileSources.filter(fs => fs.sourceUrl && fs.sourceUrl.trim() !== "");
    const hasReferences = validFileSources.length > 0;
    let referencesInstruction = "";
    let referencesSection = "";
    
    if (hasReferences) {
      referencesInstruction = `

MANDATORY - APA7 CITATION REQUIREMENTS:
- When you use information from any of the uploaded materials, include an in-text citation
- At the VERY END of your response, include a "References" section
- For each source you cited, list it in APA7 format using the provided URL
- APA7 web format: Author (if known). (Year). Title. Retrieved from URL
- If author/date unknown, use the title and (n.d.)
- YOU MUST include the References section - do not skip it`;
      
      referencesSection = "\n\nSOURCE URLS FOR UPLOADED MATERIALS (include in References if you cite from them):\n";
      validFileSources.forEach((fs, i) => {
        referencesSection += `- "${fs.filename}": ${fs.sourceUrl}\n`;
      });
      referencesSection += "\nIf you reference content from any of these materials, include the URL in your References section at the end.";
    }

    switch (type) {
      case "discussion":
        systemPrompt += `
Discussion post. 250-400 words.

BANNED: crucial, vital, essential, significant, highlights, demonstrates, Furthermore, Moreover, Additionally, "not only but also", "The reading suggests", "This is important", "ensures", "aligns with"

START with your actual point. Example: "BWC footage alone doesn't tell the whole story..." NOT "This is an interesting topic..."

WRITE MESSY - run-ons ok, fragments ok, start sentences with And/But/So

END when done. No wrap-up. No "What do you think?" No moral about justice.${referencesInstruction}`;
        userPrompt = `Discussion post on this material.

ABSOLUTELY BANNED WORDS: crucial, vital, essential, significant, highlights, demonstrates, ensures, transparency, accountability

${additionalInstructions ? `INSTRUCTIONS: ${additionalInstructions}` : ""}${referencesSection}

Sound like a student, not an essay. Messy is better than polished. End abruptly.${hasReferences ? " Citations dropped in naturally, References at end." : ""}`;
        break;

      case "paper":
        const pages = parseInt(pageCount) || 2;
        const wordCount = pages * 275;
        systemPrompt += `
Academic paper. ~${wordCount} words (${pages} pages).

BANNED: crucial, vital, essential, significant, comprehensive, robust, Furthermore, Moreover, Additionally, highlights, demonstrates, underscores, "not only but also", "it is important", "plays a role", "serves as"

Write like a B+ student - solid content but not over-polished. Include:
- Some wordy sentences
- Occasional awkward phrasing  
- Varied paragraph lengths
- Start some sentences with And, But, So
- Contractions are fine${referencesInstruction}`;
        userPrompt = `Write a ${pages}-page paper.

BANNED WORDS: crucial, vital, essential, significant, Furthermore, Moreover, highlights, demonstrates

${additionalInstructions ? `INSTRUCTIONS: ${additionalInstructions}` : ""}${referencesSection}

Sound human. Imperfect is better than polished. Vary rhythm.${hasReferences ? " Citations natural, References at end." : ""}`;
        break;

      case "response":
        systemPrompt += `
Short response to classmate. MAX 4-6 sentences unless they asked detailed questions.

BANNED WORDS - NEVER USE: essential, crucial, vital, significant, spot on, indeed, surely, certainly, key role, really well, valuable, foundational, diligence, insight, familiarity, outlines, particularly, effective communication, play a role, plays a key, continued diligence

BANNED PATTERNS:
- "[Name], your [scenario/point/insight] [shows/outlines/highlights]..."
- "...is spot on"
- "Their familiarity with..."
- "Continued diligence will surely..."
- Any sentence with "indeed" or "surely" or "certainly"
- Complimenting their "insight" or "diligence"

WRITE LIKE THIS INSTEAD:
- "The patrol-to-detective handoff matters here..."
- "If initial reports miss details, detectives have to backtrack..."
- "Makes sense about the timeline - small errors compound..."

Answer questions directly. Keep it casual and SHORT.${referencesInstruction}`;
        userPrompt = `Write a SHORT response (3-5 sentences max). No AI language.

POST TO RESPOND TO:
${discussionPost}

${additionalInstructions ? `CONTEXT: ${additionalInstructions}` : ""}${referencesSection}

HARD RULES:
- NO "your insight/scenario shows/outlines"
- NO "spot on" / "indeed" / "surely" / "certainly"
- NO "play a key role" / "really well" / "valuable"
- Just respond directly to what they said
- If they asked a question, answer it${hasReferences ? "\n- Add citation only if you reference the source material" : ""}`;
        break;

      default:
        return NextResponse.json({ error: "Invalid generation type" }, { status: 400 });
    }

    // Add the user prompt to content
    inputContent.push({
      type: "input_text",
      text: userPrompt,
    });

    const response = await client.responses.create({
      model: "gpt-4o",
      input: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: inputContent,
        },
      ],
    });

    return NextResponse.json({
      content: response.output_text,
      type,
    });
  } catch (error) {
    console.error("Generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate content" },
      { status: 500 }
    );
  }
}
