import assert from 'node:assert/strict';
import {test} from 'node:test';
import {MessageFlags} from 'discord.js';
import {Economy} from '../src/commands/economy.ts';
import {Context} from '../src/commands/context.ts';
import {UserError} from '../src/errors.ts';

function interaction(customId='again:gamble:owner') {
  const events=[];
  const message={id:'response',channelId:'channel',components:[]};
  const i={id:'operation',customId,user:{id:'owner'},channelId:'channel',client:{},
    deferred:false,replied:false,ephemeral:false,clock:0,events,
    channel:{sendTyping:async()=>{throw new Error('A component must be acknowledged, not send typing.');}},
    async deferReply(options) {events.push('ack');this.deferred=true;this.ephemeral=Boolean(options?.flags&MessageFlags.Ephemeral);},
    async editReply(payload) {assert.equal(this.deferred,true);events.push('edit');this.payload=payload;return message;},
    async reply() {events.push('late reply');throw Object.assign(new Error('Unknown interaction'),{code:10062});},
    async fetchReply() {return message;},
  };
  return i;
}
function findId(payload,prefix) {
  for(const c of payload.components[0].toJSON().components)if(c.type===1)for(const button of c.components)if(button.custom_id?.startsWith(prefix))return button.custom_id;
  throw new Error('Missing button');
}

test('もう一度betは3秒を超えるDB処理より先に受付応答し、結果を新しい返信へ編集する',async()=>{
  let repeating=false,dbCalls=0;
  const i=interaction(),events=new Set();
  const account={points:1000n};
  const economy=new Economy({
    accounts:async(_ids,work)=>{
      dbCalls++;
      if(repeating){assert.deepEqual(i.events,['cooldown','ack']);i.events.push('database');i.clock=4000;}
      return work(new Map([['owner',account]]),{});
    },
    once:async(_c,key)=>{if(events.has(key))return false;events.add(key);return true;},
  },()=> 'bot');
  try {
    let original;
    await economy.run('bet',{user:{id:'owner'},channelId:'channel',id:'seed',text:()=> '10',send:async payload=>{original=payload;}});
    i.customId=findId(original,'again:bet:');repeating=true;
    await economy.repeat(i,kind=>{assert.equal(kind,'bet');i.events.push('cooldown');});
    assert.deepEqual(i.events,['cooldown','ack','database','edit']);assert.equal(dbCalls,2);
    assert.match(JSON.stringify(i.payload),/ダイスベット結果/);assert.equal(i.ephemeral,false);
  } finally {economy.close();}
});

test('もう一度ギャンブルも受付応答を先に返し、遅い残高取得後に確認カードを返す',async()=>{
  const i=interaction();let queries=0;
  const economy=new Economy({account:async()=>{queries++;assert.equal(i.deferred,true);i.events.push('database');i.clock=4500;return {points:500n,gambleCount:0,gambleDate:null};}},()=> 'bot');
  try {
    await economy.repeat(i,()=>{});
    assert.deepEqual(i.events,['ack','database','edit']);assert.equal(queries,1);
    assert.match(JSON.stringify(i.payload),/ハイリスクギャンブル/);assert.ok(findId(i.payload,'eco:confirm:'));
  } finally {economy.close();}
});

test('受付が失敗した操作・他人の再実行・クールダウン中はDBやポイントを変更しない',async()=>{
  let queries=0;
  const economy=new Economy({account:async()=>{queries++;throw new Error('Should not query');},accounts:async()=>{queries++;throw new Error('Should not change points');}},()=> 'bot');
  try {
    const expired=interaction();expired.deferReply=async()=>{throw Object.assign(new Error('Unknown interaction'),{code:10062});};
    await assert.rejects(economy.repeat(expired,()=>{}),error=>error.code===10062);
    const other=interaction();other.user.id='other';
    await assert.rejects(economy.repeat(other,()=>{}),/最初にコマンドを実行した人専用/);assert.deepEqual(other.events,[]);
    const cooldown=interaction();
    await assert.rejects(economy.repeat(cooldown,()=>{throw new UserError('クールダウン中です。');}),/クールダウン/);assert.deepEqual(cooldown.events,[]);
    assert.equal(queries,0);
  } finally {economy.close();}
});

test('Contextのボタン受付は二重送信せず、本人限定の返信設定を維持する',async()=>{
  const i=interaction(),ctx=new Context(i,i.client);
  await ctx.prepare(true);await ctx.prepare(true);
  assert.deepEqual(i.events,['ack']);assert.equal(i.ephemeral,true);
  await ctx.error('操作を確認してください。');assert.deepEqual(i.events,['ack','edit']);
});
