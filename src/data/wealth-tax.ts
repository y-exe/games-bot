export const wealthTaxAllowance=50_000n;

export function dailyWealthTax(points:bigint) {
  return points>wealthTaxAllowance?(points-wealthTaxAllowance)/100n:0n;
}
