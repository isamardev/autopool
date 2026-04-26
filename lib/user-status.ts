/** User has completed activation (or is admin); MLM / dashboard treats them as an active member. */
export function isActivatedMemberStatus(s: string | undefined | null): boolean {
  return s === "active" || s === "admin" || s === "withdraw_suspend";
}
