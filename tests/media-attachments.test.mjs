import assert from 'node:assert/strict';
import {test} from 'node:test';
import {AttachmentBuilder,MessageFlags} from 'discord.js';
import {Context} from '../src/commands/context.ts';
import {media} from '../src/commands/media.ts';
import {settings} from '../src/config.ts';

test('通常の音声添付はスラッシュ・フォーム・ボタンでV2を付けず、公開範囲を維持する',async()=>{
  for(const kind of ['slash','modal','button'])for(const privateReply of [false,true]) {
    let sent;
    const source={user:{id:'owner'},followUp:async payload=>{sent=payload;return {id:'audio'};},
      ...(kind==='slash'?{options:{}}:kind==='modal'?{fields:{fields:new Map()}}:{customId:'voice'}),
    };
    const ctx=new Context(source,{});
    if(privateReply)ctx.makePrivate();
    const file=new AttachmentBuilder(Buffer.from('audio'),{name:'result.wav'});
    await ctx.sendAttachments([file]);
    assert.equal(sent.files[0],file);assert.equal(sent.components,undefined);
    assert.equal(Boolean(sent.flags&MessageFlags.IsComponentsV2),false);
    assert.equal(Boolean(sent.flags&MessageFlags.Ephemeral),privateReply);
    assert.deepEqual(sent.allowedMentions.parse,[]);
  }
});

test('文字コマンドの通常添付は公開なら返信、非公開なら本人DMへ送る',async()=>{
  for(const privateReply of [false,true]) {
    const events=[];
    const source={author:{id:'owner',send:async payload=>{events.push({method:'dm',payload});return {id:'dm'};}},
      reply:async payload=>{events.push({method:'reply',payload});return {id:'reply'};},
    };
    const ctx=new Context(source,{});if(privateReply)ctx.makePrivate();
    await ctx.sendAttachments([new AttachmentBuilder(Buffer.from('audio'),{name:'result.wav'})]);
    assert.equal(events.length,1);assert.equal(events[0].method,privateReply?'dm':'reply');
    assert.equal(events[0].payload.flags,undefined);assert.equal(events[0].payload.components,undefined);
  }
});

test('voiceは進行・完了カードをV2で更新し、変換後の音声だけ別メッセージに送る',async()=>{
  const guild='voice-test',alreadyAllowed=settings.voiceGuildIds.has(guild);
  settings.voiceGuildIds.add(guild);
  try {
    const sourceBytes=Buffer.from('original audio'),output=Buffer.from('converted audio'),events=[];
    const attachment={name:'sample.mp3',size:sourceBytes.length,url:`data:audio/mpeg;base64,${sourceBytes.toString('base64')}`};
    const resultMessage={id:'result',channelId:'channel',components:[],edit:async payload=>{events.push({type:'card',payload});return resultMessage;}};
    const source={guild:{id:guild},attachments:{first:()=>attachment},author:{id:'owner'},
      reply:async payload=>{events.push({type:payload.files?'audio':'card',payload});return resultMessage;},
    };
    const ctx=new Context(source,{});
    await media('voice',ctx,{},async(bytes,extension,convert)=>{
      assert.deepEqual(bytes,sourceBytes);assert.equal(extension,'mp3');assert.equal(convert,true);
      return {bytes:output,extension:'wav',duration:1.25};
    });
    assert.deepEqual(events.map(e=>e.type),['card','card','card','audio']);
    const completed=events.at(-2).payload,audio=events.at(-1).payload;
    assert.equal(completed.flags,MessageFlags.IsComponentsV2);assert.equal(completed.files,undefined);
    assert.ok(!JSON.stringify(completed).includes('attachment://'));
    assert.match(JSON.stringify(completed),/音声変換完了/);assert.match(JSON.stringify(completed),/1.3秒/);
    assert.equal(audio.files[0].name,'rvc_sample.wav');assert.deepEqual(audio.files[0].attachment,output);
    assert.equal(audio.flags,undefined);assert.equal(audio.components,undefined);
  } finally {if(!alreadyAllowed)settings.voiceGuildIds.delete(guild);}
});
