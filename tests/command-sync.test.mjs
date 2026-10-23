import assert from 'node:assert/strict';
import {test} from 'node:test';
import {slashCommands} from '../src/commands/definitions.ts';
import {syncSlashCommands,syncStartupCommands} from '../src/services/command-sync.ts';

const clone=value=>JSON.parse(JSON.stringify(value));
const desired=()=>slashCommands.map(c=>clone(c.toJSON()));
const guildId='123456789012345678';
function fakeApi(global=[],guild=[]) {
  const state=new Map([['global',clone(global)],[guildId,clone(guild)]]),writes=[];
  return {state,writes,
    applicationId:async()=>'test-app',
    list:async guild=>clone(state.get(guild??'global')??[]),
    replace:async(commands,guild)=>{writes.push({guild,commands:clone(commands)});state.set(guild??'global',clone(commands));},
  };
}
function rest(api) {
  const scope=route=>route.includes('/guilds/')?guildId:undefined;
  return {
    get:async route=>route==='/oauth2/applications/@me'?{id:await api.applicationId()}:api.list(scope(route)),
    put:async(route,{body})=>api.replace(body,scope(route)),
  };
}

test('初回起動はhelp・imakitaを登録し、次の起動では書き込まない',async()=>{
  const api=fakeApi();
  const first=await syncSlashCommands(api,'test-app');
  assert.equal(first.changed,true);assert.equal(first.count,2);
  assert.deepEqual(api.state.get('global').map(c=>c.name),['help','imakita']);
  assert.equal((await syncSlashCommands(api,'test-app')).changed,false);
  assert.equal(api.writes.length,1);
});

test('登録順・APIの管理情報・省略された既定値が異なるだけなら更新しない',async()=>{
  const registered=desired().reverse().map((c,index)=>({...c,id:String(index),application_id:'test-app',version:'123',default_member_permissions:null,nsfw:false,integration_types:[0],name_localizations:null,description_localizations:null}));
  const imakita=registered.find(c=>c.name==='imakita');
  imakita.options[0].required=false;imakita.options[0].autocomplete=false;
  imakita.options[0].choices.forEach(c=>{c.name_localizations=null;});
  const api=fakeApi(registered);
  assert.equal((await syncSlashCommands(api,'test-app')).changed,false);
  assert.equal(api.writes.length,0);
});

test('helpの登録漏れ・説明や選択肢の変更・不要なコマンドを差分同期する',async()=>{
  for(const change of [
    commands=>commands.filter(c=>c.name!=='help'),
    commands=>{commands[0].description='old';return commands;},
    commands=>{commands[1].options[0].choices[0].value=5;return commands;},
    commands=>[...commands,{name:'old',description:'obsolete',type:1}],
  ]) {
    const api=fakeApi(change(desired()));
    assert.equal((await syncSlashCommands(api,'test-app')).changed,true);
    assert.deepEqual(api.state.get('global'),desired());
    assert.equal((await syncSlashCommands(api,'test-app')).changed,false);
    assert.equal(api.writes.length,1);
  }
});

test('本番起動はテストサーバーIDがあってもグローバル登録だけ同期する',async()=>{
  const api=fakeApi([],[{name:'guild-only'}]);
  await syncStartupCommands(rest(api),{applicationId:'test-app',production:true,guildId});
  assert.equal(api.writes.length,1);assert.equal(api.writes[0].guild,undefined);
  assert.deepEqual(api.state.get(guildId),[{name:'guild-only'}]);
});

test('ローカル起動はテストサーバーへ登録し、古いグローバル登録を一度だけ整理する',async()=>{
  const api=fakeApi([{name:'old'}]);
  const settings={applicationId:'test-app',production:false,guildId};
  const first=await syncStartupCommands(rest(api),settings);
  assert.equal(first.changed,true);assert.equal(first.clearedGlobal,true);
  assert.deepEqual(api.state.get('global'),[]);assert.deepEqual(api.state.get(guildId),desired());
  const next=await syncStartupCommands(rest(api),settings);
  assert.equal(next.changed,false);assert.equal(next.clearedGlobal,false);assert.equal(api.writes.length,2);
});

test('別Bot・不正なサーバー・ローカル設定不足では登録を書き換えない',async()=>{
  const api=fakeApi();
  await assert.rejects(syncSlashCommands(api,'other-app'),/一致/);
  await assert.rejects(syncSlashCommands(api,'test-app','bad-id'),/無効/);
  await assert.rejects(syncSlashCommands(api,'test-app',undefined,true),/テストサーバー/);
  await assert.rejects(syncStartupCommands(rest(api),{applicationId:'test-app',production:false,guildId:''}),/TEST_GUILD_ID/);
  assert.equal(api.writes.length,0);
});

test('Discordの取得・更新失敗を隠さず、次回の同期で復旧できる',async()=>{
  const api=fakeApi(),list=api.list,replace=api.replace;
  api.list=async()=>{throw new Error('read failed');};
  await assert.rejects(syncSlashCommands(api,'test-app'),/read failed/);assert.equal(api.writes.length,0);
  api.list=list;api.replace=async()=>{throw new Error('write failed');};
  await assert.rejects(syncSlashCommands(api,'test-app'),/write failed/);
  api.replace=replace;
  assert.equal((await syncSlashCommands(api,'test-app')).changed,true);
  assert.equal((await syncSlashCommands(api,'test-app')).changed,false);
});
