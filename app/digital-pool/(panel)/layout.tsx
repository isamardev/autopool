import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DIGITAL_POOL_COOKIE, verifyDigitalPoolSession } from "@/lib/digital-pool-session";
import { DigitalPoolShell } from "@/components/DigitalPoolShell";
import { verifyImpersonationToken } from "@/lib/impersonation-token";
import { getDb } from "@/lib/db";

export default async function DigitalPoolPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  const session = verifyDigitalPoolSession(jar.get(DIGITAL_POOL_COOKIE)?.value);

  // Note: We don't redirect server-side here anymore to allow client-side admin impersonation (?imp=)
  return <DigitalPoolShell session={session}>{children}</DigitalPoolShell>;
}
