import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DIGITAL_POOL_COOKIE, verifyDigitalPoolSession } from "@/lib/digital-pool-session";
import { DigitalPoolShell } from "@/components/DigitalPoolShell";

export default async function DigitalPoolPanelLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const session = verifyDigitalPoolSession(jar.get(DIGITAL_POOL_COOKIE)?.value);
  if (!session) redirect("/digital-pool/login");

  return <DigitalPoolShell session={session}>{children}</DigitalPoolShell>;
}
