export class GenerationFailure extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export async function requestDraft(formData: FormData): Promise<{ content: string }> {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "X-Scholar-Request": "1" },
    body: formData,
    credentials: "same-origin",
  });
  const data = await response.json();
  if (!response.ok) throw new GenerationFailure(data.error || "The draft could not be generated.", response.status);
  if (typeof data.content !== "string") throw new GenerationFailure("The draft could not be read.", 502);
  return data;
}
