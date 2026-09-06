"use client";

import { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const sync = () => setInstalled(standalone.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const ready = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const done = () => { setInstalled(true); setOpen(false); setPrompt(null); };
    sync();
    standalone.addEventListener("change", sync);
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", done);
    return () => {
      standalone.removeEventListener("change", sync);
      window.removeEventListener("beforeinstallprompt", ready);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  if (installed) return null;
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="outline" size="sm"><Smartphone />Install app</Button></DialogTrigger>
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Add Scholar&apos;s Quill to your home screen</DialogTitle>
        <DialogDescription>Open your private workspace like an app. Sign-in is still required, and AI generation needs an internet connection.</DialogDescription>
      </DialogHeader>
      {prompt ? <Button onClick={async () => {
        try {
          await prompt.prompt();
          const choice = await prompt.userChoice;
          if (choice.outcome === "accepted") setOpen(false);
        } catch { toast.error("Use your browser's menu to add this app to your home screen."); }
        finally { setPrompt(null); }
      }}><Download />Install Scholar&apos;s Quill</Button> : <div className="space-y-3 text-sm">
        <p><strong>iPhone or iPad:</strong> open this site in Safari, tap Share, then Add to Home Screen. You may need to scroll through the Share menu.</p>
        <p><strong>Android:</strong> open the browser menu and choose Install app or Add to Home screen.</p>
        <p className="text-muted-foreground">On a computer, look for your browser&apos;s install button in the address bar. Availability depends on the browser.</p>
      </div>}
    </DialogContent>
  </Dialog>;
}
