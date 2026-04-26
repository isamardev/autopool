/**
 * Binary plan (see terms: two front-line slots; depth d needs 2^d members for a “full” level).
 * Returns the largest k such that for every depth 1..k, downline count at that depth is ≥ 2^d.
 * Matches `/api/user/referral-stats` depth numbering (L1 = directs).
 */
export function computeBinaryLevelsCompleted(
  countAtDepth: Record<string, number>,
  maxDepth = 20,
): number {
  let completed = 0;
  for (let d = 1; d <= maxDepth; d += 1) {
    const need = 2 ** d;
    const c = countAtDepth[String(d)] ?? 0;
    if (c >= need) completed = d;
    else break;
  }
  return completed;
}
