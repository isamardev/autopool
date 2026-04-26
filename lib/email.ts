import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

type OtpPurpose = "registration" | "withdrawal" | "password_reset";

function parseSecure(port: number) {
  return port === 465;
}

/** Vercel-style names (EMAIL_SERVER_*) plus legacy SMTP_* — same as NextAuth / common hosts. */
function smtpHost() {
  return process.env.EMAIL_SERVER_HOST || process.env.SMTP_HOST;
}

function smtpPort() {
  return Number(process.env.EMAIL_SERVER_PORT || process.env.SMTP_PORT || 587);
}

function smtpUser() {
  return (
    process.env.EMAIL_SERVER_USER ||
    process.env.SMTP_USER ||
    process.env.EMAIL_FROM ||
    ""
  ).trim();
}

function smtpPass() {
  return process.env.EMAIL_SERVER_PASSWORD || process.env.SMTP_PASS || "";
}

/** If only SMTP_URL is set, derive From address from the URL userinfo. */
function tryMailFromSmtpUrl(): string {
  const raw = process.env.SMTP_URL?.trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    const user = decodeURIComponent(u.username || "");
    if (user.includes("@")) return user;
  } catch {
    /* ignore malformed URL */
  }
  return "";
}

function mailFrom() {
  return (
    process.env.EMAIL_FROM ||
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    smtpUser() ||
    tryMailFromSmtpUrl()
  ).trim();
}

export function isEmailConfigured() {
  const from = mailFrom();
  if (!from) {
    return false;
  }
  if (process.env.SMTP_URL?.trim()) {
    return true;
  }
  const host = smtpHost();
  const pass = smtpPass();
  const user = smtpUser();
  return Boolean(host && smtpPort() && pass && user);
}

function smtpSecure(port: number) {
  if (process.env.SMTP_SECURE) {
    return process.env.SMTP_SECURE === "true";
  }
  return parseSecure(port);
}

function getTransporter() {
  const smtpUrl = process.env.SMTP_URL?.trim();
  if (smtpUrl) {
    return nodemailer.createTransport(smtpUrl);
  }

  const host = smtpHost();
  const port = smtpPort();
  const user = smtpUser();
  const pass = smtpPass();

  if (!host || !user || !pass) {
    throw new Error("Email service is not configured");
  }

  const secure = smtpSecure(port);
  const smtpOptions: SMTPTransport.Options = {
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    connectionTimeout: 60_000,
    greetingTimeout: 30_000,
    socketTimeout: 60_000,
    requireTLS: !secure && port === 587,
    tls: {
      minVersion: "TLSv1.2" as const,
      rejectUnauthorized: process.env.SMTP_TLS_INSECURE === "true" ? false : true,
    },
  };
  return nodemailer.createTransport(smtpOptions);
}

/** Phrase after "so you can complete …" (matches transactional email style). */
function getCompletionTail(purpose: OtpPurpose) {
  if (purpose === "registration") return "your account registration";
  if (purpose === "password_reset") return "your password reset";
  return "your withdrawal verification";
}

function publicSiteUrl() {
  const u = (process.env.AUTH_URL || process.env.NEXTAUTH_URL || "").trim();
  return u.replace(/\/$/, "");
}

/** Only the @ address — strips any leading display name (e.g. MLM …) from EMAIL_FROM. */
function smtpEnvelopeAddress(): string {
  const raw = mailFrom();
  const inBrackets = raw.match(/<([^>]+)>/);
  if (inBrackets) return inBrackets[1].trim();
  const at = raw.match(/[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/);
  if (at) return at[0];
  return raw.trim();
}

/** OTP From line: fixed display name + envelope address only (never pass through MLM-style env names). */
function otpFromHeader(): string {
  return `Digital Community Magnet <${smtpEnvelopeAddress()}>`;
}

export async function sendOtpEmail({
  to,
  otp,
  purpose,
}: {
  to: string;
  otp: string;
  purpose: OtpPurpose;
}) {
  if (!mailFrom()) {
    throw new Error("Email sender is not configured");
  }

  const from = otpFromHeader();
  const transporter = getTransporter();
  const completionTail = getCompletionTail(purpose);
  const site = publicSiteUrl();
  const subject = "Digital Community Magnet Verification Code";

  const bodyIntro = `This e-mail contains your verification code, so you can complete ${completionTail}.`;
  const bodyExpire = "This code will expire in 10 minutes.";
  const bodyContact =
    "Contact us immediately if you did not authorize this verification code.";

  const text = [
    "Hello,",
    "",
    bodyIntro,
    "",
    `Code : ${otp}`,
    "",
    bodyExpire,
    "",
    bodyContact,
    "",
    "Digital Community Magnet",
    site || undefined,
  ]
    .filter(Boolean)
    .join("\n");

  const footerLink =
    site.length > 0
      ? `<a href="${site}" style="color:#1a73e8;text-decoration:underline">${site}</a>`
      : "";

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f1f3f4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f3f4;padding:24px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;padding:24px 22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.55;color:#202124;">
          <tr>
            <td style="padding:0;">
              <p style="margin:0 0 16px">Hello,</p>
              <p style="margin:0 0 16px">${bodyIntro}</p>
              <p style="margin:0 0 16px"><strong>Code : ${otp}</strong></p>
              <p style="margin:0 0 16px">${bodyExpire}</p>
              <p style="margin:0">${bodyContact}</p>
              <p style="margin:24px 0 0;font-size:13px;color:#5f6368">Digital Community Magnet</p>
              ${footerLink ? `<p style="margin:8px 0 0;font-size:13px">${footerLink}</p>` : ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
}
