import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/data/store.ts';
import {Economy} from '../src/commands/economy.ts';
import {bankruptcyBanUntil,bankruptcyNextDate} from '../src/data/bankruptcy.ts';

test('破産は借金中のみ・90日間は再破産不可・14日間のギャンブル禁止が付く',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'bankruptcy-')),store=new Store('',dir);
  const now=new Date('2026-10-24T15:00:00Z');
  try {
    await store.initialize();
    await store.reward('seed',{'1':-44312649627603978n,'2':1000n});
    await assert.rejects(store.bankrupt('2',now),/借金していない/);
    const result=await store.bankrupt('1',now);
    assert.equal(result.debt,-44312649627603978n);
    assert.equal(result.times,1);assert.equal(result.lastDate,'2026-10-25');
    assert.equal(await store.balance('1'),0n);
    assert.equal(bankruptcyBanUntil('2026-10-25'),'2026-11-08');
    assert.equal(bankruptcyNextDate('2026-10-25'),'2027-01-23');
    await store.reward('again',{'1':-100n});
    await assert.rejects(store.bankrupt('1',now),/再破産できません/);
    const second=await store.bankrupt('1',new Date(now.getTime()+91*86_400_000));
    assert.equal(second.times,2);assert.equal(await store.balance('1'),0n);
  } finally {await store.close();await rm(dir,{recursive:true,force:true});}
});

test('破産直後はギャンブル・betが拒否される',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'bankruptcy-ban-')),store=new Store('',dir);
  try {
    await store.initialize();
    await store.reward('seed',{'2':-5000n});
    const economy=new Economy(store,()=>'999');
    try {
      await store.bankrupt('2');
      const ctx={user:{id:'2'},text:()=>'',send:async()=>({}),guild:null};
      await assert.rejects(economy.run('gamble',ctx),/ギャンブル・betを利用できません/);
      await assert.rejects(economy.run('bet',ctx),/ギャンブル・betを利用できません/);
    } finally {economy.close();}
  } finally {await store.close();await rm(dir,{recursive:true,force:true});}
});

test('破産コマンドは借金がないと拒否し、借金中なら確認カードを開く',async()=>{
  let payload;const store={balance:async()=>0n,bankruptcyLast:async()=>undefined};
  const economy=new Economy(store,()=>'999');
  try {
    const ctx={user:{id:'1'},text:()=>'',send:async p=>{payload=p;},guild:null,target:async()=>undefined};
    await assert.rejects(economy.run('bankrupt',ctx),/借金していない/);
    store.balance=async()=>-5000n;
    await economy.run('bankrupt',ctx);
    const text=JSON.stringify(payload);
    assert.match(text,/自己破産の確認/);assert.match(text,/破産する/);assert.match(text,/14日間/);
  } finally {economy.close();}
});
