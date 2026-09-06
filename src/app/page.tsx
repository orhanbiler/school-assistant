import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createRequestAuth } from "@/lib/server/supabase";
import { getAccessConfig } from "@/lib/server/access-config";
import WritingWorkspace from "@/components/scholar/writing-workspace";

export const dynamic = "force-dynamic";

export default async function Home() {
  const config = getAccessConfig();
  if (!config.ready) redirect("/login");
  const auth = createRequestAuth(new Request(config.origin, { headers: await headers() }));
  if (!(await auth.hasOwnerSession())) redirect("/login");
  return <WritingWorkspace />;
}
