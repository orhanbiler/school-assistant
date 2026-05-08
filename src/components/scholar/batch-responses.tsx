"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export interface BatchResponse {
  name: string;
  post: string;
  response: string;
}

export function BatchResponses({ responses }: { responses: BatchResponse[] }) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (responses.length === 0) return null;

  const copyOne = async (i: number) => {
    try {
      await navigator.clipboard.writeText(responses[i].response);
      setCopiedIndex(i);
      toast.success(`Copied response to ${responses[i].name}`);
      setTimeout(() => setCopiedIndex(null), 1800);
    } catch {
      toast.error("Could not copy");
    }
  };

  const copyAll = async () => {
    const merged = responses
      .map((r) => `--- ${r.name} ---\n${r.response}`)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(merged);
      toast.success("Copied all responses");
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <div className="space-y-3 mt-4">
      <Separator />
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">
          Generated Responses ({responses.length})
        </Label>
        <Button variant="ghost" size="sm" onClick={copyAll} className="h-7 text-xs">
          <Copy className="w-3 h-3 mr-1" />
          Copy all
        </Button>
      </div>
      {responses.map((item, index) => (
        <div
          key={`${item.name}-${index}`}
          className="p-3 rounded-lg border border-border/50 bg-background/30 space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-primary">{item.name}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyOne(index)}
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
            &quot;{item.post.substring(0, 140)}&hellip;&quot;
          </div>
          <div className="text-sm whitespace-pre-wrap bg-background/50 p-3 rounded border">
            {item.response}
          </div>
        </div>
      ))}
    </div>
  );
}
