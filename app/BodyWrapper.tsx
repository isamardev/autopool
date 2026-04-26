"use client";

import { useEffect } from "react";
import WhatsAppButton from "@/components/WhatsAppButton";

export default function BodyWrapper({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Remove any extension-added attributes that cause hydration mismatches
    const body = document.body;
    if (body.hasAttribute("cz-shortcut-listen")) {
      body.removeAttribute("cz-shortcut-listen");
    }
  }, []);

  return (
    <>
      {children}
      <WhatsAppButton />
    </>
  );
}