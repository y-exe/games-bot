import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {dailyWealthTax} from '../src/data/wealth-tax.ts';
import {Store} from '../src/data/store.ts';
import {Economy} from '../src/commands/economy.ts';
import {jstDate} from '../src/data/login.ts';

test('1万ptから段階的に徴収し、136万・178万ptの超過分だけに高い税率を適用する',()=>{
  for(const [points,tax]of [[-1000000n,0n],[0n,0n],[9999n,0n],[10000n,100n],[28001n,287n],[50000n,529n],[50099n,530n],[100000n,1133n],[500000n,8629n],[1000000n,24666n],
    [1360000n,40800n],[1360001n,40800n],[1694205n,57510n],[1780000n,61800n],[1780001n,61800n],[2000000n,75000n],[5000000n,255000n]])assert.equal(dailyWealthTax(points),tax);
  assert.equal(dailyWealthTax(10n**110n),61800n+(10n**110n-1780000n)*6n/100n);
  for(const boundary of [1360000n,1780000n]) {
    let last=dailyWealthTax(boundary-201n),lastBalance=boundary-201n-last;
    for(let points=boundary-200n;points<=boundary+200n;points++) {
      const tax=dailyWealthTax(points);
      assert.ok(tax>=last&&tax-last<=1n);assert.ok(points-tax>=lastBalance);
      last=tax;lastBalance=points-tax;
    }
  }
});

test('毎日の調整をDBへ一度だけ反映し、Bot除外・再起動・日本時間の日付境界を守る',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'wealth-tax-'));let store=new Store('',dir);
  const day=new Date('2026-10-24T00:00:00Z');
  try {
    await store.initialize();
    await store.reward('tax-fixture',{'1':1694205n,'2':100000n,'3':50000n,'4':28001n,'5':-1000000n,'6':50099n,'7':10000n,'8':9999n,'999':10000000n});
    assert.equal(await store.wealthTax('999',day),6);
    assert.equal(await store.balance('1'),1636695n);assert.equal(await store.balance('2'),98867n);
    assert.equal(await store.balance('3'),49471n);assert.equal(await store.balance('4'),27714n);
    assert.equal(await store.balance('5'),-1000000n);assert.equal(await store.balance('6'),49569n);assert.equal(await store.balance('999'),10000000n);
    assert.equal(await store.balance('7'),9900n);assert.equal(await store.balance('8'),9999n);
    await store.close();store=new Store('',dir);await store.initialize();
    assert.equal(await store.wealthTax('999',new Date('2026-10-24T14:59:59Z')),0);
    assert.equal(await store.balance('2'),98867n);
    const results=await Promise.all([store.wealthTax('999',new Date('2026-10-24T15:00:00Z')),store.wealthTax('999',new Date('2026-10-24T15:00:01Z'))]);
    assert.deepEqual(results.sort(),[0,5]);assert.equal(await store.balance('2'),97749n);
  }finally{await store.close();await rm(dir,{recursive:true,force:true});}
});

test('累進徴収を毎日端数切り捨てで適用した1週間・30日後の残高を確認する',()=>{
  let balance=1694205n;
  for(let day=1;day<=30;day++) {
    balance-=dailyWealthTax(balance);
    if(day===7)assert.equal(balance,1347234n);
  }
  assert.equal(balance,753852n);
});

test('pointに累進徴収の目安と翌日免除・対象外を正しく表示する',async()=>{
  for(const [points,lastLogin,expected]of [[1694205n,null,/57,510pt/],[2000000n,null,/75,000pt/],[10000n,null,/100pt/],[9999n,null,/対象外（1万pt未満）/],[5000000n,jstDate(),/免除（ログボ受取済み）/]]) {
    let payload;
    const store={balance:async()=>points,ranking:async()=>[],rank:async()=>1,poorRanking:async()=>[],account:async()=>({lastLogin})};
    const economy=new Economy(store,()=> '999');
    try {
      await economy.run('point',{user:{id:'1'},send:async value=>{payload=value;}});
      assert.match(JSON.stringify(payload),expected);
    }finally{economy.close();}
  }
});
