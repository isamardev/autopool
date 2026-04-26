"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FaUser, FaEye, FaEyeSlash } from "react-icons/fa";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "react-toastify";
import { markSessionTabActive } from "@/lib/session-tab";
import { getAuthRedirectUrl } from "@/lib/auth-redirect-url";

const BLOCKED_MESSAGE = "You are blocked by admin. Contact customer support for help.";
/** Hero headline / brand line */
const BRAND_SLOGAN = "Connecting and Growing Together";
const COUNTRIES = [
  { name: "Afghanistan", code: "+93" },
  { name: "Albania", code: "+355" },
  { name: "Algeria", code: "+213" },
  { name: "Andorra", code: "+376" },
  { name: "Angola", code: "+244" },
  { name: "Antigua and Barbuda", code: "+1" },
  { name: "Argentina", code: "+54" },
  { name: "Armenia", code: "+374" },
  { name: "Australia", code: "+61" },
  { name: "Austria", code: "+43" },
  { name: "Azerbaijan", code: "+994" },
  { name: "Bahamas", code: "+1" },
  { name: "Bahrain", code: "+973" },
  { name: "Bangladesh", code: "+880" },
  { name: "Barbados", code: "+1" },
  { name: "Belarus", code: "+375" },
  { name: "Belgium", code: "+32" },
  { name: "Belize", code: "+501" },
  { name: "Benin", code: "+229" },
  { name: "Bhutan", code: "+975" },
  { name: "Bolivia", code: "+591" },
  { name: "Bosnia and Herzegovina", code: "+387" },
  { name: "Botswana", code: "+267" },
  { name: "Brazil", code: "+55" },
  { name: "Brunei", code: "+673" },
  { name: "Bulgaria", code: "+359" },
  { name: "Burkina Faso", code: "+226" },
  { name: "Burundi", code: "+257" },
  { name: "Cabo Verde", code: "+238" },
  { name: "Cambodia", code: "+855" },
  { name: "Cameroon", code: "+237" },
  { name: "Canada", code: "+1" },
  { name: "Central African Republic", code: "+236" },
  { name: "Chad", code: "+235" },
  { name: "Chile", code: "+56" },
  { name: "China", code: "+86" },
  { name: "Colombia", code: "+57" },
  { name: "Comoros", code: "+269" },
  { name: "Congo", code: "+242" },
  { name: "Costa Rica", code: "+506" },
  { name: "Croatia", code: "+385" },
  { name: "Cuba", code: "+53" },
  { name: "Cyprus", code: "+357" },
  { name: "Czech Republic", code: "+420" },
  { name: "Denmark", code: "+45" },
  { name: "Djibouti", code: "+253" },
  { name: "Dominica", code: "+1" },
  { name: "Dominican Republic", code: "+1" },
  { name: "Ecuador", code: "+593" },
  { name: "Egypt", code: "+20" },
  { name: "El Salvador", code: "+503" },
  { name: "Equatorial Guinea", code: "+240" },
  { name: "Eritrea", code: "+291" },
  { name: "Estonia", code: "+372" },
  { name: "Eswatini", code: "+268" },
  { name: "Ethiopia", code: "+251" },
  { name: "Fiji", code: "+679" },
  { name: "Finland", code: "+358" },
  { name: "France", code: "+33" },
  { name: "Gabon", code: "+241" },
  { name: "Gambia", code: "+220" },
  { name: "Georgia", code: "+995" },
  { name: "Germany", code: "+49" },
  { name: "Ghana", code: "+233" },
  { name: "Greece", code: "+30" },
  { name: "Grenada", code: "+1" },
  { name: "Guatemala", code: "+502" },
  { name: "Guinea", code: "+224" },
  { name: "Guinea-Bissau", code: "+245" },
  { name: "Guyana", code: "+592" },
  { name: "Haiti", code: "+509" },
  { name: "Honduras", code: "+504" },
  { name: "Hungary", code: "+36" },
  { name: "Iceland", code: "+354" },
  { name: "India", code: "+91" },
  { name: "Indonesia", code: "+62" },
  { name: "Iran", code: "+98" },
  { name: "Iraq", code: "+964" },
  { name: "Ireland", code: "+353" },
  { name: "Israel", code: "+972" },
  { name: "Italy", code: "+39" },
  { name: "Jamaica", code: "+1" },
  { name: "Japan", code: "+81" },
  { name: "Jordan", code: "+962" },
  { name: "Kazakhstan", code: "+7" },
  { name: "Kenya", code: "+254" },
  { name: "Kiribati", code: "+686" },
  { name: "Kuwait", code: "+965" },
  { name: "Kyrgyzstan", code: "+996" },
  { name: "Laos", code: "+856" },
  { name: "Latvia", code: "+371" },
  { name: "Lebanon", code: "+961" },
  { name: "Lesotho", code: "+266" },
  { name: "Liberia", code: "+231" },
  { name: "Libya", code: "+218" },
  { name: "Liechtenstein", code: "+423" },
  { name: "Lithuania", code: "+370" },
  { name: "Luxembourg", code: "+352" },
  { name: "Madagascar", code: "+261" },
  { name: "Malawi", code: "+265" },
  { name: "Malaysia", code: "+60" },
  { name: "Maldives", code: "+960" },
  { name: "Mali", code: "+223" },
  { name: "Malta", code: "+356" },
  { name: "Marshall Islands", code: "+692" },
  { name: "Mauritania", code: "+222" },
  { name: "Mauritius", code: "+230" },
  { name: "Mexico", code: "+52" },
  { name: "Micronesia", code: "+691" },
  { name: "Moldova", code: "+373" },
  { name: "Monaco", code: "+377" },
  { name: "Mongolia", code: "+976" },
  { name: "Montenegro", code: "+382" },
  { name: "Morocco", code: "+212" },
  { name: "Mozambique", code: "+258" },
  { name: "Myanmar", code: "+95" },
  { name: "Namibia", code: "+264" },
  { name: "Nauru", code: "+674" },
  { name: "Nepal", code: "+977" },
  { name: "Netherlands", code: "+31" },
  { name: "New Zealand", code: "+64" },
  { name: "Nicaragua", code: "+505" },
  { name: "Niger", code: "+227" },
  { name: "Nigeria", code: "+234" },
  { name: "North Korea", code: "+850" },
  { name: "North Macedonia", code: "+389" },
  { name: "Norway", code: "+47" },
  { name: "Oman", code: "+968" },
  { name: "Pakistan", code: "+92" },
  { name: "Palau", code: "+680" },
  { name: "Panama", code: "+507" },
  { name: "Papua New Guinea", code: "+675" },
  { name: "Paraguay", code: "+595" },
  { name: "Peru", code: "+51" },
  { name: "Philippines", code: "+63" },
  { name: "Poland", code: "+48" },
  { name: "Portugal", code: "+351" },
  { name: "Qatar", code: "+974" },
  { name: "Romania", code: "+40" },
  { name: "Russia", code: "+7" },
  { name: "Rwanda", code: "+250" },
  { name: "Saint Kitts and Nevis", code: "+1" },
  { name: "Saint Lucia", code: "+1" },
  { name: "Saint Vincent and the Grenadines", code: "+1" },
  { name: "Samoa", code: "+685" },
  { name: "San Marino", code: "+378" },
  { name: "Sao Tome and Principe", code: "+239" },
  { name: "Saudi Arabia", code: "+966" },
  { name: "Senegal", code: "+221" },
  { name: "Serbia", code: "+381" },
  { name: "Seychelles", code: "+248" },
  { name: "Sierra Leone", code: "+232" },
  { name: "Singapore", code: "+65" },
  { name: "Slovakia", code: "+421" },
  { name: "Slovenia", code: "+386" },
  { name: "Solomon Islands", code: "+677" },
  { name: "Somalia", code: "+252" },
  { name: "South Africa", code: "+27" },
  { name: "South Korea", code: "+82" },
  { name: "South Sudan", code: "+211" },
  { name: "Spain", code: "+34" },
  { name: "Sri Lanka", code: "+94" },
  { name: "Sudan", code: "+249" },
  { name: "Suriname", code: "+597" },
  { name: "Sweden", code: "+46" },
  { name: "Switzerland", code: "+41" },
  { name: "Syria", code: "+963" },
  { name: "Taiwan", code: "+886" },
  { name: "Tajikistan", code: "+992" },
  { name: "Tanzania", code: "+255" },
  { name: "Thailand", code: "+66" },
  { name: "Timor-Leste", code: "+670" },
  { name: "Togo", code: "+228" },
  { name: "Tonga", code: "+676" },
  { name: "Trinidad and Tobago", code: "+1" },
  { name: "Tunisia", code: "+216" },
  { name: "Turkey", code: "+90" },
  { name: "Turkmenistan", code: "+993" },
  { name: "Tuvalu", code: "+688" },
  { name: "Uganda", code: "+256" },
  { name: "Ukraine", code: "+380" },
  { name: "United Arab Emirates", code: "+971" },
  { name: "United Kingdom", code: "+44" },
  { name: "United States", code: "+1" },
  { name: "Uruguay", code: "+598" },
  { name: "Uzbekistan", code: "+998" },
  { name: "Vanuatu", code: "+678" },
  { name: "Vatican City", code: "+39" },
  { name: "Venezuela", code: "+58" },
  { name: "Vietnam", code: "+84" },
  { name: "Yemen", code: "+967" },
  { name: "Zambia", code: "+260" },
  { name: "Zimbabwe", code: "+263" }
];

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasRefParam = Boolean((searchParams.get("ref") ?? "").trim());
  const { data: session } = useSession();
  const [level, setLevel] = useState<number>(3);
  const [authOpen, setAuthOpen] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "signup" | "forgot">("login");
  const [authMessage, setAuthMessage] = useState<string>("");
  const [authLoading, setAuthLoading] = useState(false);
  const [signupStep, setSignupStep] = useState<"form" | "otp">("form");
  const [forgotStep, setForgotStep] = useState<"email" | "otp" | "reset">("email");
  const [signupResendCooldown, setSignupResendCooldown] = useState(0);
  const authFormRef = useRef<HTMLFormElement>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [fullName, setFullName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [nationalNumber, setNationalNumber] = useState("");
  const [country, setCountry] = useState("");
  const [email, setEmail] = useState("");
  const [referrerCode, setReferrerCode] = useState("");
  const [referrerName, setReferrerName] = useState("");
  const [referrerLookupLoading, setReferrerLookupLoading] = useState(false);
  const [referrerLookupMessage, setReferrerLookupMessage] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [showGrid, setShowGrid] = useState(false);
  const blockedNoticeHandledRef = useRef(false);
  const maxLevel = 33;
  const newAtLevel = (n: number) => Math.pow(2, n);
  const totalAtLevel = (n: number) => Math.pow(2, n + 1) - 1;
  const visibleNodes = useMemo(() => Math.min(totalAtLevel(level), 256), [level]);
  const gridCols = useMemo(() => Math.max(2, Math.floor(Math.sqrt(visibleNodes))), [visibleNodes]);
  const maxTotal = totalAtLevel(maxLevel);
  const pctOfMax = useMemo(() => Math.round((totalAtLevel(level) / maxTotal) * 100), [level, maxTotal]);
  const [vw, setVw] = useState(1024);
  useEffect(() => {
    const set = () => setVw(window.innerWidth || 1024);
    set();
    window.addEventListener("resize", set);
    return () => window.removeEventListener("resize", set);
  }, []);
  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(""), 2200);
    return () => clearTimeout(t);
  }, [toastMessage]);
  const maxColsByBreakpoint = vw >= 1536 ? 10 : vw >= 1280 ? 8 : vw >= 1024 ? 6 : vw >= 768 ? 4 : vw >= 640 ? 3 : 2;
  const gridColsResponsive = Math.min(maxColsByBreakpoint, Math.max(2, Math.floor(Math.sqrt(visibleNodes))));
  const testimonialsData = [
    {
      initials: "AK",
      name: "Ali Khan",
      city: "Karachi",
      text: "The level explorer made it easy to show new partners how the binary legs fill and why we focus on two strong directs.",
    },
    {
      initials: "MS",
      name: "Mehak Shah",
      city: "Lahore",
      text: "Signup with a referrer code was smooth. I can see my place in the plan and track activity from the member dashboard.",
    },
    {
      initials: "HF",
      name: "Haris Farooq",
      city: "Islamabad",
      text: "Deposits and withdrawals are clear. Having commission depth spelled out upfront avoids confusion with my downline.",
    },
  ];
  const [tIndex, setTIndex] = useState(0);
  const faqsData = [
    {
      q: "What is a binary MLM structure?",
      a: "Each member may place up to two people on their front line (left and right). Downline levels grow under those legs; the tree can be viewed many levels deep depending on platform settings.",
    },
    {
      q: "How many levels appear in the app?",
      a: "The network tree can display up to 33 levels so you can understand depth and placement. What counts for bonuses follows the official compensation rules in your back office.",
    },
    {
      q: "Which levels pay commissions?",
      a: "Commission-eligible depth is capped at the first 20 levels unless the company publishes a different rule. Deeper levels may show for structure only.",
    },
    {
      q: "How do I register?",
      a: "Use Sign Up with a valid email and, if you were invited, your referrer’s code so you are placed correctly in the binary tree.",
    },
    {
      q: "How do deposits and withdrawals work?",
      a: "Members fund their wallet and request withdrawals according to the platform’s verification and approval flow. Admins process approved payouts per policy.",
    },
    {
      q: "Can I use this on a phone?",
      a: "Yes. The member and admin experiences are responsive so you can review your team and account on mobile browsers.",
    },
  ];
  const [showPassword, setShowPassword] = useState(false);
  const [openFaqs, setOpenFaqs] = useState<number[]>([]);
  const toggleFaq = (i: number) =>
    setOpenFaqs((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));

  useEffect(() => {
    if (!authOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [authOpen]);

  useEffect(() => {
    const ref = (searchParams.get("ref") ?? "").trim();
    if (ref) {
      setReferrerCode(ref.toUpperCase());
      return;
    }
    setReferrerCode("");
    setReferrerName("");
    setReferrerLookupMessage("");
  }, [searchParams]);

  useEffect(() => {
    if (authMode !== "signup" || !hasRefParam) return;
    const code = referrerCode.trim().toUpperCase();
    if (!code) {
      setReferrerName("");
      setReferrerLookupMessage("");
      setReferrerLookupLoading(false);
      return;
    }
    const timer = window.setTimeout(async () => {
      setReferrerLookupLoading(true);
      setReferrerLookupMessage("");
      try {
        const res = await fetch(`/api/auth/register?referrerCode=${encodeURIComponent(code)}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as any;
        if (!res.ok) {
          setReferrerName("");
          setReferrerLookupMessage(typeof data?.error === "string" ? data.error : "Referrer not found");
          return;
        }
        setReferrerName(typeof data?.fullName === "string" ? data.fullName : "");
      } catch {
        setReferrerName("");
        setReferrerLookupMessage("Referrer lookup failed");
      } finally {
        setReferrerLookupLoading(false);
      }
    }, 150);

    return () => window.clearTimeout(timer);
  }, [authMode, hasRefParam, referrerCode]);

  useEffect(() => {
    const blocked = (searchParams.get("blocked") ?? "").trim();
    if (blocked !== "1") {
      blockedNoticeHandledRef.current = false;
      return;
    }
    if (blockedNoticeHandledRef.current) return;
    blockedNoticeHandledRef.current = true;
    setAuthMode("login");
    setAuthOpen(true);
    setAuthMessage(BLOCKED_MESSAGE);
  }, [searchParams]);

  useEffect(() => {
    if (!authOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAuthOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [authOpen]);

  useEffect(() => {
    if (signupResendCooldown <= 0) return;
    const t = window.setInterval(() => {
      setSignupResendCooldown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [signupResendCooldown]);

  const openLogin = () => {
    setAuthMessage("");
    setAuthMode("login");
    setSignupStep("form");
    setOtpCode("");
    setSignupResendCooldown(0);
    setAuthOpen(true);
  };

  const openSignup = () => {
    setAuthMessage("");
    setAuthMode("signup");
    setSignupStep("form");
    setOtpCode("");
    setSignupResendCooldown(0);
    setAuthOpen(true);
  };

  const isSignupForm = authMode === "signup" && signupStep === "form";

  return (
    <div className="min-h-screen max-w-[100vw] overflow-x-hidden bg-transparent font-sans text-foreground selection:bg-primary selection:text-white">
      <section className="relative isolate overflow-hidden">
        <div className="relative mx-auto max-w-7xl overflow-x-hidden px-4 pt-12 pb-12 sm:px-6 sm:pt-14 sm:pb-16">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center justify-between w-full sm:w-auto gap-3">
              <div className="flex items-center gap-3">
                <img src="/logo.jpeg" alt="Digital Community Magnet" className="h-9 w-auto rounded-md ring-1 ring-ring" />
                <div className="hidden items-center gap-4 lg:flex ml-4">
                  <Link href="/about" className="text-xs font-medium text-subtext transition hover:text-primary">About Us</Link>
                  <Link href="/terms" className="text-xs font-medium text-subtext transition hover:text-primary">Terms</Link>
                </div>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-card/80 px-4 py-2 ring-1 ring-ring backdrop-blur sm:flex">
                <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_12px_rgba(0,201,255,0.35)]" />
                <span className="text-[10px] sm:text-xs tracking-wide text-accent">Live</span>
              </div>
            </div>
            <div className="flex items-center justify-center sm:justify-end gap-3 w-full sm:w-auto">
              {session?.user ? (
                <>
                  <button
                    type="button"
                    onClick={() => router.push(session.user.status === "admin" ? "/admin" : "/dashboard")}
                    className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-medium text-white shadow-sm ring-1 ring-primary/20 transition hover:bg-primary/90"
                  >
                    Open Dashboard
                  </button>
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: getAuthRedirectUrl("/") })}
                    className="inline-flex items-center justify-center rounded-full bg-card px-5 py-2 text-sm font-medium text-foreground shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] transition hover:bg-muted"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={openLogin}
                    className="inline-flex items-center justify-center rounded-full bg-card px-5 py-2 text-sm font-medium text-foreground shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] transition hover:bg-muted"
                  >
                    Login
                  </button>
                  <button
                    type="button"
                    onClick={openSignup}
                    className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-medium text-white shadow-sm ring-1 ring-primary/20 transition hover:bg-primary/90"
                  >
                    Sign Up
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="mt-10 grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
            <div>
              <h1 className="max-w-4xl text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
                {BRAND_SLOGAN}
              </h1>
              <p className="mt-4 max-w-2xl text-pretty text-subtext">
                Sponsor up to two members on your front line. Your organisation can run 33 levels deep in the tree; commission-eligible depth follows platform rules—typically the first 20 levels.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <a className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-medium text-white shadow-sm ring-1 ring-primary/20 transition hover:bg-primary/90" href="#levels">
                  Get Started
                </a>
                <a className="inline-flex items-center justify-center rounded-full bg-card px-6 py-3 text-sm font-medium text-foreground shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] transition hover:bg-muted" href="#how-it-works">
                  Learn More
                </a>
              </div>
              <div className="mt-10 grid gap-6 sm:grid-cols-4">
                <div className="rounded-2xl bg-card p-4 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)]">
                  <div className="text-xs text-subtext">Directs</div>
                  <div className="mt-2 text-2xl font-semibold">2</div>
                </div>
                <div className="rounded-2xl bg-card p-4 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)]">
                  <div className="text-xs text-subtext">Levels</div>
                  <div className="mt-2 text-2xl font-semibold">20</div>
                </div>
                <div className="rounded-2xl bg-card p-4 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)]">
                  <div className="text-xs text-subtext">Growth</div>
                  <div className="mt-2 text-2xl font-semibold">1 → 2</div>
                </div>
                <div className="rounded-2xl bg-card p-4 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)]">
                  <div className="text-xs text-subtext">Plan type</div>
                  <div className="mt-2 text-2xl font-semibold">Binary</div>
                </div>
              </div>
            </div>
            <div className="rounded-3xl bg-card p-6 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)]">
              <div className="text-sm text-subtext">Plan snapshot</div>
              <div className="mt-2 text-2xl font-semibold">Binary network limits</div>
              <div className="mt-6 grid gap-4">
                <div className="flex items-center justify-between rounded-2xl bg-muted p-4 ring-1 ring-ring">
                  <span className="text-sm text-subtext">Direct slots (per member)</span>
                  <span className="text-lg font-semibold text-foreground">2</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-muted p-4 ring-1 ring-ring">
                  <span className="text-sm text-subtext">Tree depth (visible)</span>
                  <span className="text-lg font-semibold text-foreground">Up to 33</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-muted p-4 ring-1 ring-ring">
                  <span className="text-sm text-subtext">Commission depth</span>
                  <span className="text-lg font-semibold text-foreground">Levels 1–20</span>
                </div>
              </div>
              <div className="mt-6 rounded-2xl bg-muted p-4 ring-1 ring-ring">
                <div className="text-xs uppercase text-subtext">Payout window</div>
                <div className="mt-2 text-2xl font-semibold">First 20 levels</div>
                <div className="mt-3 text-sm text-subtext">
                  Volume and bonuses follow the compensation plan; deeper levels in the tree are for structure and reporting where enabled.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="levels" className="mx-auto mt-16 max-w-7xl px-4 pb-24 sm:mt-24 sm:px-6">
        <div className="rounded-3xl bg-muted p-6 ring-1 ring-ring sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Level explorer</h2>
              <p className="mt-1 text-sm text-subtext">See how many nodes appear at each binary level before you invite your team.</p>
            </div>
            <div className="flex w-full max-w-md items-center gap-4">
              <input
                type="range"
                min={0}
                max={maxLevel}
                value={level}
                onChange={(e) => {
                  setLevel(parseInt(e.target.value, 10));
                  setShowGrid(true);
                }}
                onMouseDown={() => setShowGrid(true)}
                onTouchStart={() => setShowGrid(true)}
                className="w-full accent-primary"
              />
              <div className="flex w-20 items-center justify-center rounded-md bg-card px-3 py-2 text-sm ring-1 ring-ring">
                L{level}
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            <div className="rounded-2xl bg-card p-5 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)]">
              <div className="text-sm text-subtext">Total nodes at L{level}</div>
              <div className="mt-1 text-2xl font-semibold">{totalAtLevel(level).toLocaleString()}</div>
            </div>
            <div className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-ring">
              <div className="text-sm text-subtext">New nodes on L{level}</div>
              <div className="mt-1 text-2xl font-semibold">{newAtLevel(level).toLocaleString()}</div>
            </div>
            <div className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-ring">
              <div className="text-sm text-subtext">% of L{maxLevel}</div>
              <div className="mt-1 text-2xl font-semibold">{pctOfMax}%</div>
            </div>
          </div>

          <div className="mt-8 rounded-2xl bg-card p-5 ring-1 ring-ring">
            {showGrid ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-subtext">Visual Preview</div>
                  <div className="text-xs text-subtext">Showing up to L{level}</div>
                </div>
                <div className="mt-5 max-h-[600px] overflow-y-auto">
                  <TreePreview depth={level} />
                </div>
                <div className="mt-6 h-3 w-full rounded-full bg-muted ring-1 ring-ring">
                  <div className="h-3 rounded-full bg-primary" style={{ width: `${Math.min(100, pctOfMax)}%` }} />
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-muted p-8 text-center ring-1 ring-ring">
                <div className="text-sm text-subtext">Move the slider to preview levels</div>
                <button
                  type="button"
                  onClick={() => setShowGrid(true)}
                  className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-medium text-white shadow-sm ring-1 ring-primary/20 transition hover:bg-primary/90"
                >
                  Show Preview
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
        <div className="rounded-3xl bg-muted p-6 ring-1 ring-ring sm:p-8">
          <h2 className="text-2xl font-semibold">How it works</h2>
          <p className="mt-2 max-w-3xl text-sm text-subtext">
            Three steps to participate in this binary MLM programme: get placed, fund your wallet if required, and build two strong legs.
          </p>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            <div className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-ring">
              <div className="text-sm text-subtext">1 · Join &amp; placement</div>
              <div className="mt-1 text-lg">Sign up with a referrer code so you are added left or right in their binary tree.</div>
            </div>
            <div className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-ring">
              <div className="text-sm text-subtext">2 · Network depth</div>
              <div className="mt-1 text-lg">Your organisation can grow many levels deep; bonuses typically follow levels 1–20.</div>
            </div>
            <div className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-ring">
              <div className="text-sm text-subtext">3 · Wallet &amp; payouts</div>
              <div className="mt-1 text-lg">Deposit, track commissions, and withdraw according to verification and admin approval.</div>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-medium text-white shadow-sm ring-1 ring-primary/20 transition hover:bg-primary/90" href="#levels">
              Explore Levels
            </a>
            <a className="inline-flex items-center justify-center rounded-full bg-card px-6 py-3 text-sm font-medium text-foreground shadow-sm ring-1 ring-ring transition hover:bg-background" href="#">
              Contact
            </a>
          </div>
        </div>
      </section>

      <section id="faqs" className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
        <div className="rounded-3xl bg-card p-6 shadow-sm ring-1 ring-ring sm:p-8">
          <h2 className="text-2xl font-semibold">FAQs</h2>
          <div className="mt-6">
            {faqsData.map((item, i) => {
              const open = openFaqs.includes(i);
              return (
                <div key={i} className="rounded-2xl bg-muted ring-1 ring-ring mb-4">
                  <button
                    type="button"
                    onClick={() => toggleFaq(i)}
                    className="flex w-full items-center justify-between px-5 py-4 text-left"
                    aria-expanded={open}
                  >
                    <span className="text-base font-medium text-foreground">{item.q}</span>
                    <span className="rounded-full bg-card px-3 py-1 text-sm text-subtext ring-1 ring-ring">
                      {open ? "Hide" : "Show"}
                    </span>
                  </button>
                  <div
                    className={`px-5 transition-[max-height,opacity] duration-300 ease-out ${open ? "max-h-40 opacity-100" : "max-h-0 opacity-0"}`}
                  >
                    <div className="pb-4 text-sm text-subtext">{item.a}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="testimonials" className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
        <div className="rounded-3xl bg-card p-6 shadow-sm ring-1 ring-ring sm:p-8">
          <h2 className="text-2xl font-semibold">Testimonials</h2>
          <div className="mt-6 relative overflow-hidden rounded-2xl bg-muted ring-1 ring-ring">
            <div
              className="flex w-full transition-transform duration-500 ease-out"
              style={{ transform: `translateX(-${tIndex * 100}%)` }}
            >
              {testimonialsData.map((t, i) => (
                <div key={i} className="w-full shrink-0 p-6 sm:px-14">
                  <div className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-ring">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
                        {t.initials}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">{t.name}</div>
                        <div className="text-xs text-subtext">{t.city}</div>
                      </div>
                    </div>
                    <div className="mt-4 text-sm text-subtext">{t.text}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-2">
              {testimonialsData.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setTIndex(i)}
                  className={`h-2 w-2 rounded-full ${tIndex === i ? "bg-primary" : "bg-ring"}`}
                  aria-label={`Slide ${i + 1}`}
                />
              ))}
            </div>
            <div className="absolute inset-y-0 left-0 flex items-center">
              <button
                type="button"
                onClick={() => setTIndex((idx) => (idx - 1 + testimonialsData.length) % testimonialsData.length)}
                className="ml-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-card text-foreground ring-1 ring-ring transition hover:bg-background"
                aria-label="Previous"
              >
                ‹
              </button>
            </div>
            <div className="absolute inset-y-0 right-0 flex items-center">
              <button
                type="button"
                onClick={() => setTIndex((idx) => (idx + 1) % testimonialsData.length)}
                className="mr-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-card text-foreground ring-1 ring-ring transition hover:bg-background"
                aria-label="Next"
              >
                ›
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-7xl px-6 pb-12">
        <div className="flex flex-col items-center justify-between gap-6 rounded-3xl bg-muted p-8 text-sm text-subtext ring-1 ring-ring sm:flex-row">
          <div className="flex flex-col items-center gap-2 sm:items-start">
            <div className="text-lg font-bold text-foreground">Digital Community Magnet</div>
            <div>© {new Date().getFullYear()} All rights reserved</div>
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 font-medium">
            <Link href="/about" className="transition hover:text-primary">About Us</Link>
            <Link href="/terms" className="transition hover:text-primary">Terms & Conditions</Link>
            <button 
              type="button" 
              onClick={() => { setAuthMode("signup"); setAuthOpen(true); }} 
              className="transition hover:text-primary"
            >
              Join Network
            </button>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-2 ring-1 ring-ring">
            <span className="h-3 w-3 animate-pulse rounded-full bg-primary shadow-[0_0_10px_rgba(0,178,163,0.35)]" />
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">Live Platform</span>
          </div>
        </div>
      </footer>

      {authOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-label={authMode === "login" ? "Login" : "Sign up"}
        >
          <button
            type="button"
            onClick={() => setAuthOpen(false)}
            className="absolute inset-0 bg-background/95 backdrop-blur-2xl backdrop-saturate-50 dark:bg-neutral-950/95"
            aria-label="Close"
          />
          {toastMessage ? (
            <div className="fixed right-6 top-6 z-50 rounded-2xl bg-card px-4 py-3 text-sm font-medium text-foreground shadow-lg ring-1 ring-ring">
              {toastMessage}
            </div>
          ) : null}
          <div className={`relative w-full rounded-3xl bg-card p-6 shadow-2xl ring-1 ring-ring transition-all duration-300 ${isSignupForm ? "max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar" : "max-w-md"}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-2xl font-semibold">
                  {authMode === "login" ? "Login" : 
                   authMode === "signup" ? "Create Account" : 
                   "Reset Password"}
                </div>
                <div className="mt-1 text-sm text-subtext">
                  {authMode === "login" ? "Access your account." : 
                   authMode === "signup" ? "Create a new account." : 
                   "Reset your password."}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAuthOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground ring-1 ring-ring transition hover:bg-secondary"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1 ring-1 ring-ring">
              <button
                type="button"
                onClick={() => {
                  setAuthMessage("");
                  setAuthMode("login");
                  setSignupStep("form");
                  setForgotStep("email");
                  setOtpCode("");
                }}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${authMode === "login" ? "bg-card text-foreground shadow-sm" : "text-subtext hover:text-foreground"}`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMessage("");
                  setAuthMode("signup");
                  setSignupStep("form");
                  setForgotStep("email");
                  setOtpCode("");
                }}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${authMode === "signup" ? "bg-card text-foreground shadow-sm" : "text-subtext hover:text-foreground"}`}
              >
                Sign Up
              </button>
            </div>

            <form
              ref={authFormRef}
              className="mt-6 grid gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (authLoading) return;
                setAuthMessage("");
                setAuthLoading(true);
                try {
                  if (authMode === "login") {
                    if (!email.trim()) { setAuthMessage("Email is required"); setAuthLoading(false); return; }
                    if (!password.trim()) { setAuthMessage("Password is required"); setAuthLoading(false); return; }

                    const result = await signIn("credentials", {
                      email,
                      password,
                      redirect: false,
                    });
                    if (result?.error) {
                      try {
                        const statusRes = await fetch("/api/auth/account-status", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ email }),
                        });
                        const statusData = (await statusRes.json()) as any;
                        if (statusData?.status === "blocked") {
                          setAuthMessage(typeof statusData?.message === "string" ? statusData.message : BLOCKED_MESSAGE);
                          return;
                        }
                      } catch {}
                      setAuthMessage("Invalid credentials");
                      return;
                    }
                    markSessionTabActive();
                    setAuthOpen(false);
                    router.push("/dashboard");
                    return;
                  }

                  if (authMode === "forgot") {
                    if (forgotStep === "email") {
                      if (!email.trim()) { setAuthMessage("Email is required"); setAuthLoading(false); return; }
                      const otpRes = await fetch("/api/user/request-otp", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email, purpose: "password_reset" }),
                      });
                      const otpData = (await otpRes.json()) as any;
                      if (!otpRes.ok) {
                        setAuthMessage(typeof otpData?.error === "string" ? otpData.error : "OTP request failed");
                        return;
                      }
                      setForgotStep("otp");
                      setAuthMessage("OTP sent to your email. Please enter the code.");
                      return;
                    }

                    if (forgotStep === "otp") {
                      if (!otpCode.trim()) { setAuthMessage("OTP is required"); setAuthLoading(false); return; }
                      const verifyRes = await fetch("/api/user/verify-otp", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email, purpose: "password_reset", code: otpCode }),
                      });
                      const verifyData = (await verifyRes.json()) as any;
                      if (!verifyRes.ok) {
                        setAuthMessage(typeof verifyData?.error === "string" ? verifyData.error : "OTP verification failed");
                        return;
                      }
                      setForgotStep("reset");
                      setAuthMessage("OTP verified. Please enter your new password.");
                      return;
                    }

                    if (forgotStep === "reset") {
                      if (!newPassword.trim()) { setAuthMessage("New password is required"); setAuthLoading(false); return; }
                      if (!confirmNewPassword.trim()) { setAuthMessage("Please confirm your password"); setAuthLoading(false); return; }
                      if (newPassword !== confirmNewPassword) {
                        setAuthMessage("New passwords do not match");
                        return;
                      }
                      const resetRes = await fetch("/api/user/reset-password", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email, newPassword, code: otpCode }),
                      });
                      const resetData = (await resetRes.json()) as any;
                      if (!resetRes.ok) {
                        setAuthMessage(typeof resetData?.error === "string" ? resetData.error : "Password reset failed");
                        return;
                      }
                      setToastMessage("Password updated");
                      toast.success("Password updated");
                      setAuthMessage("Password reset successfully. You can now login with your new password.");
                      setAuthMode("login");
                      setForgotStep("email");
                      setNewPassword("");
                      setConfirmNewPassword("");
                      setOtpCode("");
                      return;
                    }
                  }

                  if (authMode === "signup") {
                    if (signupStep === "form") {
                      // Explicit field validation
                      if (!fullName.trim()) { setAuthMessage("Full name is required"); return; }
                      if (!email.trim()) { setAuthMessage("Email address is required"); return; }
                      if (!country.trim()) { setAuthMessage("Please select a country"); return; }
                      if (!nationalNumber.trim()) { setAuthMessage("Mobile number is required"); return; }
                      if (!password.trim()) { setAuthMessage("Password is required"); return; }
                      if (!confirmPassword.trim()) { setAuthMessage("Please confirm your password"); return; }

                      if (password !== confirmPassword) {
                        setAuthMessage("Passwords do not match");
                        return;
                      }
                      if (!acceptedTerms) {
                        setAuthMessage("Please agree to the terms and conditions");
                        return;
                      }
                      if (hasRefParam && referrerCode.trim() && !referrerName.trim()) {
                        setAuthMessage("Please enter a valid referral code");
                        return;
                      }
                      setOtpCode("");
                      setSignupStep("otp");
                      setAuthMessage("Creating your account and sending the code…");
                      const phoneFull = `${countryCode} ${nationalNumber}`.trim();
                      const regRes = await fetch("/api/auth/register", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          fullName,
                          phone: phoneFull,
                          country,
                          email,
                          password,
                          referrerCode: hasRefParam && referrerCode.trim() ? referrerCode.trim().toUpperCase() : undefined,
                          acceptedTerms,
                        }),
                      });
                      const regData = (await regRes.json()) as any;
                      if (!regRes.ok) {
                        setSignupStep("form");
                        setAuthMessage(typeof regData?.error === "string" ? regData.error : "Signup failed");
                        return;
                      }
                      if (regData?.otpSent === true) {
                        setSignupResendCooldown(60);
                        setAuthMessage("OTP sent to your email. Enter the code below.");
                        return;
                      }
                      const otpRes = await fetch("/api/user/request-otp", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email, purpose: "registration" }),
                      });
                      const otpData = (await otpRes.json()) as any;
                      if (!otpRes.ok) {
                        setSignupStep("form");
                        setAuthMessage(typeof otpData?.error === "string" ? otpData.error : "Failed to send OTP");
                        return;
                      }
                      setSignupResendCooldown(60);
                      setAuthMessage("OTP sent to your email. Enter the code below.");
                      return;
                    }

                    if (!otpCode.trim()) { setAuthMessage("OTP is required"); setAuthLoading(false); return; }
                    const verifyRes = await fetch("/api/user/verify-otp", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ email, purpose: "registration", code: otpCode }),
                    });
                    const verifyData = (await verifyRes.json()) as any;
                    if (!verifyRes.ok) {
                      setAuthMessage(typeof verifyData?.error === "string" ? verifyData.error : "OTP verification failed");
                      return;
                    }
                    const result = await signIn("credentials", { email, password, redirect: false });
                    if (result?.error) {
                      setAuthMessage("Account created, but login failed");
                      return;
                    }
                    markSessionTabActive();
                    setSignupResendCooldown(0);
                    setAuthOpen(false);
                    router.push("/dashboard");
                  }
                } finally {
                  setAuthLoading(false);
                }
              }}
            >
              {isSignupForm ? (
                <>
                  {hasRefParam ? (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="grid gap-2">
                          <span className="text-sm font-medium text-foreground">Referral code</span>
                          <input
                            type="text"
                            value={referrerCode}
                            readOnly
                            className="h-11 w-full rounded-2xl bg-background px-4 text-sm uppercase text-foreground ring-1 ring-ring outline-none"
                            placeholder="SAMAR786"
                          />
                        </label>
                        <label className="grid gap-2">
                          <span className="text-sm font-medium text-foreground">Referral name</span>
                          <input
                            type="text"
                            value={referrerLookupLoading ? "Loading..." : referrerName}
                            readOnly
                            className="h-11 w-full rounded-2xl bg-background px-4 text-sm text-foreground ring-1 ring-ring outline-none"
                            placeholder="Referral name"
                          />
                        </label>
                      </div>
                      {referrerLookupMessage ? <div className="text-xs text-red-500">{referrerLookupMessage}</div> : null}
                    </>
                  ) : null}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-sm font-medium text-foreground">Full name</span>
                      <input
                        required
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="h-11 w-full rounded-2xl bg-background px-4 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="Your full name"
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-medium text-foreground">Email address</span>
                      <input
                        required
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-11 w-full rounded-2xl bg-background px-4 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="name@email.com"
                      />
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-sm font-medium text-foreground">Country</span>
                      <select
                        required
                        value={country}
                        onChange={(e) => {
                          const selectedCountry = e.target.value;
                          setCountry(selectedCountry);
                          const dialCode = COUNTRIES.find(c => c.name === selectedCountry)?.code || "";
                          setCountryCode(dialCode);
                        }}
                        className="h-11 w-full rounded-2xl bg-background px-4 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        <option value="">Select country</option>
                        {COUNTRIES.map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name} ({c.code})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-medium text-foreground">Mobile Number</span>
                      <div className="flex h-11 w-full items-center rounded-2xl bg-background text-foreground ring-1 ring-ring focus-within:ring-2 focus-within:ring-primary/30">
                        <span className="px-4 text-sm text-subtext">{countryCode || "+--"}</span>
                        <input
                          required
                          type="tel"
                          value={nationalNumber}
                          onChange={(e) => {
                            const filtered = e.target.value.replace(/[^0-9\s]/g, "");
                            setNationalNumber(filtered);
                          }}
                          className="flex-1 bg-transparent px-1 text-sm outline-none"
                          placeholder="300 1234567"
                        />
                      </div>
                    </label>
                  </div>
                </>
              ) : null}

              {(authMode === "login" || (authMode === "forgot" && forgotStep === "email")) ? (
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-foreground">Email</span>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 w-full rounded-2xl bg-background px-4 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="name@email.com"
                  />
                </label>
              ) : null}

              {(authMode === "login" || isSignupForm) ? (
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-foreground">Password</span>
                  <div className="relative">
                    <input
                      required
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 w-full rounded-2xl bg-background px-4 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center px-4 text-subtext"
                    >
                      {showPassword ? <FaEyeSlash /> : <FaEye />}
                    </button>
                  </div>
                </label>
              ) : null}

              {isSignupForm ? (
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-foreground">Confirm password</span>
                  <div className="relative">
                    <input
                      required
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="h-11 w-full rounded-2xl bg-background px-4 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center px-4 text-subtext"
                    >
                      {showPassword ? <FaEyeSlash /> : <FaEye />}
                    </button>
                  </div>
                </label>
              ) : null}

              {isSignupForm ? (
                <label className="flex items-start gap-3 rounded-2xl bg-muted px-4 py-3 text-sm text-foreground ring-1 ring-ring">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-ring"
                  />
                  <span>I agree to the terms and conditions</span>
                </label>
              ) : null}

              {((authMode === "signup" && signupStep === "otp") || (authMode === "forgot" && forgotStep === "otp")) ? (
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-foreground">OTP Code</span>
                  <input
                    required
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    disabled={authLoading}
                    value={otpCode}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                      setOtpCode(v);
                      if (authLoading) return;
                      const otpStep =
                        (authMode === "signup" && signupStep === "otp") ||
                        (authMode === "forgot" && forgotStep === "otp");
                      if (v.length === 6 && otpStep) {
                        window.setTimeout(() => authFormRef.current?.requestSubmit(), 0);
                      }
                    }}
                    className="h-11 w-full rounded-2xl bg-background px-4 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
                    placeholder="123456"
                  />
                </label>
              ) : null}
              {authMode === "signup" && signupStep === "otp" ? (
                <button
                  type="button"
                  disabled={authLoading || signupResendCooldown > 0}
                  onClick={async () => {
                    if (!email.trim() || signupResendCooldown > 0) return;
                    setAuthMessage("");
                    setAuthLoading(true);
                    try {
                      const otpRes = await fetch("/api/user/request-otp", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email, purpose: "registration" }),
                      });
                      const otpData = (await otpRes.json()) as any;
                      if (!otpRes.ok) {
                        setAuthMessage(typeof otpData?.error === "string" ? otpData.error : "Failed to send OTP");
                        return;
                      }
                      setSignupResendCooldown(60);
                      setAuthMessage("OTP sent again. Check your email.");
                    } finally {
                      setAuthLoading(false);
                    }
                  }}
                  className="w-full rounded-2xl bg-muted py-2.5 text-sm font-medium text-foreground ring-1 ring-ring transition hover:bg-muted/80 disabled:opacity-50"
                >
                  {signupResendCooldown > 0 ? `Resend OTP in ${signupResendCooldown}s` : "Resend OTP"}
                </button>
              ) : null}

              {authMode === "forgot" && forgotStep === "reset" ? (
                <>
                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-foreground">New Password</span>
                    <div className="relative">
                      <input
                        required
                        type={showPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="h-11 w-full rounded-2xl bg-background px-4 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 flex items-center px-4 text-subtext"
                      >
                        {showPassword ? <FaEyeSlash /> : <FaEye />}
                      </button>
                    </div>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-foreground">Confirm New Password</span>
                    <div className="relative">
                      <input
                        required
                        type={showPassword ? "text" : "password"}
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        className="h-11 w-full rounded-2xl bg-background px-4 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 flex items-center px-4 text-subtext"
                      >
                        {showPassword ? <FaEyeSlash /> : <FaEye />}
                      </button>
                    </div>
                  </label>
                </>
              ) : null}

              {authMessage ? (
                <div className="rounded-2xl bg-muted p-4 text-sm text-subtext ring-1 ring-ring">{authMessage}</div>
              ) : null}

              <button
                type="submit"
                disabled={authLoading}
                className="mt-1 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-white shadow-sm ring-1 ring-primary/20 transition hover:bg-primary/90 disabled:opacity-60"
              >
                {authMode === "login" ? "Login" : 
                 authMode === "signup" ? (signupStep === "form" ? "Create an account" : "Verify OTP") : 
                 forgotStep === "email" ? "Next" :
                 forgotStep === "otp" ? "Verify OTP" : "Update Password"}
              </button>

              <div className="text-center text-sm text-subtext">
                {authMode === "login" ? (
                  <>
                    <button type="button" onClick={openSignup} className="font-medium text-foreground underline underline-offset-4">
                      New here? Create an account
                    </button>
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMessage("");
                          setAuthMode("forgot");
                          setForgotStep("email");
                          setOtpCode("");
                          setNewPassword("");
                          setConfirmNewPassword("");
                        }}
                        className="font-medium text-foreground underline underline-offset-4"
                      >
                        Forgot your password?
                      </button>
                    </div>
                  </>
                ) : authMode === "signup" ? (
                  <button type="button" onClick={openLogin} className="font-medium text-foreground underline underline-offset-4">
                    Already have an account? Login
                  </button>
                ) : (
                  <button type="button" onClick={openLogin} className="font-medium text-foreground underline underline-offset-4">
                    Back to Login
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-transparent" />}>
      <HomeContent />
    </Suspense>
  );
}

function TreePreview({ depth }: { depth: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320); // Responsive default
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      if (el.clientWidth > 0) {
        setW(el.clientWidth);
      }
    };
    update();
    const timer = setTimeout(update, 100);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      clearTimeout(timer);
    };
  }, []);
  const visibleDepth = Math.min(depth, 7);
  const rowH = 84;
  const padY = 20;
  const iconSize = 24;
  const rows = useMemo(() => {
    const r: Array<Array<{ x: number; y: number; idx: number }>> = [];
    for (let level = 0; level <= visibleDepth; level += 1) {
      const count = Math.pow(2, level);
      const y = padY + level * rowH;
      const pts = Array.from({ length: count }, (_, idx) => ({
        x: Math.round(w * ((idx + 1) / (count + 1))),
        y,
        idx,
      }));
      r.push(pts);
    }
    return r;
  }, [visibleDepth, w]);
  const svgW = w;
  const svgH = padY + visibleDepth * rowH + 20;
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (let l = 0; l < rows.length - 1; l += 1) {
    const parents = rows[l];
    const children = rows[l + 1];
    for (let i = 0; i < parents.length; i += 1) {
      const p = parents[i];
      const cL = children[i * 2];
      const cR = children[i * 2 + 1];
      lines.push({ x1: p.x, y1: p.y + iconSize / 2, x2: cL.x, y2: cL.y - iconSize / 2 });
      lines.push({ x1: p.x, y1: p.y + iconSize / 2, x2: cR.x, y2: cR.y - iconSize / 2 });
    }
  }
  return (
    <div ref={ref} className="relative mt-5 w-full overflow-hidden">
      <svg width={svgW} height={svgH} className="block" style={{ maxWidth: "100%" }}>
        {lines.map((ln, idx) => (
          <line
            key={idx}
            x1={ln.x1}
            y1={ln.y1}
            x2={ln.x2}
            y2={ln.y2}
            stroke="var(--ring)"
            strokeWidth={1.5}
          />
        ))}
      </svg>
      <div className="absolute inset-0">
        {rows.flatMap((row, l) =>
          row.map((pt, i) => (
            <div
              key={`n-${l}-${i}`}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: pt.x, top: pt.y }}
              title={`L${l} · Node ${i + 1}`}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 ring-1 ring-ring">
                <FaUser className="text-foreground" size={16} />
              </div>
            </div>
          )),
        )}
      </div>

      {depth > visibleDepth ? (
        <div className="mt-6 rounded-2xl bg-muted p-4 ring-1 ring-ring">
          <div className="text-xs text-subtext">Deep Levels (L{visibleDepth + 1} to L{depth}) · Compact Binary View</div>
          <div className="mt-3 grid gap-3">
            {Array.from({ length: depth - visibleDepth }, (_, i) => {
              const level = visibleDepth + i + 1;
              const nodes = Math.pow(2, level);
              return (
                <div key={level} className="rounded-xl bg-card px-3 py-3 ring-1 ring-ring">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-foreground">Level {level}</div>
                    <div className="text-xs text-subtext">{nodes.toLocaleString()} nodes</div>
                  </div>
                  <div className="mt-3 flex items-center justify-center gap-4">
                    <div className="flex items-center justify-center rounded-full bg-primary/15 p-1.5 ring-1 ring-ring">
                      <FaUser className="text-foreground" size={14} />
                    </div>
                    <div className="h-px w-8 bg-ring" />
                    <div className="flex items-center justify-center rounded-full bg-primary/15 p-1.5 ring-1 ring-ring">
                      <FaUser className="text-foreground" size={14} />
                    </div>
                    <div className="h-px w-8 bg-ring" />
                    <div className="flex items-center justify-center rounded-full bg-primary/15 p-1.5 ring-1 ring-ring">
                      <FaUser className="text-foreground" size={14} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
