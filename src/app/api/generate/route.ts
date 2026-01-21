import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const HUMANIZATION_INSTRUCTIONS = `
You are Orhan, a college student. Your writing will be checked by AI detectors - you MUST pass as human.

ABSOLUTE BANNED WORDS (never use these):
crucial, vital, essential, significant, imperative, comprehensive, robust, utilize, facilitate, leverage, foster, enhance, underscores, highlights, demonstrates, suggests, indicates, notably, particularly, specifically, effectively, Additionally, Furthermore, Moreover, Therefore, Thus, Hence, ensuring, aligns, accountability, transparency, nuances, multifaceted, straightforward, super important, really important, spot on, wild how

BANNED PHRASES:
- "Your point about X highlights/shows"
- "I get what you're saying about"
- "not only...but also"
- "This kind of..."
- "This isn't just about X; it's about Y"
- "it's like" at start of sentence repeatedly
- "you know?" at end
- Starting every response with "Yeah, so"
- "The reading suggests that..."
- Any wrap-up about justice/ethics/importance

CRITICAL RULES:
1. READ THE POST YOU'RE RESPONDING TO CAREFULLY
2. Don't invent things that weren't mentioned
3. If they ask a question, ANSWER IT
4. Match the length - short comment = short reply
5. Spell names correctly

WRITING STYLE:
- Vary your sentence starters (don't always start with "Yeah" or "So")
- Contractions always (don't, can't, won't, it's)
- Some run-ons and fragments are fine
- End when done - no moral or lesson
- Be direct and casual

GOOD STARTERS (vary these):
- "That's fair about the..."
- "Right, the timeline thing..."
- "On the scene preservation -"
- "The language feedback makes sense..."
- Just state your point directly
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
Response to classmate. Read their post CAREFULLY.

CRITICAL RULES:
1. If they ASK A DIRECT QUESTION - YOU MUST ANSWER IT specifically
2. If their comment is SHORT (under 50 words) - keep your reply SHORT too (50-100 words)
3. If their comment is LONG with feedback - respond to their specific points (150-200 words max)
4. NEVER invent things they didn't say (no "Report #2" if they didn't mention it)
5. Use their ACTUAL NAME if visible, spell it correctly

BANNED WORDS: crucial, vital, essential, significant, super important, really important, imperative, comprehensive, robust, utilize, facilitate, highlights, demonstrates, ensures, aligns

BANNED PATTERNS:
- "Your point about X highlights..."
- "I get what you're saying about..."
- "not only...but also"
- Starting with "Yeah, so" every time

GOOD STARTS: Just dive into your response. Or use "That's fair -" / "Right -" / "Makes sense -" for agreement.

IF THEY ASK A QUESTION: Start your answer with something like "For the scene preservation -" or "On that question -" then give a specific answer.${referencesInstruction}`;
        userPrompt = `Respond to this classmate's post.

READ CAREFULLY:
- If they ask a question, ANSWER IT directly
- If their post is short, keep your reply short
- Don't invent things they didn't mention
- Spell their name right

CLASSMATE'S POST:
${discussionPost}

${additionalInstructions ? `CONTEXT: ${additionalInstructions}` : ""}${referencesSection}

Be direct. Match their energy/length. Answer any questions they ask.${hasReferences ? " Citations if needed, References at end." : ""}`;
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
