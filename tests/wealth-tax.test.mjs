import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {dailyWealthTax} from '../src/data/wealth-tax.ts';
import {Store} from '../src/data/store.ts';

test('5万ptを保護し、超過分の3%だけ減らして端数・負債・大きな値を正確に扱う',()=>{
  for(const [points,tax]of [[-1000000n,0n],[0n,0n],[3000n,0n],[28001n,0n],[50000n,0n],[50001n,0n],[50033n,0n],[50034n,1n],[50066n,1n],[50067n,2n],[50099n,2n],[50100n,3n],[100000n,1500n],[1000000n,28500n],
    [1694205n,49326n],[514795n,13943n],[424140n,11224n],[219764n,5092n]])assert.equal(dailyWealthTax(points),tax);
  assert.equal(dailyWealthTax(10n**110n),(10n**110n-50000n)*3n/100n);
  let last=0n;
  for(let points=49900n;points<=50200n;points++) {
    const tax=dailyWealthTax(points);
    assert.ok(tax>=last&&tax-last<=1n);assert.ok(points-tax>=49900n);last=tax;
  }
});

test('毎日の調整をDBへ一度だけ反映し、Bot除外・再起動・日本時間の日付境界を守る',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'wealth-tax-'));let store=new Store('',dir);
  const day=new Date('2026-10-24T00:00:00Z');
  try {
    await store.initialize();
    await store.reward('tax-fixture',{'1':1694205n,'2':100000n,'3':50000n,'4':28001n,'5':-1000000n,'6':50099n,'999':10000000n});
    assert.equal(await store.wealthTax('999',day),3);
    assert.equal(await store.balance('1'),1644879n);assert.equal(await store.balance('2'),98500n);
    assert.equal(await store.balance('3'),50000n);assert.equal(await store.balance('4'),28001n);
    assert.equal(await store.balance('5'),-1000000n);assert.equal(await store.balance('6'),50097n);assert.equal(await store.balance('999'),10000000n);
    await store.close();store=new Store('',dir);await store.initialize();
    assert.equal(await store.wealthTax('999',new Date('2026-10-24T14:59:59Z')),0);
    assert.equal(await store.balance('2'),98500n);
    const results=await Promise.all([store.wealthTax('999',new Date('2026-10-24T15:00:00Z')),store.wealthTax('999',new Date('2026-10-24T15:00:01Z'))]);
    assert.deepEqual(results.sort(),[0,3]);assert.equal(await store.balance('2'),97045n);
  }finally{await store.close();await rm(dir,{recursive:true,force:true});}
});

test('3%の調整を毎日端数切り捨てで適用した1週間・30日後の残高を確認する',()=>{
  let balance=1694205n;
  for(let day=1;day<=30;day++) {
    balance-=dailyWealthTax(balance);
    if(day===7)assert.equal(balance,1378492n);
  }
  assert.equal(balance,709347n);
});
