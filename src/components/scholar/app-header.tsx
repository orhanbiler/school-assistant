"use client";

import { Feather, Loader2, LogOut, Monitor, Moon, RotateCcw, Settings2, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { InstallApp } from "./install-app";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface AppHeaderProps {
  aiModel: string;
  onModelChange: (model: string) => void;
  onClearAll: () => void;
}

function ClearDataDialog({ children, onClearAll }: { children: ReactNode; onClearAll: () => void }) {
  return <AlertDialog>
    <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
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
  </AlertDialog>;
}

function MobileSettings({ signingOut, onSignOut, onClearAll }: {
  signingOut: boolean;
  onSignOut: () => void;
  onClearAll: () => void;
}) {
  const { theme, setTheme } = useTheme();
  return <Sheet>
    <SheetTrigger asChild>
      <Button variant="outline" size="icon" className="size-12 shrink-0 rounded-xl lg:hidden" aria-label="Open workspace settings">
        <Settings2 className="size-5" />
      </Button>
    </SheetTrigger>
    <SheetContent side="bottom" className="max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain rounded-t-3xl gap-0 pb-[max(1rem,env(safe-area-inset-bottom))] outline-none [&>button]:inline-flex [&>button]:size-12 [&>button]:items-center [&>button]:justify-center [&>button]:top-2 [&>button]:right-2">
      <SheetHeader className="px-5 pt-5 pb-4 pr-16 text-left">
        <SheetTitle>Workspace settings</SheetTitle>
        <SheetDescription>Personalize your workspace and manage this device.</SheetDescription>
      </SheetHeader>
      <div className="space-y-5 px-5">
        <fieldset className="min-w-0">
          <legend className="mb-3 text-sm font-medium">Appearance</legend>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: "light", label: "Light", icon: Sun },
              { value: "dark", label: "Dark", icon: Moon },
              { value: "system", label: "System", icon: Monitor },
            ].map(({ value, label, icon: Icon }) => (
              <label key={value} className="min-w-0 cursor-pointer">
                <input
                  type="radio"
                  name="workspace-theme"
                  value={value}
                  checked={(theme ?? "system") === value}
                  onChange={() => setTheme(value)}
                  className="peer sr-only"
                />
                <span className="flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-background text-sm text-muted-foreground transition-colors peer-checked:border-primary/50 peer-checked:bg-primary/10 peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                  <Icon className="size-5" aria-hidden="true" />{label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Button variant="outline" className="min-h-12 w-full justify-start gap-3 rounded-xl" disabled={signingOut} onClick={onSignOut}>
          {signingOut ? <Loader2 className="size-5 animate-spin" /> : <LogOut className="size-5" />}
          {signingOut ? "Signing out…" : "Sign out"}
        </Button>
        <section aria-labelledby="mobile-device-data" className="border-t border-border/60 pt-4 space-y-2">
          <h3 id="mobile-device-data" className="text-sm font-medium">Device data</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">Remove saved materials, drafts, and writing settings from this device.</p>
          <ClearDataDialog onClearAll={onClearAll}>
            <Button variant="ghost" className="min-h-12 w-full justify-start gap-3 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive">
              <RotateCcw className="size-5" />Clear all data
            </Button>
          </ClearDataDialog>
        </section>
      </div>
    </SheetContent>
  </Sheet>;
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
    <header className="app-header border-b border-border/50 glass relative lg:sticky top-0 z-40">
      <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex min-w-0 flex-1 lg:flex-none items-center gap-2 sm:gap-3">
            <div className="shrink-0 p-2 rounded-lg bg-primary/10 ring-1 ring-primary/10">
              <Feather className="size-5 sm:size-6 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-semibold tracking-tight">
                Scholar&apos;s Quill
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                <span className="lg:hidden">Your study workspace</span>
                <span className="hidden lg:inline">Academic Writing Assistant for Orhan</span>
              </p>
            </div>
          </div>
          <MobileSettings signingOut={signingOut} onSignOut={signOut} onClearAll={onClearAll} />
          <div className="flex w-full min-w-0 lg:w-auto items-center gap-2 sm:gap-3">
            <div className="flex min-w-0 flex-1 lg:flex-none items-center gap-2">
              <Label
                htmlFor="model-select"
                className="hidden sm:block text-sm text-muted-foreground whitespace-nowrap"
              >
                Model:
              </Label>
              <ModelSelect
                id="model-select"
                value={aiModel}
                onValueChange={onModelChange}
                className="min-w-0 min-h-12 lg:min-h-9 flex-1 lg:min-w-[180px] [&_[data-slot=select-value]]:truncate"
              />
            </div>
            <InstallApp />
            <div className="hidden lg:flex items-center gap-3">
              <ThemeToggle />
              <Button variant="outline" size="sm" aria-label="Sign out" disabled={signingOut} onClick={signOut}>
                <LogOut className="w-4 h-4" />
                <span>Sign out</span>
              </Button>
              <ClearDataDialog onClearAll={onClearAll}>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Clear all data"
                  title="Clear all data"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </ClearDataDialog>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
