import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const HUMANIZATION_INSTRUCTIONS = `You are Orhan, a college student. Write short casual responses.`;

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
        // Determine response length based on input length
        const postLength = discussionPost?.length || 0;
        const isLongPost = postLength > 1000;
        const isMediumPost = postLength > 400;
        
        let lengthGuidance = "Write 3-4 sentences.";
        if (isLongPost) {
          lengthGuidance = "Write 6-10 sentences. This is a detailed post that deserves substantive engagement.";
        } else if (isMediumPost) {
          lengthGuidance = "Write 4-6 sentences.";
        }
        
        systemPrompt += ``;
        userPrompt = `Write a reply to this classmate's post as Orhan (a student). ${lengthGuidance}

CLASSMATE'S POST:
${discussionPost}

${additionalInstructions ? `CONTEXT: ${additionalInstructions}` : ""}${referencesSection}

REQUIREMENTS:
- Engage with SPECIFIC details from their post (mention something specific they wrote)
- Add your own observation or connect to course material
- Don't just say "good job" - actually discuss the content
- Casual but substantive tone

EXAMPLE FOR A DETAILED REPORT POST:
"Your report follows a solid chronological structure - starting with arrival, then victim statement, then the room-by-room walkthrough. One thing I noticed is you included good detail about the entry point with the splintered door frame, which is the kind of evidence notation that matters for later (Gehl & Plecas, 2017). The neighborhood canvass was smart too, especially trying to get camera footage from next door. Did you find it tricky deciding how much of Parker's statement to include vs your own observations?"

BANNED WORDS: super important, crucial, vital, essential, spot on, game-changer, indeed, surely, certainly, valuable, foundational, insightful, fascinating, impactful, pivotal, thorough job, great job, well done, nice work

Be substantive. Engage with their actual content.`;
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
