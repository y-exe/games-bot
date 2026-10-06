import {UserError} from '../errors.js';
import { AttachmentBuilder, FileBuilder } from 'discord.js';
import { Context } from './context.js';
import { card } from '../ui/cards.js';
import { MediaWorker } from '../services/media.js';
import { request } from '../services/network.js';
import { settings } from '../config.js';
import { processAudio } from '../services/audio.js';

export async function media(name:string,ctx:Context,worker:MediaWorker,audioProcessor:typeof processAudio=processAudio) {
  if(name==='5000') {
    const top=ctx.text('top'),bottom=ctx.text('bottom',1);if(!top||!bottom)throw new UserError('上と下の文字を指定してください。例: 5000 上の文字 下の文字');
    const hoshii=ctx.slash?.options.getBoolean('hoshii')??ctx.args.slice(2).includes('hoshii');
    const rainbow=ctx.slash?.options.getBoolean('rainbow')??ctx.args.slice(2).includes('rainbow');
    const query=new URLSearchParams({top,bottom,hoshii:String(hoshii),rainbow:String(rainbow)});
    const url=`https://gsapi.cbrx.io/image?${query}`;await request(url);
    const safe=(value:string)=>value.replaceAll('`','´').replaceAll('\n',' ').slice(0,40);
    return ctx.send(card('5000兆円欲しい！',`**上** \`${safe(top)}\` · **下** \`${safe(bottom)}\`${hoshii?' · **欲しい！**':''}${rainbow?' · **虹色**':''}`,'success',[],'5000choyen-api',url,undefined,0xf1c40f));
  }
  if(name==='voice') {
    if(!ctx.guild||!settings.voiceGuildIds.has(ctx.guild.id))throw new UserError('このサーバーでは音声コマンドを利用できません。');
    await ctx.send(card('処理開始','音声処理を開始します…','pending'));
    const text=ctx.slash?.options.getString('text')??ctx.args.join(' ');
    const attachment=ctx.slash?.options.getAttachment('audio')??ctx.attachment();
    let source:Buffer;let extension='wav';let sourceName='text_to_speech';
    if(attachment){
      if(attachment.size>10_000_000)throw new UserError('音声は10MB以下にしてください。');
      extension=attachment.name.split('.').at(-1)?.toLowerCase()??'';
      if(!['wav','mp3','flac','m4a','ogg'].includes(extension))throw new UserError('音声はwav・mp3・flac・m4a・oggに対応しています。');
      sourceName=attachment.name.replace(/\.[^.]+$/,'');source=Buffer.from(await(await request(attachment.url)).arrayBuffer());
    }
    else {
      if(!text.trim()||text.length>200)throw new UserError('読み上げる文字を1〜200文字で指定するか、音声を添付してください。');
      if(!settings.voicevoxKey)throw new UserError('読み上げAPIキーが未設定です。VOICEVOX_API_KEYを設定してください。');
      await ctx.send(card('音声生成中…',`**読み上げ内容**\n${text}\n-# VOICEVOXで音声を生成しています。`,'pending',[],'VOICEVOX'));
      const query=new URLSearchParams({text,speaker:'11',key:settings.voicevoxKey});
      const response=await request(`https://deprecatedapis.tts.quest/v2/voicevox/audio/?${query}`);if(!response.headers.get('content-type')?.includes('audio'))throw new UserError('読み上げサービスから音声を取得できませんでした。');source=Buffer.from(await response.arrayBuffer());
    }
    await ctx.send(card('RVC処理中','やまかわボイチェンで変換しています…\n-# 目安: 20〜50秒。処理内容により前後します。','pending'));
    const audio=await audioProcessor(source,extension,true);const filename=`rvc_${sourceName}.${audio.extension}`;
    const result=card('音声変換完了',`${!attachment&&text?`**読み上げ内容**\n${text}`:'添付された音声を処理しました。'}\n**音声の長さ** · ${audio.duration.toFixed(1)}秒\n-# うまくいかない場合はBGMを抜いてみてください。`,'success',[],'RVC · やまかわボイチェン');result.components[0]!.components.splice(-1,0,new FileBuilder().setURL(`attachment://${filename}`));
    return ctx.send({...result,files:[new AttachmentBuilder(audio.bytes,{name:filename})]});
  }
  let bytes:Buffer;let template:string|undefined;let resized=false;let originalName='image';let inputText='';
  await ctx.send(card('画像生成中…',name.startsWith('text')?'テキスト画像を生成しています…':'添付画像を加工しています…','pending'));
  if(name.startsWith('text')) {
    let text=ctx.slash?.options.getString('text')??ctx.args.join(' ');
    const legacySquare=!ctx.slash&&/ square$/i.test(text);
    const stampOnly=['text4','text5'].includes(name);
    const square=ctx.slash?(ctx.slash.options.getBoolean('square')??stampOnly):legacySquare;
    if(stampOnly&&!square)throw new UserError(`この文字はスタンプ専用です。従来のコマンドでは ${name} 文字 square と指定してください。`);
    if(legacySquare)text=text.replace(/ square$/i,'');text=text.trim();
    inputText=text;
    bytes=await worker.run({kind:name,text,square});
  }else{
    const attachment=ctx.attachment();if(!attachment?.contentType?.startsWith('image/')||attachment.size>10_000_000)throw new UserError('10MB以下の画像を添付してください。');
    originalName=attachment.name?.replace(/\.[^.]+$/,'')??'image';
    const response=await request(attachment.url);const source=Buffer.from(await response.arrayBuffer());if(source.length>10_000_000)throw new UserError('画像が大きすぎます。');
    if(name==='watermark'){const result=await worker.runDetailed({kind:name,bytes:source});bytes=result.bytes;template=result.template;resized=Boolean(result.resized);}
    else bytes=await worker.run({kind:name,bytes:source});
  }
  const filename=name==='gaming'?`gaming_${originalName}.gif`:name==='watermark'?`wm_${originalName}.png`:'image.png';
  const styles:Record<string,{title:string;color:number}>={text:{title:'やまかわサムネ風テキスト',color:0xfee75c},text2:{title:'やまかわ青文字テキスト',color:0x3498db},text3:{title:'やまかわ赤文字テキスト',color:0xc30203},text4:{title:'テキスト4 (変形)',color:0x3498db},text5:{title:'テキスト5 (虹色)',color:0x3498db},gaming:{title:'ゲーミングGIF生成完了',color:0x9b59b6},watermark:{title:'ウォーターマーク加工完了',color:0x3498db}};
  const style=styles[name]!;
  const echo=inputText.trim()?`**文字** · ${inputText.trim().replaceAll('`','´').replaceAll('\n',' / ').slice(0,60)}\n`:'';
  return ctx.send({...card(style.title,name.startsWith('text')?`${echo}${['text4','text5'].includes(name)?'-# スタンプ専用 · 500 × 500px':'-# 改行はコンマ `,` · 正方形スタンプは `square` を指定'}`:template?`**使用テンプレート** · \`${template}\`${resized?'\n-# ファイルサイズに合わせて縮小しました。':''}`:'-# カラー画像を添付すると色の変化が分かりやすくなります。','success',[],undefined,`attachment://${filename}`,undefined,style.color),files:[new AttachmentBuilder(bytes,{name:filename})]});
}
