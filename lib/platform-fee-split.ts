/**
 * Withdrawals charge WITHDRAW_FEE_PERCENT (10%) of gross; that fee is split:
 * - 10% of the fee → charity
 * - 90% of the fee → platform fee pool
 * (MLM / admin commission from payouts is separate and does not go here.)
 */
export function splitWithdrawalFeeToCharityAndFeePool(feeAmount: number): { charity: number; feePool: number } {
  const f = Number(Math.max(0, feeAmount).toFixed(2));
  if (f <= 0) return { charity: 0, feePool: 0 };
  const charity = Number((f * 0.1).toFixed(2));
  const feePool = Number((f - charity).toFixed(2));
  return { charity, feePool };
}
