import { ShieldCheck } from "lucide-react";
import { getAccessConfig } from "@/lib/server/access-config";
import { SignInForm } from "@/components/scholar/sign-in-form";

export const dynamic = "force-dynamic";

export default function Login() {
  const config = getAccessConfig();
  return <main className="login-screen min-h-dvh bg-pattern flex items-center justify-center p-4 sm:p-6">
    <div className="glass border border-border/50 rounded-2xl p-5 sm:p-8 max-w-md w-full min-w-0 space-y-6">
      <ShieldCheck className="h-10 w-10 text-primary" />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Scholar&apos;s Quill</h1>
        <p className="text-muted-foreground">Your private writing workspace. Sign in with your private account to continue.</p>
      </div>
      {!config.ready ? <p role="status" className="text-sm">Private sign-in is being set up. Writing and AI generation are locked until setup is complete.</p> : <>
        <SignInForm />
      </>}
    </div>
  </main>;
}
