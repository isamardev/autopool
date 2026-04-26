"use client";
import Link from "next/link";
import { FaArrowLeft } from "react-icons/fa";

export default function TermsPage() {
  const sections = [
    {
      title: "1. Acceptance of Terms",
      content: "By accessing and using this platform, you agree to be bound by these Terms and Conditions. If you do not agree with any part of these terms, you must not use our services."
    },
    {
      title: "2. Account Registration",
      content: "To participate in our MLM structure, you must create an account. You are responsible for maintaining the confidentiality of your account information and password. You must provide accurate and complete information during registration."
    },
    {
      title: "3. Binary Structure & Referrals",
      content: "Our platform operates on a binary referral system. Each user is allowed a maximum of two direct referrals. Additional referrals must be placed under existing team members to promote team growth."
    },
    {
      title: "4. Activation & Payments",
      content: "Account activation requires a one-time fee as specified on the dashboard. All payments and withdrawals are processed through USDT (BEP20). Users are responsible for providing correct wallet addresses."
    },
    {
      title: "5. Payouts & Commissions",
      content: "Commissions are distributed based on the active participation of your team. Payouts are limited to the first 20 levels of the structure. We reserve the right to modify commission rates with prior notice."
    },
    {
      title: "6. Prohibited Activities",
      content: "Users are prohibited from creating multiple accounts for the same person, using automated scripts to manipulate the system, or engaging in any form of fraudulent activity. Violations will lead to immediate account suspension."
    },
    {
      title: "7. Limitation of Liability",
      content: "Digital Community Magnet shall not be liable for any direct, indirect, incidental, or consequential damages resulting from the use or inability to use our services."
    }
  ];

  return (
    <div className="min-h-screen max-w-[100vw] overflow-x-hidden bg-transparent font-sans text-foreground selection:bg-primary selection:text-white">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <Link 
          href="/" 
          className="inline-flex items-center gap-2 text-sm font-medium text-subtext hover:text-primary transition-colors mb-8"
        >
          <FaArrowLeft size={14} />
          Back to Home
        </Link>

        <header className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl mb-4">
            Terms & Conditions
          </h1>
          <div className="h-1.5 w-20 bg-primary rounded-full" />
          <p className="mt-4 text-subtext">Last updated: {new Date().toLocaleDateString()}</p>
        </header>

        <div className="space-y-8 leading-relaxed">
          {sections.map((section, idx) => (
            <section key={idx} className="rounded-2xl bg-card p-6 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring">
              <h2 className="text-xl font-semibold text-foreground mb-3">{section.title}</h2>
              <p className="text-subtext text-sm sm:text-base">
                {section.content}
              </p>
            </section>
          ))}

          <section className="rounded-2xl bg-muted p-6 ring-1 ring-ring text-center">
            <p className="text-sm text-subtext">
              If you have any questions regarding these terms, please contact our support team through the dashboard.
            </p>
          </section>
        </div>
      </div>

      <footer className="mx-auto max-w-7xl px-6 py-12">
        <div className="flex flex-col items-center justify-between gap-4 rounded-2xl bg-muted p-6 text-sm text-subtext ring-1 ring-ring sm:flex-row">
          <div>© {new Date().getFullYear()} Digital Community Magnet</div>
          <div className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-primary shadow-[0_0_10px_rgba(0,178,163,0.35)]" />
            <span>Teal accent theme</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
