import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getResolvedReceiverWalletAddress, readWhatsAppAndReceiverFromDb } from "@/lib/receiver-wallet";
import { WHATSAPP_DEFAULT_NUMBER_DIGITS } from "@/lib/support-links";

export async function GET() {
  try {
    const db = getDb();
    const { whatsapp } = await readWhatsAppAndReceiverFromDb(db);

    return NextResponse.json({
      whatsappNumber: whatsapp || WHATSAPP_DEFAULT_NUMBER_DIGITS,
      receiverWalletAddress: getResolvedReceiverWalletAddress(),
    });
  } catch {
    return NextResponse.json({
      whatsappNumber: "",
      receiverWalletAddress: getResolvedReceiverWalletAddress(),
    });
  }
}
