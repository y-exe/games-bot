import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MessageFlags} from 'discord.js';
import {Store} from '../src/data/store.ts';
import {Economy} from '../src/commands/economy.ts';
import {rankingExportResponse} from '../src/ui/rankings.ts';
import {resolveRankingUsers,rememberRankingUser} from '../src/services/ranking-users.ts';

test('1000人の未登録・期限経過した名前でもDiscordへの一括取得を行わない',async()=>{
  let calls=0;
  const client={users:{cache:new Map(),fetch:async()=>{calls++;throw new Error('一括取得禁止');}}};
  const store={rankingUsers:async()=>[{user_id:'1',display_name:'保存済み',username:'saved',fetched_at:'2020-01-01T00:00:00Z'}]};
  const result=await resolveRankingUsers(Array.from({length:1000},(_,i)=>String(i+1)),client,null,store);
  assert.equal(result.size,1);assert.equal(result.get('1').username,'saved');assert.equal(calls,0);
});

test('公開確認はBotのメッセージ編集を使い、受付失敗では確認とポイントを残す',async()=>{
  const economy=new Economy({},()=> 'bot');
  try {
    const data={owner:'owner',kind:'gamble',expires:Date.now()+60_000,channelId:'channel'};
    economy.confirms.set('key',data);
    let edits=0;
    const i={customId:'eco:cancel:key',user:{id:'owner'},channelId:'channel',
      deferUpdate:async()=>{throw Object.assign(new Error('Unknown interaction'),{code:10062});},
      message:{flags:{has:()=>false},edit:async()=>{edits++;}},
      editReply:async()=>{throw new Error('期限付きWebhookは使用しない');},
    };
    await assert.rejects(economy.handle(i),/Unknown interaction/);
    assert.equal(economy.confirms.get('key'),data);assert.equal(edits,0);
    i.deferUpdate=async()=>{};
    await economy.handle(i);assert.equal(edits,1);assert.equal(economy.confirms.has('key'),false);
    economy.confirms.set('key',data);i.message.flags.has=()=>true;
    i.editReply=async()=>{edits++;};
    await economy.handle(i);assert.equal(edits,2);
  }finally{economy.close();}
});

test('一覧取得はポイント順の上位1000人だけを返し、同点順・Bot除外を守る',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'games-bot-rankings-')),store=new Store('',dir);
  try {
    await store.initialize();
    await store.transaction(c=>c.query(`INSERT INTO games_bot_economy(user_id,points) SELECT n,n FROM generate_series(10000,11004) n UNION ALL SELECT n,-n FROM generate_series(20000,21004) n UNION ALL SELECT 999999,999999`));
    const rich=await store.rankingExport('999999');
    assert.equal(rich.length,1000);
    assert.equal(rich[0].user_id,'11004');assert.equal(rich.at(-1).user_id,'10005');
    assert.ok(!rich.some(e=>e.user_id==='999999'));
    await store.transaction(c=>c.query('UPDATE games_bot_economy SET points=20000 WHERE user_id IN (10000,10001)'));
    assert.deepEqual((await store.rankingExport('999999')).slice(0,2).map(e=>e.user_id),['10000','10001']);
    await store.transaction(c=>c.query('DELETE FROM games_bot_economy WHERE points>0'));
    assert.deepEqual((await store.rankingExport('999999')).slice(0,2).map(e=>e.points),['-20000','-20001']);
    await store.transaction(c=>c.query('DELETE FROM games_bot_economy'));
    assert.deepEqual(await store.rankingExport('999999'),[]);
  } finally {await store.close();await rm(dir,{recursive:true,force:true});}
});

test('サーバー内ランキング・順位は指定メンバーだけを母集団にする',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'games-bot-guild-rankings-')),store=new Store('',dir);
  try {
    await store.initialize();
    await store.transaction(c=>c.query(`INSERT INTO games_bot_economy(user_id,points) VALUES ('1','500'),('2','300'),('4','400'),('3','700'),('5','200')`));
    const cohort=['1','2','4'];
    assert.deepEqual((await store.ranking('999',10,cohort)).map(e=>e.user_id),['1','4','2']);
    assert.equal(await store.rank('1','999',cohort),1);
    assert.equal(await store.rank('2','999',cohort),3);
    assert.equal(await store.rank('3','999',cohort),-1);
    await store.transaction(c=>c.query(`UPDATE games_bot_economy SET points=points-100000 WHERE user_id IN (1,2)`));
    assert.deepEqual((await store.poorRanking('999',cohort)).map(e=>e.user_id),['2','1']);
    assert.equal(await store.poorRank('1','999',cohort),2);
    assert.equal(await store.poorRank('5','999',cohort),-1);
  } finally {await store.close();await rm(dir,{recursive:true,force:true});}
});

test('一覧をプレビュー上限以下の通常txt添付に分割し、全行とUTF-8の文字を保持する',()=>{
  const rich=Array.from({length:1000},(_,i)=>({user_id:String(100000000000000000n+BigInt(i)),points:'1'+'0'.repeat(110)}));
  const payloads=rankingExportResponse(rich,id=>id===rich[0].user_id?{displayName:'名前\n改行\tテスト',username:'usuiayari'}:undefined,new Date('2026-10-24T00:00:00Z')).attachments;
  const files=payloads.flatMap(p=>p.files);
  const text=files.map(f=>f.attachment.toString('utf8')).join('');
  assert.ok(files.length>1);
  assert.match(text,/ポイントの多い順・上位最大1000人/);assert.doesNotMatch(text,/富豪|貧乏/);
  assert.match(text,/1000位  ID: 100000000000000999/);
  assert.match(text,/1位  名前 改行 テスト \(@usuiayari\)/);
  assert.ok(text.includes('名前 改行 テスト'));assert.ok(!text.includes('名前\n改行'));
  assert.equal(text.split('\n').filter(line=>/^\d+位  /.test(line)).length,1000);
  for(const payload of payloads){
    assert.ok(payload.files.length<=10);assert.equal(payload.content,undefined);
    assert.equal(payload.components,undefined);assert.equal(payload.flags,undefined);
    for(const file of payload.files)assert.ok(file.attachment.length<=48*1024);
  }
  const empty=rankingExportResponse([]).attachments[0];
  assert.equal(empty.files[0].name,'point-rankings.txt');
  assert.match(empty.files[0].attachment.toString('utf8'),/該当するプレイヤーがいません/);
  const capped=rankingExportResponse([...rich,...rich]).attachments.flatMap(p=>p.files).map(f=>f.attachment.toString('utf8')).join('');
  assert.equal(capped.split('\n').filter(line=>/^\d+位  /.test(line)).length,1000);
  const longName='あ😀'.repeat(10000);
  const unicode=rankingExportResponse([{user_id:'1',points:'0'}],()=>({displayName:longName,username:'test'})).attachments.flatMap(p=>p.files).map(f=>f.attachment.toString('utf8')).join('');
  assert.ok(unicode.includes(longName));assert.ok(!unicode.includes('\uFFFD'));
  const batches=rankingExportResponse(rich,()=>({displayName:'名'.repeat(300),username:'test'})).attachments;
  assert.ok(batches.length>1);assert.ok(batches.every(p=>p.files.length<=10));
});
test('利用時だけ名前を更新し、変更がなければDBを更新せず再起動後も使う',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ranking-users-'));let store=new Store('',dir);
  const now=Date.parse('2026-10-24T00:00:00Z');
  try {
    await store.initialize();
    const user={id:'2',username:'old',globalName:'変更前',bot:false};
    await rememberRankingUser(store,user,now);
    await rememberRankingUser(store,user,now+1000);
    assert.equal((await store.rankingUsers(['2']))[0].fetched_at,new Date(now).toISOString());
    user.username='usuiayari';user.globalName='ayari';
    await rememberRankingUser(store,user,now+2000);
    await rememberRankingUser(store,{...user,username:'古い情報'},now);
    await rememberRankingUser(store,{id:'3',username:'bot',globalName:null,bot:true},now);
    assert.equal((await store.rankingUsers(['3'])).length,0);
    const stored=(await store.rankingUsers(['2']))[0];
    assert.equal(stored.username,'usuiayari');assert.equal(stored.display_name,'ayari');
    await store.close();store=new Store('',dir);await store.initialize();
    const client={users:{cache:new Map([['2',{username:'old',globalName:'古いキャッシュ'}],['4',{username:'fallback',globalName:null}]]),fetch:async()=>{throw new Error('取得禁止');}}};
    const result=await resolveRankingUsers(['2','4','5'],client,null,store);
    assert.deepEqual(result.get('2'),{displayName:'ayari',username:'usuiayari'});
    assert.deepEqual(result.get('4'),{displayName:'fallback',username:'fallback'});
    assert.equal(result.has('5'),false);
    const text=rankingExportResponse([{user_id:'2',points:'424140'}],id=>result.get(id)).attachments[0].files[0].attachment.toString('utf8');
    assert.match(text,/1位  ayari \(@usuiayari\)  424,140pt/);
  }finally{await store.close();await rm(dir,{recursive:true,force:true});}
});

test('本人のさらに表示だけを受け付け、先に非公開で受付してから一覧ファイルを返す',async()=>{
  const events=[],queries=[];
  const economy=new Economy({rankingExport:async bot=>{
    queries.push(bot);assert.equal(events.at(-1),'ack');
    return [{user_id:'123',points:'500'}];
  },rankingUsers:async()=>[],saveRankingUsers:async()=>{}},()=> 'bot');
  try {
    const i={customId:'eco:rankings:owner',user:{id:'owner'},
      deferReply:async options=>{assert.equal(options.flags,MessageFlags.Ephemeral);events.push('ack');},
      editReply:async payload=>{events.push('edit');i.payload=payload;},
      followUp:async payload=>{assert.equal(payload.flags,MessageFlags.Ephemeral);assert.equal(payload.components,undefined);events.push('files');i.files=payload.files;},
    };
    await economy.handle(i);assert.deepEqual(events,['ack','edit','files']);assert.deepEqual(queries,['bot']);
    assert.equal(i.payload.flags,MessageFlags.IsComponentsV2);assert.equal(i.payload.files,undefined);assert.ok(i.payload.components.length>0);
    assert.equal(i.files[0].name,'point-rankings.txt');
    assert.match(i.files[0].attachment.toString('utf8'),/ID: 123  500pt/);
    for(const customId of ['eco:rankings:owner:rich:0','eco:rankings:owner:rich:0:first','eco:rankings:owner:bad']) {
      i.customId=customId;events.length=0;const before=queries.length;
      await assert.rejects(economy.handle(i),/開き直して/);assert.equal(queries.length,before);assert.equal(events.length,0);
    }
    i.customId='eco:rankings:owner';i.user.id='other';events.length=0;
    await assert.rejects(economy.handle(i),/最初にコマンド/);assert.equal(events.length,0);
  } finally {economy.close();}
});
