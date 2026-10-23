import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MessageFlags} from 'discord.js';
import {Store} from '../src/data/store.ts';
import {Economy} from '../src/commands/economy.ts';
import {rankingExportResponse} from '../src/ui/rankings.ts';

const json=value=>JSON.parse(JSON.stringify(value));

test('一覧取得は富豪・貧乏を各1000件に制限し、同点順・Bot除外・負債限定を守る',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'games-bot-rankings-')),store=new Store('',dir);
  try {
    await store.initialize();
    await store.transaction(c=>c.query(`INSERT INTO games_bot_economy(user_id,points) SELECT n,n FROM generate_series(10000,11004) n UNION ALL SELECT n,-n FROM generate_series(20000,21004) n UNION ALL SELECT 999999,999999`));
    const {rich,poor}=await store.rankingExport('999999');
    assert.equal(rich.length,1000);assert.equal(poor.length,1000);
    assert.equal(rich[0].user_id,'11004');assert.equal(rich.at(-1).user_id,'10005');
    assert.equal(poor[0].points,'-21004');assert.equal(poor.at(-1).points,'-20005');
    assert.ok(![...rich,...poor].some(e=>e.user_id==='999999'));
    await store.transaction(c=>c.query('UPDATE games_bot_economy SET points=20000 WHERE user_id IN (10000,10001)'));
    assert.deepEqual((await store.rankingExport('999999')).rich.slice(0,2).map(e=>e.user_id),['10000','10001']);
    await store.transaction(c=>c.query('DELETE FROM games_bot_economy'));
    assert.deepEqual(await store.rankingExport('999999'),{rich:[],poor:[]});
  } finally {await store.close();await rm(dir,{recursive:true,force:true});}
});

test('一覧をプレビュー上限以下の通常txt添付に分割し、全行とUTF-8の文字を保持する',()=>{
  const rich=Array.from({length:1000},(_,i)=>({user_id:String(100000000000000000n+BigInt(i)),points:'1'+'0'.repeat(110)}));
  const poor=[{user_id:'200',points:'-1234567'}];
  const payloads=rankingExportResponse(rich,poor,id=>id===rich[0].user_id?'名前\n改行\tテスト':undefined,new Date('2026-10-24T00:00:00Z')).attachments;
  const files=payloads.flatMap(p=>p.files);
  const text=files.map(f=>f.attachment.toString('utf8')).join('');
  assert.ok(files.length>1);
  assert.match(text,/富豪ランキング・1000件/);assert.match(text,/貧乏ランキング・1件/);
  assert.match(text,/1000位  ID: 100000000000000999/);assert.match(text,/-1,234,567pt/);
  assert.ok(text.includes('名前 改行 テスト'));assert.ok(!text.includes('名前\n改行'));
  assert.equal(text.split('\n').filter(line=>/^\d+位  /.test(line)).length,1001);
  for(const payload of payloads){
    assert.ok(payload.files.length<=10);assert.equal(payload.content,undefined);
    assert.equal(payload.components,undefined);assert.equal(payload.flags,undefined);
    for(const file of payload.files)assert.ok(file.attachment.length<=48*1024);
  }
  const empty=rankingExportResponse([],[]).attachments[0];
  assert.equal(empty.files[0].name,'point-rankings.txt');
  assert.match(empty.files[0].attachment.toString('utf8'),/該当するプレイヤーがいません/);
  const capped=rankingExportResponse([...rich,...rich],[]).attachments.flatMap(p=>p.files).map(f=>f.attachment.toString('utf8')).join('');
  assert.equal(capped.split('\n').filter(line=>/^\d+位  /.test(line)).length,1000);
  const longName='あ😀'.repeat(10000);
  const unicode=rankingExportResponse([{user_id:'1',points:'0'}],[],()=>longName).attachments.flatMap(p=>p.files).map(f=>f.attachment.toString('utf8')).join('');
  assert.ok(unicode.includes(longName));assert.ok(!unicode.includes('\uFFFD'));
  const batches=rankingExportResponse(rich,poor,()=> '名'.repeat(300)).attachments;
  assert.ok(batches.length>1);assert.ok(batches.every(p=>p.files.length<=10));
});
test('本人のさらに表示だけを受け付け、先に非公開で受付してから一覧ファイルを返す',async()=>{
  const events=[],queries=[];
  const economy=new Economy({rankingExport:async bot=>{
    queries.push(bot);assert.equal(events.at(-1),'ack');
    return {rich:[{user_id:'123',points:'500'}],poor:[]};
  }},()=> 'bot');
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
