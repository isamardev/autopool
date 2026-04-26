import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Digital Pool",
};

export default function DigitalPoolRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen max-w-[100vw] overflow-x-hidden bg-transparent text-foreground">
      {children}
    </div>
  );
}
