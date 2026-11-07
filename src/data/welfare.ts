export const welfareMin=100n,welfareMax=1000n;

// 借金の10%を毎日のログボ受取時に上乗せ(最低100pt・上限1,000pt)
export function dailyWelfare(debt:bigint) {
  if(debt<=0n)return 0n;
  const amount=debt/10n;
  return amount>welfareMax?welfareMax:amount<welfareMin?welfareMin:amount;
}
