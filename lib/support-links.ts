/** Official WhatsApp channel — dashboard social strip (optional). */
export const WHATSAPP_CHANNEL_URL =
  "https://whatsapp.com/channel/0029VbCSbVw90x2t7vYUNb36";

/** When DB has no WhatsApp set — same fallback as `/api/public/settings`. */
export const WHATSAPP_DEFAULT_NUMBER_DIGITS = "923000000000";

/** `wa.me` chat link from admin-configured number (non-digits stripped). */
export function buildWhatsAppMeUrl(rawNumber: string | undefined | null): string {
  const digits = String(rawNumber ?? "").replace(/\D/g, "");
  return `https://wa.me/${digits || WHATSAPP_DEFAULT_NUMBER_DIGITS}`;
}
