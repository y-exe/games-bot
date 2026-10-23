import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MessageFlags} from 'discord.js';
import {Store} from '../src/data/store.ts';
import {Economy} from '../src/commands/economy.ts';
import {rankingExportResponse} from '../src/ui/rankings.ts';
import {resolveRankingUsers} from '../src/services/ranking-users.ts';

const json=value=>JSON.parse(JSON.stringify(value));

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
test('名前をDBへ保存して再起動後も再利用し、24時間後に更新して取得失敗時は既存名を残す',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ranking-users-'));
  let store=new Store('',dir);
  const now=Date.parse('2026-10-24T00:00:00Z'),fresh=new Date(now-3600_000).toISOString(),stale=new Date(now-24*3600_000).toISOString();
  try {
    await store.initialize();
    await store.saveRankingUsers([
      {user_id:'1',display_name:'保存済み',username:'saved',fetched_at:fresh},
      {user_id:'2',display_name:'変更前',username:'old',fetched_at:stale},
      {user_id:'4',display_name:'前回の名前',username:'last_known',fetched_at:stale},
    ]);
    const calls=[];let active=0,maxActive=0;
    const client={users:{cache:new Map([['2',{username:'old',globalName:'古いメモリキャッシュ'}]]),fetch:async(id,options)=>{
      assert.equal(options.force,true);calls.push(id);active++;maxActive=Math.max(maxActive,active);
      try {
        await new Promise(resolve=>setImmediate(resolve));
        if(id==='4'||id==='5')throw new Error('unavailable');
        return {username:id==='2'?'usuiayari':`user${id}`,globalName:id==='2'?'ayari':null};
      }finally{active--;}
    }}};
    const guild={members:{cache:new Map([['3',{displayName:'サーバーの呼び名',user:{username:'nick_user',globalName:'全体の表示名'}}]])}};
    const ids=['1','2','2','3','4','5',...Array.from({length:10},(_,i)=>String(i+6))];
    const result=await resolveRankingUsers(ids,client,guild,store,now);
    assert.deepEqual(result.get('2'),{displayName:'ayari',username:'usuiayari'});
    assert.equal(result.get('1').username,'saved');assert.equal(result.get('3').displayName,'サーバーの呼び名');
    assert.equal(result.get('4').username,'last_known');assert.equal(result.has('5'),false);
    assert.equal(calls.filter(id=>id==='2').length,1);assert.ok(!calls.includes('1'));assert.ok(!calls.includes('3'));
    assert.ok(maxActive>1&&maxActive<=4);
    const stored=new Map((await store.rankingUsers(['1','2','3','4','5'])).map(user=>[user.user_id,user]));
    assert.equal(stored.get('3').display_name,'全体の表示名');assert.equal(stored.has('5'),false);
    assert.equal(stored.get('4').fetched_at,stale);
    await store.saveRankingUsers([{user_id:'2',display_name:'古い結果',username:'old',fetched_at:stale}]);
    assert.equal((await store.rankingUsers(['2']))[0].username,'usuiayari');
    await store.close();store=new Store('',dir);await store.initialize();
    const before=calls.length;
    const restored=await resolveRankingUsers(['1','2','3','6'],client,null,store,now+3600_000);
    assert.equal(calls.length,before);assert.equal(restored.get('3').displayName,'全体の表示名');
    const text=rankingExportResponse([{user_id:'2',points:'424140'}],id=>restored.get(id)).attachments[0].files[0].attachment.toString('utf8');
    assert.match(text,/1位  ayari \(@usuiayari\)  424,140pt/);assert.doesNotMatch(text,/ID: 2/);
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
    await economy.handle(i);assert.deepEqual(events,['ack','edit','edit','files']);assert.deepEqual(queries,['bot']);
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
