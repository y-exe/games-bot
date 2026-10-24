import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/data/store.ts';
import {loginReward,loginDay,loginForecast,nextLoginTime} from '../src/data/login.ts';
import {taxScheduler} from '../src/services/tax.ts';
import {Economy,loginForecastCard} from '../src/commands/economy.ts';

test('通常報酬を保ち、5・10日目の特典を予測にも含めて10日周期・受取忘れを扱う',()=>{
  assert.equal(loginReward(1,-1),30n);assert.equal(loginReward(1,1),60n);
  assert.equal(loginReward(5,-1),120n);assert.equal(loginReward(5,1),150n);
  assert.equal(loginReward(10,-1),220n);assert.equal(loginReward(10,1),250n);
  const now=new Date('2026-10-24T14:59:59Z');
  assert.equal(loginDay('2026-10-23',10,now),1);
  assert.equal(loginDay('2026-10-22',7,now),1);
  assert.equal(nextLoginTime(now).toISOString(),'2026-10-24T15:00:00.000Z');
  const forecast=loginForecast('2026-10-24',4,1,now);
  assert.equal(forecast[0].days,5);assert.equal(forecast[0].points,150n);
  assert.equal(forecast[5].days,10);assert.equal(forecast[5].points,250n);
  assert.equal(forecast[6].days,1);assert.equal(forecast[6].points,60n);
  const pending=JSON.stringify(loginForecastCard(undefined,1,'owner',now));
  const received=JSON.stringify(loginForecastCard({lastLogin:'2026-10-24',consecutive:4},1,'owner',now));
  assert.match(pending,/今日の受取で免除/);assert.match(received,/翌日0時の徴収.*免除/);
});

test('翌日分だけを免除し、日付変更直後の受取・二重受取・再起動でも徴収と免除がずれない',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'login-exemption-'));let store=new Store('',dir);
  const before=new Date('2026-10-24T14:59:59Z'),midnight=new Date('2026-10-24T15:00:00Z');
  try {
    await store.initialize();await store.reward('seed',{'1':100000n,'2':100000n,'3':100000n});
    const simultaneous=await Promise.all([store.login('1','999',before),store.login('1','999',before)]);
    assert.equal(simultaneous.filter(result=>result.received).length,1);
    const first=simultaneous.find(result=>result.received);
    assert.equal(first.taxExemptDate,'2026-10-25');assert.equal(first.balance,98927n);
    assert.equal(await store.balance('2'),98867n);
    const duplicate=await store.login('1','999',before);
    assert.equal(duplicate.received,false);assert.equal(duplicate.points,0n);assert.equal(duplicate.balance,first.balance);
    await store.close();store=new Store('',dir);await store.initialize();
    const [next,late]=await Promise.all([store.login('1','999',midnight),store.login('2','999',midnight)]);
    assert.equal(next.balance,98997n);assert.equal(next.taxExemptDate,'2026-10-26');
    assert.equal(late.balance,97799n);assert.equal(late.taxExemptDate,'2026-10-26');
    assert.equal(await store.balance('3'),97749n);
    assert.equal(await store.wealthTax('999',midnight),0);
    const following=new Date('2026-10-25T15:00:00Z');
    assert.equal(await store.wealthTax('999',following),1);
    assert.equal(await store.balance('1'),98997n);assert.equal(await store.balance('2'),97799n);
    const dueAgain=new Date('2026-10-26T15:00:00Z');
    assert.equal(await store.wealthTax('999',dueAgain),3);
    assert.ok(await store.balance('1')<98997n);
  }finally{await store.close();await rm(dir,{recursive:true,force:true});}
});

test('導入前のログボ受取記録も移行し、翌日の免除に利用する',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'login-migration-'));let store=new Store('',dir);
  try {
    await store.initialize();await store.reward('seed',{'1':100000n});
    await store.accounts(['1'],a=>{a.get('1').lastLogin='2026-10-24';a.get('1').consecutive=4;});
    await store.close();store=new Store('',dir);await store.initialize();
    const result=await store.login('1','999',new Date('2026-10-24T15:00:00Z'));
    assert.equal(result.days,5);assert.equal(result.points,150n);assert.equal(result.balance,100150n);
    const records=await store.transaction(c=>c.query('SELECT tax_date FROM games_bot_tax_exemptions WHERE user_id=1 ORDER BY tax_date'));
    assert.deepEqual(records.map(r=>r.tax_date),['2026-10-25','2026-10-26']);
  }finally{await store.close();await rm(dir,{recursive:true,force:true});}
});

test('ログボの受取画面に、特典込みの報酬と翌日0時の免除を表示する',async()=>{
  let payload;const economy=new Economy({login:async()=>({received:true,points:250n,days:10,balance:100250n,rank:1,taxExemptDate:'2026-10-25'})},()=> '999');
  try {
    await economy.run('login',{user:{id:'1'},send:async p=>{payload=p;}});
    const text=JSON.stringify(payload);assert.match(text,/250pt/);assert.match(text,/100pt.*込み/);assert.match(text,/翌日0時の徴収.*免除/);
  }finally{economy.close();}
});

test('徴収を起動時と日本時間0時に実行し、停止後には再予約しない',async()=>{
  let clock=new Date('2026-10-24T14:59:59Z');const calls=[],timers=[],cancelled=[];
  const stop=taxScheduler({wealthTax:async(bot,now)=>{calls.push({bot,at:now.toISOString()});}},()=> 'bot',{
    now:()=>clock,schedule:(run,wait)=>{const timer={run,wait,unref(){}};timers.push(timer);return timer;},cancel:timer=>cancelled.push(timer),
  });
  try {
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls.length,1);assert.equal(timers[0].wait,1000);
    clock=new Date('2026-10-24T15:00:00Z');timers[0].run();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls[1].at,'2026-10-24T15:00:00.000Z');assert.equal(timers[1].wait,86400000);
  }finally{stop();}
  assert.equal(cancelled.length,1);
});

test('徴収処理中に0時を越えた場合は、新しい日付分を直後に確認する',async()=>{
  let clock=new Date('2026-10-24T14:59:59Z');const timers=[];
  const stop=taxScheduler({wealthTax:async()=>{clock=new Date('2026-10-24T15:00:01Z');}},()=> 'bot',{
    now:()=>clock,schedule:(run,wait)=>{const timer={run,wait,unref(){}};timers.push(timer);return timer;},cancel:()=>{},
  });
  try{await new Promise(resolve=>setImmediate(resolve));assert.equal(timers[0].wait,0);}finally{stop();}
});

test('徴収に失敗した場合は1分後に再試行し、成功後は次の0時に戻る',async()=>{
  const timers=[];let attempts=0;
  const stop=taxScheduler({wealthTax:async()=>{if(++attempts===1)throw new Error('retry test');}},()=> 'bot',{
    now:()=>new Date('2026-10-24T15:00:00Z'),schedule:(run,wait)=>{const timer={run,wait,unref(){}};timers.push(timer);return timer;},cancel:()=>{},
  });
  try {
    await new Promise(resolve=>setImmediate(resolve));assert.equal(timers[0].wait,60000);
    timers[0].run();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(attempts,2);assert.equal(timers[1].wait,86400000);
  }finally{stop();}
});
