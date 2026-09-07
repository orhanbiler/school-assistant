"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MAX_CITATION_DETAILS_LENGTH, MAX_MATERIAL_CONTEXT_LENGTH, MAX_WEEK_NUMBER } from "@/lib/request-limits";
import { materialWeek, type StoredFile } from "@/lib/materials";

export type MaterialMetadata = Pick<StoredFile, "weekNumber" | "sourceUrl" | "materialContext" | "citationDetails">;

export function WeekSelect({ value, onChange, id, label = "Week" }: { value: number; onChange: (week: number) => void; id: string; label?: string }) {
  return <div className="min-w-0 space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <Select value={String(value)} onValueChange={(value) => onChange(Number(value))}>
      <SelectTrigger id={id} className="w-full bg-background/50"><SelectValue /></SelectTrigger>
      <SelectContent>{Array.from({ length: MAX_WEEK_NUMBER }, (_, i) => <SelectItem key={i + 1} value={String(i + 1)}>Week {i + 1}</SelectItem>)}</SelectContent>
    </Select>
  </div>;
}

export function MaterialMetadataFields({ value, onChange, id }: { value: MaterialMetadata; onChange: (patch: Partial<MaterialMetadata>) => void; id: string }) {
  return <div className="space-y-4">
    <WeekSelect id={`${id}-week`} value={materialWeek(value)} onChange={(weekNumber) => onChange({ weekNumber })} />
    <div className="space-y-2">
      <Label htmlFor={`${id}-url`}>Source link <span className="font-normal text-muted-foreground">(optional)</span></Label>
      <Input id={`${id}-url`} type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" maxLength={2000} value={value.sourceUrl || ""} onChange={(event) => onChange({ sourceUrl: event.target.value })} placeholder="https://…" />
      <p className="text-xs text-muted-foreground">A link identifies the source. Add its text or a photo for the draft to use.</p>
    </div>
    <div className="space-y-2">
      <Label htmlFor={`${id}-context`}>Notes for this material <span className="font-normal text-muted-foreground">(optional)</span></Label>
      <Textarea id={`${id}-context`} value={value.materialContext || ""} maxLength={MAX_MATERIAL_CONTEXT_LENGTH} onChange={(event) => onChange({ materialContext: event.target.value })} placeholder="Chapter 4, pages 82–85. Use the section about motivation for this week’s discussion." className="field-sizing-fixed min-h-24" />
    </div>
    <div className="space-y-2">
      <Label htmlFor={`${id}-citation`}>Title, author, and year <span className="font-normal text-muted-foreground">(optional)</span></Label>
      <Textarea id={`${id}-citation`} value={value.citationDetails || ""} maxLength={MAX_CITATION_DETAILS_LENGTH} onChange={(event) => onChange({ citationDetails: event.target.value })} placeholder="Copy the known publication details from the cover or reference entry." className="field-sizing-fixed min-h-24" />
    </div>
  </div>;
}
