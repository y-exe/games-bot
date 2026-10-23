import assert from 'node:assert/strict';
import {test} from 'node:test';
import {MessageFlags} from 'discord.js';
import {help,handleHelp} from '../src/commands/help.ts';
import {utility} from '../src/commands/utility.ts';
import {Context} from '../src/commands/context.ts';
import {authorizeChannel} from '../src/commands/delivery.ts';
import {channelAllowsCommand} from '../src/commands/policy.ts';

const data=payload=>JSON.parse(JSON.stringify(payload));
const controls=payload=>data(payload).components[0].components.flatMap(c=>c.type===1?c.components:[]);

test('/helpは許可済みで公開・未許可で非公開になり、文字helpの制限は維持する',async()=>{
  for(const enabled of [false,true]) {
    const allowed=new Set(enabled?['channel']:[]),events=[];
    const message={id:'response',channelId:'channel',components:[]};
    const source={id:'command',options:{},user:{id:'owner'},channelId:'channel',deferred:false,replied:false,
      async deferReply(options) {this.deferred=true;events.push({kind:'ack',flags:options?.flags??0});},
      async editReply(payload) {events.push({kind:'edit',payload});return message;},
    };
    const ctx=new Context(source,{});
    assert.equal(await authorizeChannel('help',ctx,allowed),true);
    await ctx.prepare();await utility('help',ctx,{},allowed);
    assert.equal(Boolean(events[0].flags&MessageFlags.Ephemeral),!enabled);
    assert.ok(controls(events[1].payload).filter(b=>b.custom_id).every(b=>b.custom_id.endsWith(':owner')));
    assert.equal(channelAllowsCommand('help','channel',allowed),enabled);
    assert.equal(channelAllowsCommand('help','channel',allowed,true),true);
    assert.equal(channelAllowsCommand('othello','channel',allowed,true),enabled);
  }
});

test('ヘルプは公開・非公開とも本人が元のカードを更新し、全ページで所有者とURLボタン配置を保つ',async()=>{
  for(const ephemeral of [false,true])for(const category of ['home','games','economy','media','utility','all']) {
    const events=[];
    const i={customId:`help:${category}:owner`,user:{id:'owner'},
      message:{flags:{has:flag=>ephemeral&&flag===MessageFlags.Ephemeral}},
      deferUpdate:async()=>events.push('ack'),
      editReply:async payload=>{events.push('edit');i.payload=payload;return {id:'response',channelId:'channel',components:[]};},
    };
    await handleHelp(i);assert.deepEqual(events,['ack','edit']);
    const buttons=controls(i.payload);
    assert.ok(buttons.filter(b=>b.custom_id).every(b=>b.custom_id.endsWith(':owner')));
    assert.ok(buttons.some(b=>b.style===5&&b.url));
    const parts=data(i.payload).components[0].components,separator=parts.findIndex(c=>c.type===14);
    assert.ok(parts.slice(0,separator).some(c=>c.type===1&&c.components.every(b=>b.style===5)));
    assert.ok(parts.slice(separator+1).some(c=>c.type===1&&c.components.some(b=>b.custom_id)));
  }
});

test('他人と所有者情報のない旧ヘルプボタンは元メッセージを更新できない',async()=>{
  for(const [customId,actor]of [['help:games:owner','other'],['help:games','owner']]) {
    let changed=false;
    await assert.rejects(handleHelp({customId,user:{id:actor},deferUpdate:async()=>{changed=true;},editReply:async()=>{changed=true;}}));
    assert.equal(changed,false);
  }
  const payload=help('all','owner');
  assert.ok(controls(payload).some(b=>b.custom_id==='help:home:owner'));
});
