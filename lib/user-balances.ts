/** Main (commission) wallet + USDT (main) wallet — both can fund activation. */
export async function getUserMainAndUsdtBalance(db: any, userId: string): Promise<{ main: number; usdt: number }> {
  try {
    const rows = (await db.$queryRawUnsafe(
      `SELECT COALESCE(balance,0) as b, COALESCE("usdtBalance",0) as u FROM "User" WHERE id = $1`,
      userId,
    )) as Array<Record<string, unknown>>;
    if (rows?.[0]) {
      const r = rows[0];
      return {
        main: Number(r.b ?? 0),
        usdt: Number(r.u ?? 0),
      };
    }
  } catch {
    try {
      const rows = (await db.$queryRawUnsafe(
        `SELECT COALESCE(balance,0) as b, COALESCE(usdtbalance,0) as u FROM "User" WHERE id = $1`,
        userId,
      )) as Array<Record<string, unknown>>;
      if (rows?.[0]) {
        return { main: Number(rows[0].b ?? 0), usdt: Number(rows[0].u ?? 0) };
      }
    } catch {
      /* fall through */
    }
  }
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { balance: true },
  });
  return { main: Number(u?.balance ?? 0), usdt: 0 };
}
