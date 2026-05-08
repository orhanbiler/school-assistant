export type ModelOption = {
  id: string;
  label: string;
  provider: "OpenAI" | "Google";
  description?: string;
};

export const MODELS: ModelOption[] = [
  { id: "gpt-5.2", label: "GPT-5.2", provider: "OpenAI", description: "Latest, best reasoning" },
  { id: "gpt-4o", label: "GPT-4o", provider: "OpenAI", description: "Fast, multimodal" },
  { id: "gemini-3-pro-preview", label: "Gemini 3 Pro", provider: "Google", description: "Preview, advanced" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "Google" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "Google", description: "Fastest" },
  { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", provider: "Google" },
];

export const DEFAULT_MODEL = MODELS[0].id;

export function findModel(id: string): ModelOption | undefined {
  return MODELS.find((m) => m.id === id);
}
