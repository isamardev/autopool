/**
 * "Today" window for admin commission stats. Uses IANA zone when
 * `ADMIN_STATS_TZ` is set (e.g. Asia/Karachi); otherwise UTC midnight–midnight.
 */

function ymdInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addOneCalendarDayYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** First UTC instant where the calendar date in `timeZone` equals `ymd`. */
function firstInstantForYmd(ymd: string, timeZone: string, anchorMs: number): Date {
  const at = (t: number) => ymdInTimeZone(new Date(t), timeZone);
  let lo = anchorMs - 72 * 3600 * 1000;
  let hi = anchorMs + 72 * 3600 * 1000;
  while (at(lo) >= ymd) lo -= 24 * 3600 * 1000;
  while (at(hi) < ymd) hi += 24 * 3600 * 1000;
  for (let i = 0; i < 56; i++) {
    const mid = Math.floor((lo + hi) / 2);
    if (at(mid) >= ymd) hi = mid;
    else lo = mid + 1;
  }
  return new Date(lo);
}

export type AdminStatsDayWindow = {
  start: Date;
  endExclusive: Date;
  timeZone: string;
  label: string;
};

/**
 * Returns [start, endExclusive) for the current calendar day in the configured zone.
 */
export function getAdminStatsDayWindow(now: Date = new Date()): AdminStatsDayWindow {
  const raw = process.env.ADMIN_STATS_TZ?.trim();
  const timeZone = raw && raw.length > 0 ? raw : "UTC";
  const anchor = now.getTime();

  if (timeZone === "UTC") {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    const endExclusive = new Date(start.getTime() + 24 * 3600 * 1000);
    return {
      start,
      endExclusive,
      timeZone: "UTC",
      label: "UTC calendar day",
    };
  }

  const todayYmd = ymdInTimeZone(now, timeZone);
  const start = firstInstantForYmd(todayYmd, timeZone, anchor);
  const nextYmd = addOneCalendarDayYmd(todayYmd);
  const endExclusive = firstInstantForYmd(nextYmd, timeZone, anchor);

  return {
    start,
    endExclusive,
    timeZone,
    label: `${timeZone} calendar day`,
  };
}
