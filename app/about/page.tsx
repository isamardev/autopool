"use client";
import Link from "next/link";
import { FaArrowLeft } from "react-icons/fa";

export default function AboutPage() {
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
            About Us
          </h1>
          <div className="h-1.5 w-20 bg-primary rounded-full" />
        </header>

        <div className="space-y-10 text-subtext leading-relaxed">
          <section className="rounded-3xl bg-muted p-6 ring-1 ring-ring sm:p-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">Our Mission</h2>
            <p>
              Welcome to Digital Community Magnet, a next-generation platform designed to connect people and ideas through a transparent and robust binary network structure. Our mission is to empower individuals by providing a scalable environment where growth is limited only by your ambition.
            </p>
          </section>

          <section className="grid gap-8 sm:grid-cols-2">
            <div className="rounded-2xl bg-card p-6 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring">
              <h3 className="text-xl font-semibold text-foreground mb-3">Who We Are</h3>
              <p className="text-sm">
                We are a team of passionate developers and financial enthusiasts dedicated to building secure, fast, and intuitive fintech-grade surfaces. Our platform uses modern technology to ensure your data and transactions are always safe.
              </p>
            </div>
            <div className="rounded-2xl bg-card p-6 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring">
              <h3 className="text-xl font-semibold text-foreground mb-3">Our Technology</h3>
              <p className="text-sm">
                Built on the latest tech stack including Next.js, Prisma, and PostgreSQL, we provide a "real-time" experience. Our binary growth preview and automated dashboard keep you ahead of the curve.
              </p>
            </div>
          </section>

          <section className="rounded-3xl bg-card p-6 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring sm:p-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">The Binary Structure</h2>
            <p className="mb-4">
              Our unique structure allows each user to invite two direct members, creating a balanced and sustainable growth model. While we visualize up to 33 levels of growth, our payout systems are optimized for the first 20 levels to ensure long-term stability for all participants.
            </p>
            <ul className="list-disc pl-6 space-y-2 text-sm">
              <li>Level 0: The foundation of your journey.</li>
              <li>Level 1-20: Active payout and commission zones.</li>
              <li>Level 21-33: Visual expansion and team building.</li>
            </ul>
          </section>

          <section className="text-center py-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">Ready to join our journey?</h2>
            <Link 
              href="/?auth=signup" 
              className="inline-flex items-center justify-center rounded-full bg-primary px-8 py-3 text-sm font-medium text-white shadow-sm ring-1 ring-primary/20 transition hover:bg-primary/90"
            >
              Get Started Now
            </Link>
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
