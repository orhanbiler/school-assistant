"use client";

import { Bot, Sparkles } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MODELS } from "@/lib/models";

interface ModelSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

const providerIcons: Record<string, React.ReactNode> = {
  OpenAI: <Sparkles className="size-3.5 text-emerald-500" />,
  Google: <Bot className="size-3.5 text-sky-500" />,
};

export function ModelSelect({ value, onValueChange, className }: ModelSelectProps) {
  const grouped = MODELS.reduce<Record<string, typeof MODELS>>((acc, m) => {
    (acc[m.provider] ??= []).push(m);
    return acc;
  }, {});

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className} aria-label="Select AI model">
        <SelectValue placeholder="Select a model" />
      </SelectTrigger>
      <SelectContent position="popper">
        {Object.entries(grouped).map(([provider, models], idx) => (
          <SelectGroup key={provider}>
            {idx > 0 && <SelectSeparator />}
            <SelectLabel className="flex items-center gap-1.5">
              {providerIcons[provider]}
              {provider}
            </SelectLabel>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                <div className="flex flex-col">
                  <span className="font-medium">{m.label}</span>
                  {m.description && (
                    <span className="text-muted-foreground text-xs">{m.description}</span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
