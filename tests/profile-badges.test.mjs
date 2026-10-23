import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Collection,UserFlags,UserFlagsBitField} from 'discord.js';
import {utility} from '../src/commands/utility.ts';
import {badgeManifest,setEmojiMappings} from '../src/ui/emojis.ts';

test('infoで年齢・サーバーブーストの段階を表示し、推定Nitroと公開バッジを混同しない',async()=>{
  const mapping=Object.fromEntries(badgeManifest.map((badge,index)=>[badge.name,`<:${badge.name}:${10000000000000000n+BigInt(index)}>`]));
  setEmojiMappings(mapping);
  const now=new Date();
  const user={id:'123',username:'test-user',bot:false,avatar:'a_example',banner:null,
    createdTimestamp:Date.UTC(now.getUTCFullYear()-2,0,1),flags:new UserFlagsBitField([UserFlags.BugHunterLevel2]),displayAvatarURL:()=> 'https://cdn.discordapp.com/embed/avatars/0.png'};
  user.fetch=async()=>user;
  const member={displayName:'テスト',premiumSince:new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-10,1)),roles:{cache:new Collection()},displayAvatarURL:user.displayAvatarURL};
  const ctx={target:async()=>user,user,guild:{id:'guild',members:{fetch:async()=>member}},send:async payload=>payload};
  try {
    const payload=await utility('info',ctx,undefined,new Set());
    const content=JSON.stringify(payload.components[0].toJSON());
    assert.ok(content.includes(mapping.b_bug_hunter_gold));assert.ok(!content.includes(mapping.b_bug_hunter_green));
    assert.ok(content.includes(mapping.b_account_age_2));assert.ok(content.includes(mapping.b_boost_5));
    assert.ok(content.includes('公開バッジ'));assert.ok(content.includes('Nitro（推定）'));assert.ok(!content.includes('公開日時からの目安'));
    const header=payload.components[0].toJSON().components[0];
    assert.equal(header.type,9);assert.ok(header.components[0].content.includes('test-user'));assert.ok(header.components[0].content.includes('**ID**'));
    assert.ok(!content.includes('b_gift_'));assert.ok(!content.includes('b_game_time_'));assert.ok(!content.includes('b_nitro_gold'));
    member.premiumSince=null;user.bot=true;
    const bot=JSON.stringify((await utility('info',ctx,undefined,new Set())).components[0].toJSON());
    assert.ok(!bot.includes('b_account_age_'));assert.ok(!bot.includes('b_boost_'));assert.ok(!bot.includes('Nitro（推定）'));
  } finally {setEmojiMappings({});}
});

test('infoに参加順・ポイント・ログイン・画像リンクを表示し、ロールを途中で切らない',async()=>{
  const now=Date.now(),avatar='https://cdn.discordapp.com/embed/avatars/0.png';
  const user={id:'200',username:'member',globalName:'表示名',bot:false,createdTimestamp:now-3*365*86400000,flags:new UserFlagsBitField(),avatar:null,banner:'banner',displayAvatarURL:()=>avatar,bannerURL:()=> 'https://cdn.discordapp.com/banners/200/banner.png'};
  user.fetch=async()=>user;
  const member={id:'200',displayName:'ニックネーム',joinedTimestamp:now-20*86400000,premiumSince:null,roles:{cache:new Collection(Array.from({length:20},(_,i)=>[String(i+1000),{id:String(i+1000),position:i}]))},displayAvatarURL:()=>avatar};
  const cache=new Collection([['100',{id:'100',joinedTimestamp:now-30*86400000}],['200',member],['300',{id:'300',joinedTimestamp:now-10*86400000}]]);
  const ctx={target:async()=>user,user,client:{user:{id:'bot'}},guild:{id:'guild',memberCount:3,members:{cache,fetch:async()=>member}},send:async p=>p};
  const store={account:async()=>({points:12345n,consecutive:4,lastLogin:'2026-10-22'}),rank:async()=>2};
  const result=(await utility('info',ctx,store,new Set())).components[0].toJSON();
  const text=JSON.stringify(result);
  assert.ok(text.includes('**参加順** · **2 / 3人**'));assert.ok(text.includes('12,345pt'));assert.ok(text.includes('2位'));assert.ok(text.includes('4日'));
  assert.ok(text.includes('ほか5件'));assert.ok(text.includes('<@&1019>'));assert.ok(!text.includes('<@&1000>'));
  const buttons=result.components.flatMap(component=>component.components??[]).filter(component=>component.type===2);
  assert.deepEqual(buttons.map(button=>button.label),['アバターを見る','バナーを見る']);assert.ok(buttons.every(button=>button.style===5));
  assert.match(result.components.at(-1).content,/利用規約.*プライバシーポリシー/);
  ctx.guild.memberCount=10;
  const partial=JSON.stringify((await utility('info',ctx,store,new Set())).components[0].toJSON());
  assert.ok(!partial.includes('参加順'));
});
