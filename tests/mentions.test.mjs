import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Client,MessagePayload,REST,MessageFlags} from 'discord.js';
import {Context} from '../src/commands/context.ts';
import {card} from '../src/ui/cards.ts';
import {noMentions} from '../src/ui/mentions.ts';
import {postErrorLog} from '../src/services/error-log.ts';
import {settings} from '../src/config.ts';

test('Discordへ送る形式でも本文と返信先の通知を抑止し、既定値は通常のメッセージにも適用する',()=>{
  const client=new Client({intents:[],allowedMentions:noMentions});
  try {
    const target={client,messages:{resolveId:value=>value}};
    for(const options of [card('test','<@123> <@&456> @everyone'),{content:'<@123> <@&456> @everyone',reply:{messageReference:'123'}}]) {
      const body=new MessagePayload(target,options).resolveBody().body;
      assert.deepEqual(body.allowed_mentions,{parse:[],replied_user:false});
      if(options.reply)assert.equal(body.message_reference.message_id,'123');
    }
  }finally{client.destroy();}
});

test('カード以外の返信と編集でも、呼び出し元の通知設定を共通の抑止設定に統一する',async()=>{
  const sent=[];
  const response={id:'reply',channelId:'channel',components:[],edit:async payload=>{sent.push(payload);return response;}};
  const source={author:{id:'owner'},reply:async payload=>{sent.push(payload);return response;}};
  const ctx=new Context(source,{});
  const options={content:'@everyone <@123>',allowedMentions:{parse:['everyone','users'],repliedUser:true}};
  await ctx.send(options);await ctx.send(options);
  assert.equal(sent.length,2);
  for(const payload of sent)assert.deepEqual(payload.allowedMentions,{parse:[],repliedUser:false});
  assert.equal(options.allowedMentions.repliedUser,true);
});

test('スラッシュ・フォーム・ボタンの初回返信と編集でも通知を抑止する',async()=>{
  for(const kind of ['slash','modal','button'])for(const replied of [false,true]) {
    let sent;
    const message={id:'result',channelId:'channel',components:[]};
    const source={user:{id:'owner'},replied,reply:async payload=>{sent=payload;},fetchReply:async()=>message,editReply:async payload=>{sent=payload;return message;},
      ...(kind==='slash'?{options:{}}:kind==='modal'?{fields:{}}:{customId:'test'}),
    };
    await new Context(source,{}).send({content:'<@123>'});
    assert.deepEqual(sent.allowedMentions,{parse:[],repliedUser:false});
  }
});

test('エラーログの直接API投稿にはsnake_caseの通知抑止を指定する',()=>{
  const original=REST.prototype.post,channel=settings.errorLogChannelId;let sent;
  REST.prototype.post=async(_route,{body})=>{sent=JSON.parse(JSON.stringify(body));};
  settings.errorLogChannelId='test-channel';
  try {
    postErrorLog(card('test','<@123> @everyone'));
    assert.deepEqual(sent.allowed_mentions,{parse:[],replied_user:false});
    assert.equal(sent.allowedMentions,undefined);
    assert.ok(sent.flags&MessageFlags.SuppressNotifications);
  }finally{REST.prototype.post=original;settings.errorLogChannelId=channel;}
});
