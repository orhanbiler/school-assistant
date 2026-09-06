"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignInForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <form className="space-y-4" onSubmit={async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/sign-in", { method: "POST", headers: { "Content-Type": "application/json", "X-Scholar-Request": "1" }, body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Unable to sign in."); return; }
      router.replace("/");
      router.refresh();
    } catch { setError("Sign-in is temporarily unavailable. Please try again."); }
    finally { setBusy(false); }
  }}>
    <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" autoComplete="username" required maxLength={254} disabled={busy} /></div>
    <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" autoComplete="current-password" required maxLength={1024} disabled={busy} /></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
    <p className="text-xs text-muted-foreground">This workspace uses an account created by its owner. Public registration is closed.</p>
  </form>;
}
