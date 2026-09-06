"use client";

import { Feather, LogOut, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ModelSelect } from "./model-select";
import { ThemeToggle } from "@/components/theme-toggle";

interface AppHeaderProps {
  aiModel: string;
  onModelChange: (model: string) => void;
  onClearAll: () => void;
}

export function AppHeader({ aiModel, onModelChange, onClearAll }: AppHeaderProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  async function signOut() {
    setSigningOut(true);
    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST", headers: { "X-Scholar-Request": "1" } });
      if (!response.ok) throw new Error();
      router.replace("/login");
      router.refresh();
    } catch { toast.error("Sign-out failed. Please try again."); }
    finally { setSigningOut(false); }
  }
  return (
    <header className="border-b border-border/50 glass sticky top-0 z-50">
      <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 ring-1 ring-primary/10">
              <Feather className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
                Scholar&apos;s Quill
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Academic Writing Assistant for Orhan
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden md:flex items-center gap-2">
              <Label
                htmlFor="model-select"
                className="text-sm text-muted-foreground whitespace-nowrap"
              >
                Model:
              </Label>
              <ModelSelect
                value={aiModel}
                onValueChange={onModelChange}
                className="h-9 min-w-[180px]"
              />
            </div>
            <ThemeToggle />
            <Button variant="outline" size="sm" aria-label="Sign out" disabled={signingOut} onClick={signOut}>
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
            <AlertDialog>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Clear all data"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                </TooltipTrigger>
                <TooltipContent>Clear all data</TooltipContent>
              </Tooltip>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently removes your uploaded materials, context,
                    instructions, and generated content from this device. This
                    cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      onClearAll();
                      toast.success("All data cleared");
                    }}
                    className="bg-destructive hover:bg-destructive/90 text-white"
                  >
                    Clear everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <div className="md:hidden mt-3 flex items-center gap-2">
          <Label
            htmlFor="model-select-mobile"
            className="text-sm text-muted-foreground whitespace-nowrap"
          >
            Model:
          </Label>
          <ModelSelect
            value={aiModel}
            onValueChange={onModelChange}
            className="h-9 flex-1"
          />
        </div>
      </div>
    </header>
  );
}
