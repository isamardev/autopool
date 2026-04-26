"use client";

import { useEffect, useState } from "react";
import type { IconType } from "react-icons";
import {
  FaFacebook,
  FaTwitter,
  FaInstagram,
  FaYoutube,
  FaTelegramPlane,
  FaWhatsapp,
} from "react-icons/fa";
import { toast } from "react-toastify";
import { WHATSAPP_CHANNEL_URL } from "@/lib/support-links";
import { poolApiFetch } from "@/lib/pool-api-fetch";
import { usePoolDashboard } from "@/components/digital-pool/usePoolDashboard";
import { PoolHomeThreeEntries } from "@/components/digital-pool/PoolHomeThreeEntries";

const POOL_STAT_PLACEHOLDER_COUNT = 8;

function EmptyPoolStatCard() {
  return (
    <div className="flex min-h-[100px] flex-col rounded-2xl bg-card p-4 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] sm:min-h-[112px] sm:p-5">
      <div className="flex flex-1 items-center justify-center text-sm text-subtext/35" aria-hidden>
        —
      </div>
    </div>
  );
}

const SOCIAL_LINKS: Array<{ href: string; Icon: IconType; name: string }> = [
  { href: "https://facebook.com", Icon: FaFacebook, name: "Facebook" },
  { href: "https://twitter.com", Icon: FaTwitter, name: "Twitter" },
  { href: "https://instagram.com", Icon: FaInstagram, name: "Instagram" },
  { href: "https://youtube.com", Icon: FaYoutube, name: "YouTube" },
  { href: "https://t.me", Icon: FaTelegramPlane, name: "Telegram" },
  { href: WHATSAPP_CHANNEL_URL, Icon: FaWhatsapp, name: "WhatsApp" },
];

const poolWalletUsd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0,
  );

export function PoolHomeHero() {
  const { snapshot, loading, refresh } = usePoolDashboard();
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [teamNodes, setTeamNodes] = useState<any[] | null>(null);
  const [viewerDirectReferrals, setViewerDirectReferrals] = useState<any[]>([]);
  const [poolNetworkInfo, setPoolNetworkInfo] = useState<{ error: string | null; status: number | null }>({
    error: null,
    status: null,
  });
  /** my-network said L1 reward already applied or granted this response — tree leg count can still look under 3 on the client. */
  const [poolL1DoneFromNetwork, setPoolL1DoneFromNetwork] = useState(false);

  const profile = snapshot?.profile;

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/digital-pool/my-network", { cache: "no-store", credentials: "include" });
        const data = (await res.json().catch(() => ({}))) as {
          nodes?: unknown;
          viewerDirectReferrals?: unknown;
          /** Server: 3+ pool legs OR L1 reward already stored — client tree se independent. */
          viewerDigitalPoolL1Complete?: boolean;
          digitalPoolEligibleLegs?: number;
          digitalPoolRawDirectQualified?: number;
          digitalPoolL1Reward?: {
            granted?: boolean;
            alreadyGranted?: boolean;
            eligibleLegs?: number;
            rawDirectQualified?: number;
          };
          error?: string;
        };
        const msg = typeof data?.error === "string" ? data.error : "Request failed";

        if (res.ok && Array.isArray(data?.nodes)) {
          setTeamNodes(data.nodes as any[]);
          setViewerDirectReferrals(Array.isArray(data?.viewerDirectReferrals) ? (data.viewerDirectReferrals as any[]) : []);
          setPoolNetworkInfo({ error: null, status: res.status });
          const l1r = data.digitalPoolL1Reward;
          const legsFromApi =
            (typeof data.digitalPoolEligibleLegs === "number" && data.digitalPoolEligibleLegs >= 3) ||
            (typeof l1r?.eligibleLegs === "number" && l1r.eligibleLegs >= 3);
          const directsFromApi =
            (typeof data.digitalPoolRawDirectQualified === "number" && data.digitalPoolRawDirectQualified >= 3) ||
            (typeof l1r?.rawDirectQualified === "number" && l1r.rawDirectQualified >= 3);
          if (
            l1r?.granted ||
            l1r?.alreadyGranted ||
            data.viewerDigitalPoolL1Complete === true ||
            legsFromApi ||
            directsFromApi
          ) {
            setPoolL1DoneFromNetwork(true);
          }
          if (data.digitalPoolL1Reward?.granted) {
            toast.success("$100 Digital Pool withdraw wallet mein credit ho gaye — level 1 complete");
          }
          void refresh();
        } else {
          setTeamNodes([]);
          setViewerDirectReferrals([]);
          setPoolNetworkInfo({ error: msg, status: res.status });
          toast.error(
            res.status === 401
              ? "Pool network: session khatam — /digital-pool/login se dubara login karein"
              : `${msg} (HTTP ${res.status})`,
          );
        }
      } catch {
        setTeamNodes([]);
        setViewerDirectReferrals([]);
        setPoolNetworkInfo({ error: "Network / server error", status: null });
        toast.error("Pool network load nahi hui — page refresh ya connection check karein");
      }
    };
    void load();
  }, []);

  if (loading && !snapshot) {
    return (
      <div className="rounded-3xl bg-card p-8 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring">
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-10 w-56 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-4 max-w-xl animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="rounded-3xl bg-card p-8 text-sm text-subtext shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring">
        Dashboard data load nahi ho saka — page refresh karein ya dubara login karein.
      </div>
    );
  }

  const grantedRaw = (profile as { digitalPoolL1RewardGrantedAt?: unknown }).digitalPoolL1RewardGrantedAt;
  const poolL1FromProfile =
    grantedRaw != null &&
    grantedRaw !== "" &&
    !(typeof grantedRaw === "string" && grantedRaw.trim() === "") &&
    String(grantedRaw).toLowerCase() !== "null";
  const poolWithdrawBal = Number((profile as { digitalPoolWithdrawBalance?: unknown }).digitalPoolWithdrawBalance ?? 0);
  /** Same amount as L1 credit in `lib/digital-pool-l1-reward.ts` ($100). */
  const poolL1FromWallet = Number.isFinite(poolWithdrawBal) && poolWithdrawBal >= 99.99;
  const level1CompleteServerHint = poolL1FromProfile || poolL1DoneFromNetwork || poolL1FromWallet;

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl bg-card p-6 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm text-subtext">Welcome back</div>
            <div className="mt-1 text-2xl font-semibold text-foreground">{profile.username ?? "User"}</div>
            <div className="mt-2 max-w-2xl text-sm text-subtext">
              Your balances, team stats, and activity will show here.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSupportOpen(true)}
              className="inline-flex w-full items-center justify-center rounded-full bg-card px-5 py-2 text-sm font-medium text-foreground shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:bg-muted hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] sm:w-auto"
            >
              Support
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 xs:grid-cols-3 sm:grid-cols-4 lg:grid-cols-6">
          {SOCIAL_LINKS.map(({ href, Icon, name }) => (
            <a
              key={name}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-muted p-4 text-center ring-1 ring-ring transition hover:bg-background"
              aria-label={name}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-card ring-1 ring-ring text-foreground">
                <Icon size={22} />
              </div>
              <div className="text-xs text-subtext">{name}</div>
            </a>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: POOL_STAT_PLACEHOLDER_COUNT }, (_, i) => (
            <EmptyPoolStatCard key={i} />
          ))}
        </div>
      </div>

      <div className="rounded-3xl bg-card p-5 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] sm:p-6">
        <div className="text-xs font-medium uppercase tracking-wide text-subtext">Digital Pool withdraw wallet</div>
        <div className="mt-1 text-2xl font-bold text-foreground">
          {poolWalletUsd(Number((profile as any)?.digitalPoolWithdrawBalance ?? 0))}
        </div>
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-subtext">
          Digital Pool level 1 complete par total <span className="font-medium text-foreground">$300</span> package:{" "}
          <span className="font-medium text-foreground">$100</span> yahan Digital Pool withdraw wallet mein (main panel
          wallet se alag), aur <span className="font-medium text-foreground">$100 + $100</span> ki do entries{" "}
          <span className="font-medium text-foreground">aap ki Position 1</span> ke neeche tree mein. Withdraw yahi balance
          se — <span className="font-medium text-foreground">Withdraw</span> page.
        </p>
      </div>

      <PoolHomeThreeEntries
        teamNodes={teamNodes}
        viewerUsername={profile.username ?? "User"}
        viewerKey={String((profile as { id?: string }).id ?? "")}
        viewerDirectReferrals={viewerDirectReferrals}
        poolNetworkInfo={poolNetworkInfo}
        level1CompleteServerHint={level1CompleteServerHint}
      />

      {supportOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8" role="dialog" aria-modal="true" aria-label="Support">
          <button type="button" onClick={() => setSupportOpen(false)} className="absolute inset-0 bg-black/30" aria-label="Close" />
          <div className="relative w-full max-w-md rounded-3xl bg-card p-6 shadow-xl ring-1 ring-ring">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-2xl font-semibold text-foreground">Support</div>
                <div className="mt-1 text-sm text-subtext">Submit payment or account related issues.</div>
              </div>
              <button
                type="button"
                onClick={() => setSupportOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground ring-1 ring-ring transition hover:bg-secondary"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form
              className="mt-6 grid gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const res = await poolApiFetch("/api/user/support", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ subject: supportSubject, message: supportMessage }),
                  });
                  const data = await res.json();
                  if (!res.ok) {
                    toast.error(typeof data?.error === "string" ? data.error : "Support failed");
                    return;
                  }
                  toast.success("Ticket submitted");
                  setSupportSubject("");
                  setSupportMessage("");
                  setSupportOpen(false);
                } catch {
                  toast.error("Support failed");
                }
              }}
            >
              <label className="grid gap-2">
                <span className="text-sm font-medium text-foreground">Subject</span>
                <input
                  required
                  value={supportSubject}
                  onChange={(e) => setSupportSubject(e.target.value)}
                  className="h-11 w-full rounded-2xl bg-background px-4 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Payment pending"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-foreground">Message</span>
                <textarea
                  required
                  value={supportMessage}
                  onChange={(e) => setSupportMessage(e.target.value)}
                  className="min-h-[120px] w-full rounded-2xl bg-background px-4 py-3 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Details..."
                />
              </label>
              <button
                type="submit"
                className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-white shadow-sm ring-1 ring-primary/20 transition hover:bg-primary/90"
              >
                Submit
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
