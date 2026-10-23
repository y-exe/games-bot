import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ButtonStyle,ButtonBuilder,MessageFlags} from 'discord.js';
import {ButtonExpiryRegistry,buttonExpiryMs} from '../src/ui/button-expiry.ts';
import {card,row,button,disableRawButtons} from '../src/ui/cards.ts';
import {expiredInteraction} from '../src/commands/policy.ts';

function fixture(id='message',at=0) {
  const payload=card('test','body','info',[row(button('help:games:owner','help'),button('game:test:0:move','move'),new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Docs').setURL('https://example.com'))]);
  return {id,channelId:'channel',createdTimestamp:at,components:payload.components,flags:{has:()=>false},author:{id:'bot'}};
}
function fakeClient(message) {
  const edits=[],messages=new Map([[message.id,message]]);
  return {edits,messages,user:{id:'bot'},channels:{fetch:async()=>({isTextBased:()=>true,messages:{fetch:async id=>{
    if(typeof id==='object')return messages;
    const found=messages.get(id);if(!found)throw Object.assign(new Error('deleted'),{code:10008});return found;
  }}})},rest:{patch:async(route,{body})=>{
    const target=messages.get(route.split('/').at(-1));
    if(!target)throw Object.assign(new Error('deleted'),{code:10008});
    edits.push(body);target.components=body.components;
  }}};
}
const controls=components=>JSON.parse(JSON.stringify(components)).flatMap(c=>c.components??[]).flatMap(c=>c.components??[c]);

test('30分ちょうどで公開カードの実ボタンを無効化し、URL・ゲーム操作は保持する',async()=>{
  let now=0;const registry=new ButtonExpiryRegistry(undefined,()=>now),message=fixture(),client=fakeClient(message);
  registry.track(message);assert.equal(registry.deadline(message.id),30*60_000);
  now=29*60_000;await registry.sweep(client);assert.equal(client.edits.length,0);
  message.editedTimestamp=now;registry.track(message);assert.equal(registry.deadline(message.id),30*60_000);
  now=30*60_000;await registry.sweep(client);assert.equal(client.edits.length,1);
  const buttons=controls(client.edits[0].components);
  assert.equal(buttons.find(b=>b.custom_id?.startsWith('help:')).disabled,true);
  assert.equal(buttons.find(b=>b.custom_id?.startsWith('game:')).disabled,false);
  assert.notEqual(buttons.find(b=>b.style===5).disabled,true);
  assert.equal(registry.disabled(message.id),now);
  await registry.sweep(client);assert.equal(client.edits.length,1);
  assert.equal(expiredInteraction('help:home:owner',30*60_000-1),false);
  assert.equal(expiredInteraction('help:home:owner',30*60_000),true);
});

test('DiscordのtoJSONモデルと各種セレクトも追跡・無効化できる',async()=>{
  let now=0;const registry=new ButtonExpiryRegistry(undefined,()=>now),message=fixture();
  const raw=message.components[0].toJSON();
  raw.components.push({type:1,components:[{type:5,custom_id:'prompt:user',placeholder:'user'}]});
  message.components=[{type:17,toJSON:()=>raw}];
  const client=fakeClient(message);registry.track(message);
  now=buttonExpiryMs();await registry.sweep(client);
  const buttons=controls(client.edits[0].components);
  assert.equal(buttons.find(b=>b.custom_id==='prompt:user').disabled,true);
  assert.equal(controls(disableRawButtons(message.components)).find(b=>b.custom_id==='game:test:0:move').disabled,true);
});

test('本人限定カードは14分でWebhookから無効化し、トークンを期限記録へ保存しない',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'button-expiry-'));
  try {
    let now=0,disabled;
    const registry=new ButtonExpiryRegistry(dir,()=>now),message=fixture();
    message.flags={has:flag=>flag===MessageFlags.Ephemeral};
    registry.track(message,async components=>{disabled=components;});
    now=buttonExpiryMs(true)-1;await registry.sweep({});assert.equal(disabled,undefined);
    now++;await registry.sweep({});assert.equal(controls(disabled).find(b=>b.custom_id?.startsWith('help:')).disabled,true);
    await registry.close();
    const saved=JSON.parse(await readFile(join(dir,'button-expiry.json'),'utf8'));
    assert.deepEqual(saved.entries,[]);assert.ok(!JSON.stringify(saved).includes('components'));
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('再起動後も公開カードの期限を引き継ぎ、未追跡の古いカードも回収する',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'button-expiry-'));
  try {
    let now=0;const original=new ButtonExpiryRegistry(dir,()=>now),message=fixture(),client=fakeClient(message);
    original.track(message);await original.close();
    now=31*60_000;const restored=new ButtonExpiryRegistry(dir,()=>now);
    await restored.restore();assert.equal(restored.deadline(message.id),30*60_000);
    const old={...fixture('old',0),author:{id:'bot'}};client.messages.set(old.id,old);
    await restored.recoverRecent(client,new Set(['channel']));
    await restored.sweep(client);assert.equal(client.edits.length,2);
    await restored.close();
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('古いカードの同時編集による追加制限を避けて順番に無効化する',async()=>{
  let now=0,active=0,maxActive=0;
  const registry=new ButtonExpiryRegistry(undefined,()=>now),message=fixture(),second=fixture('second'),client=fakeClient(message);
  client.messages.set(second.id,second);registry.track(message);registry.track(second);
  const patch=client.rest.patch;client.rest.patch=async(...args)=>{
    active++;maxActive=Math.max(maxActive,active);await Promise.resolve();
    try{return await patch(...args);}finally{active--;}
  };
  now=buttonExpiryMs();await registry.sweep(client);
  assert.equal(client.edits.length,2);assert.equal(maxActive,1);
});

test('一時的な編集失敗は期限情報を捨てずに再試行する',async()=>{
  let now=0;const registry=new ButtonExpiryRegistry(undefined,()=>now),message=fixture(),client=fakeClient(message);
  registry.track(message);now=buttonExpiryMs();
  const patch=client.rest.patch;client.rest.patch=async()=>{throw new Error('temporary');};
  await registry.sweep(client);assert.equal(registry.disabled(message.id),undefined);
  client.rest.patch=patch;now+=5_000;await registry.sweep(client);
  assert.equal(client.edits.length,1);assert.equal(registry.disabled(message.id),now);
});

test('削除済み絵文字でDiscordが編集を拒否しても、該当絵文字だけ外して無効化する',async()=>{
  let now=0,calls=0;const registry=new ButtonExpiryRegistry(undefined,()=>now),message=fixture(),client=fakeClient(message);
  const raw=message.components[0].toJSON();
  raw.components[2].components[0].emoji={id:'123',name:'deleted'};
  raw.components[2].components[1].emoji={id:'456',name:'valid'};
  message.components=[raw];registry.track(message);now=buttonExpiryMs();
  const patch=client.rest.patch;
  client.rest.patch=async(route,options)=>{
    calls++;
    if(options.body.components[0].components[2].components[0].emoji)throw Object.assign(new Error('Invalid Form Body'),{code:50035,rawError:{errors:{components:{0:{components:{2:{components:{0:{emoji:{id:{_errors:[{code:'COMPONENT_INVALID_EMOJI'}]}}}}}}}}}}});
    return patch(route,options);
  };
  await registry.sweep(client);
  assert.equal(calls,2);assert.equal(registry.disabled(message.id),now);
  const buttons=controls(client.edits[0].components);
  assert.equal(buttons.find(b=>b.custom_id?.startsWith('help:')).emoji,undefined);
  assert.deepEqual(buttons.find(b=>b.custom_id?.startsWith('game:')).emoji,{id:'456',name:'valid'});
});

test('起動直後の新カード保存でも、既存の期限記録を上書きで失わない',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'button-expiry-'));
  try {
    const first=new ButtonExpiryRegistry(dir,()=>0);
    first.track(fixture('before'));await first.close();
    const next=new ButtonExpiryRegistry(dir,()=>60_000);
    next.track(fixture('after',60_000));await next.close();
    const saved=JSON.parse(await readFile(join(dir,'button-expiry.json'),'utf8'));
    assert.deepEqual(saved.entries.map(e=>e.messageId).sort(),['after','before']);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('削除済みカードは追跡を終了し、正常終了時は本人限定のボタンを閉じる',async()=>{
  let now=0;const registry=new ButtonExpiryRegistry(undefined,()=>now),message=fixture(),client=fakeClient(message);
  registry.track(message);client.messages.clear();now=buttonExpiryMs();await registry.sweep(client);
  assert.equal(registry.deadline(message.id),undefined);
  let edited=false;const privateCard={...fixture('private',now),flags:{has:()=>true}};
  registry.track(privateCard,async()=>{edited=true;});await registry.close(client);assert.equal(edited,true);
});
