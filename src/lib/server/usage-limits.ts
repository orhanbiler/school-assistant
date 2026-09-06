import "server-only";
import { randomUUID } from "node:crypto";
import { getAccessConfig } from "@/lib/server/access-config";

export class UsageError extends Error {
  status: number;
  retryAfter: number;
  constructor(message: string, status: number, retryAfter = 0) { super(message); this.status = status; this.retryAfter = retryAfter; }
}

function positiveLimit(name: string, fallback: number, maximum: number): number {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new UsageError("Usage protection needs attention. Generation is locked.", 503);
  }
  return value;
}

export function getUsageLimits() {
  return [
    { name: "minute", seconds: 60, limit: positiveLimit("AI_REQUESTS_PER_MINUTE", 5, 30) },
    { name: "hour", seconds: 3600, limit: positiveLimit("AI_REQUESTS_PER_HOUR", 20, 100) },
    { name: "day", seconds: 86400, limit: positiveLimit("AI_REQUESTS_PER_DAY", 40, 200) },
    { name: "month", seconds: 30 * 86400, limit: positiveLimit("AI_REQUESTS_PER_MONTH", 300, 1000) },
  ];
}

export function getMaxOutputTokens(type: string): number {
  const ceiling = positiveLimit("AI_MAX_OUTPUT_TOKENS", 6000, 12_000);
  return Math.min(ceiling, type === "paper" || type === "revise" ? ceiling : 2000);
}

async function usageRpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { supabaseUrl } = getAccessConfig();
  const key = process.env.SUPABASE_SECRET_KEY;
  try {
    if (!supabaseUrl || !key) throw new Error();
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
      method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(args), signal: AbortSignal.timeout(5000), cache: "no-store", redirect: "error",
    });
    if (!response.ok) throw new Error();
    return await response.json();
  } catch {
    // Never fall back to per-process counters: Vercel instances must share a budget.
    throw new UsageError("Usage protection is unavailable. Generation is temporarily locked.", 503);
  }
}

export async function reserveGeneration(): Promise<() => Promise<void>> {
  if (process.env.AI_GENERATION_ENABLED !== "true") throw new UsageError("AI generation is switched off by the owner.", 503);
  const windows = getUsageLimits();
  const owner = getAccessConfig().ownerId;
  const lease = randomUUID();
  const result = await usageRpc("reserve_ai_generation", {
    p_owner: owner, p_request: lease, p_limits: windows.map((window) => window.limit),
  });
  if (!Array.isArray(result) || result.length !== 3 || !result.every(Number.isInteger) ||
      ![0, 1].includes(result[0]) || (result[0] === 0 && (result[1] < 1 || result[1] > 5))) {
    throw new UsageError("Usage protection is unavailable. Generation is temporarily locked.", 503);
  }
  if (result[0] !== 1) {
    const concurrent = result[1] === 5;
    const period = windows[result[1] - 1]?.name || "usage";
    throw new UsageError(concurrent ? "A draft is already being generated. Wait for it to finish." : `Your generation limit for this ${period} has been reached. Try again later.`, 429, Math.max(1, result[2]));
  }
  return async () => {
    // Failed provider calls remain counted; only release the active request.
    try { await usageRpc("release_ai_generation", { p_owner: owner, p_request: lease }); }
    catch { console.error("Usage lease release failed; it will expire automatically."); }
  };
}
