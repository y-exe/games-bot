export const wealthTaxThreshold=10_000n;
const firstBand=1_360_000n,secondBand=1_780_000n;

export function dailyWealthTax(points:bigint) {
  if(points<wealthTaxThreshold)return 0n;
  const firstBandTax=firstBand*3n/100n;
  if(points>secondBand)return firstBandTax+(secondBand-firstBand)*5n/100n+(points-secondBand)*6n/100n;
  if(points>firstBand)return firstBandTax+(points-firstBand)*5n/100n;
  const range=firstBand-wealthTaxThreshold;
  return points*(range+2n*(points-wealthTaxThreshold))/(100n*range);
}
