import assert from 'node:assert/strict';
import {test} from 'node:test';
import {stakeBounds,rollGamble,diceDelta} from '../src/data/gamble.ts';

test('借金中は最低100ptと最大98%返済の賭け金を使い、少額と割合の境界が連続する',()=>{
  for(const [balance,min,max]of [
    [0n,100n,100n],[-1n,100n,100n],[-100n,100n,100n],
    [-927n,100n,100n],[-928n,100n,101n],[-999n,100n,108n],[-1000n,100n,108n],
    [-2000n,100n,217n],[-2019n,100n,219n],[-2020n,101n,219n],
    [-10000n,500n,1088n],[-1000000n,50000n,108888n],
  ])assert.deepEqual(stakeBounds(balance),{min,max});
  const huge=10n**110n;
  assert.deepEqual(stakeBounds(-huge),{min:huge/20n,max:huge*98n/900n});
});

test('借金を大きくしても最高の当たりで高額のプラス残高へ飛び越えない',()=>{
  const highest=(min,max)=>max;
  for(const debt of [...Array.from({length:10001},(_,i)=>BigInt(i)),1000000n,10n**110n]) {
    const units=[0,0.999999,0];
    const result=rollGamble(-debt,highest,()=>units.shift());
    assert.equal(result.multiplier,1000);
    const bestBalance=-debt+result.delta;
    assert.ok(bestBalance<=900n);
    if(debt>=1000n) {
      assert.ok(result.delta*100n<=debt*98n);
      assert.ok(debt*98n-result.delta*100n<900n);
      assert.ok(bestBalance<0n);
    }
  }
  const units=[0,0.999999,0];
  const jackpot=rollGamble(-1000000n,highest,()=>units.shift());
  assert.equal(jackpot.multiplier,1000);assert.equal(-1000000n+jackpot.delta,-20008n);
  const smallUnits=[0,0.999999,0];
  const comeback=rollGamble(-100n,highest,()=>smallUnits.shift());
  assert.equal(-100n+comeback.delta,800n);
});

test('全残高で同じ倍率分布と当たり抽選を使い、負け側の精算も実際の賭け金と一致する',()=>{
  for(const balance of [-1000000n,-100n,0n,1n,1000000n])for(const [roll,expected]of [[0,501],[0.019,501],[0.02,301],[0.149,301],[0.15,151],[0.999,151]]) {
    for(const positive of [false,true]) {
      const units=[roll,0,positive?0:0.999999];
      const result=rollGamble(balance,()=>2n,()=>units.shift());
      assert.equal(result.multiplier,positive?expected:-expected);
      assert.equal(result.delta,result.stake*BigInt(result.multiplier)/100n-result.stake);
    }
  }
  const units=[0,0.999999,0.999999];
  const loss=rollGamble(-1000000n,()=>108888n,()=>units.shift());
  assert.equal(-1000000n+loss.delta,-2197768n);
});

test('当たり確率は帯ごとに72%・62%・57%付近で、期待値はほぼ0になる',()=>{
  const seed=start=>{let state=start>>>0;return()=>{state=(state*1664525+1013904223)>>>0;return state/2**32;};};
  for(const [roll,winRate] of [[0.5,0.7217],[0.1,0.6248],[0.01,0.5666]]) {
    let wins=0,delta=0n;const plays=40000;
    const rand=seed(Math.floor(roll*1e6)+1);
    for(let i=0;i<plays;i++) {
      const u1=rand(),u2=rand(),u3=rand();
      const lower=roll<.02?5.01:roll<.15?3.01:1.51,upper=roll<.02?10:roll<.15?5:3;
      const sign=u3<(roll<.02?.5666:roll<.15?.6248:.7217)?1:-1;
      const baseValue=lower+(upper-lower)*u2;
      const stake=1000n,multiplier=Math.round(baseValue*sign*100);
      delta+=stake*BigInt(multiplier)/100n-stake;
      if(sign>0)wins++;
    }
    const observed=wins/plays;
    assert.ok(Math.abs(observed-winRate)<0.02,`当たり率 ${observed} が期待 ${winRate} から逸脱`);
    const perStake=Number(delta)/(1000*plays);
    assert.ok(Math.abs(perStake)<0.05,`期待値の偏りが大きい: ${perStake}`);
  }
});

test('プラス残高の賭け金とBetの配当は従来どおりで固定上限を付けない',()=>{
  for(const balance of [1n,2n,3n,1000n,1000000n,10n**110n])assert.deepEqual(stakeBounds(balance),{min:balance/3n||1n,max:balance});
  assert.deepEqual([1,2,3,4,5,6].map(dice=>diceDelta(100n,dice)),[-100n,-50n,-50n,0n,50n,100n]);
});
