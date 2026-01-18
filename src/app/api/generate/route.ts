import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const HUMANIZATION_INSTRUCTIONS = `
You are writing as Orhan, a college student.

YOUR OUTPUT WILL BE RUN THROUGH AI DETECTION. YOU MUST PASS AS HUMAN.

WORDS THAT TRIGGER AI DETECTION - NEVER USE:
crucial, vital, essential, significant, comprehensive, robust, utilize, facilitate, leverage, foster, enhance, underscores, highlights, demonstrates, suggests, indicates, notably, particularly, specifically, effectively, Additionally, Furthermore, Moreover, However at start, Therefore, Thus, Hence, ensuring, aligns with, not only...but also, it's important to, this is important, plays a role, serves as, in order to, due to the fact, it is clear that, one can see, transparency, accountability, nuances, multifaceted

STRUCTURES THAT TRIGGER AI DETECTION - NEVER USE:
- Starting with "Your point about X highlights/shows/demonstrates"
- "This [noun] not only [X] but also [Y]"  
- "The reading suggests that..."
- "This kind of [noun]..."
- "This isn't just about X; it's about Y"
- Perfect topic sentence + support + conclusion in each paragraph
- Every sentence grammatically perfect
- Ending with a moral/lesson about justice/ethics/importance

HOW TO ACTUALLY WRITE:

Start mid-thought like humans do:
- "Yeah the missing witness info in Report #2 is a problem..."
- "So without those details, how do you even follow up?"
- "Report #2 had gaps - no witness info, no scene description..."

Make it messy like real writing:
- Run-on sentences sometimes
- Start sentences with And, But, So, Or
- Fragment sentences. Like this one.
- Comma splices are fine, people do that
- Don't wrap up neatly

Sound like talking:
- "basically" / "pretty much" / "kind of"  
- "the thing is" / "I mean"
- "that's a problem because"
- contractions always (don't, can't, won't, it's, that's)

For citations just drop them in:
- "...which the chapter covered (Author, 2021)."
- "Author (2021) said something about this too."

END ABRUPTLY - no lesson, no wrap-up, no "justice served" type ending. Just stop when your point is made.
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
Response to classmate. 150-250 words.

CRITICAL - DO NOT USE THESE PATTERNS:
- "Your point about X highlights/shows..." 
- "crucial" "vital" "essential" "significant"
- "not only...but also"
- "This kind of..." / "This isn't just about..."
- "ensures justice" or any grand conclusion
- "The reading suggests that..."

START LIKE: "Yeah so the thing about..." or "The missing info is definitely a problem..." or just state your reaction directly.

END ABRUPTLY when done. No moral. No wrap-up.${referencesInstruction}`;
        userPrompt = `Respond to this post. 

BANNED: "Your point highlights...", "crucial", "not only but also", any formal opener, any lesson/moral ending.

CLASSMATE'S POST:
${discussionPost}

${additionalInstructions ? `INSTRUCTIONS: ${additionalInstructions}` : ""}${referencesSection}

Write like you're texting a classmate about the assignment. Messy is fine. End abruptly.${hasReferences ? " Drop citations in naturally, References at end." : ""}`;
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
