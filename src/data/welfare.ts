export const welfareMin=100n,welfareMax=1000n;

// 借金中の生活保護: 借金の5〜約10.89%から抽選(高めが出やすい)。低めに外れると少なめ(失敗)。
// まれに借金の30〜50%を一気に返せる大当たりが出て、借金が大きく回復することもある。
export function dailyWelfare(debt:bigint,rng:()=>number=Math.random) {
  if(debt<=0n)return 0n;
  const roll=rng();
  if(roll<0.06)return debt*BigInt(Math.round((0.3+0.2*rng())*1000))/1000n;
  const percent=roll<0.21?0.02+0.03*rng():0.05+0.0589*(rng()**0.6);
  const amount=debt*BigInt(Math.round(percent*1000))/1000n;
  return amount>welfareMax?welfareMax:amount<welfareMin?welfareMin:amount;
}
