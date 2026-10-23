import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {UserFlags,UserFlagsBitField} from 'discord.js';
import {badgeManifest,badgeAliases,manifest,emoji,setEmojiMappings} from '../src/ui/emojis.ts';
import {publicBadgeNames,accountAgeBadge,serverBoostBadge} from '../src/ui/badges.ts';

test('新バッジの全段階と色違いをb_名で揃え、原本と取得元を追跡できる',async()=>{
  const expected={general:18,app:3,gifting:6,account_age:10,streaming:10,game_time:10,game_variety:10,nitro:8,boost:9};
  assert.equal(badgeManifest.length,84);assert.equal(new Set(manifest.map(entry=>entry.name)).size,manifest.length);
  for(const [category,count] of Object.entries(expected)){
    const entries=badgeManifest.filter(badge=>badge.category===category);assert.equal(entries.length,count,category);
    if(!['general','app'].includes(category))assert.deepEqual(entries.map(badge=>badge.tier),Array.from({length:count},(_,i)=>i+1));
  }
  for(const badge of badgeManifest){
    assert.match(badge.name,/^b_[a-z0-9_]+$/);
    const bytes=await readFile(`assets/emojis/${badge.sourceFile}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),badge.sha256,badge.name);
    const url=new URL(badge.sourceUrl);
    if(badge.sourceKind==='discord-official')assert.ok(['discord.com','cdn.discordapp.com'].includes(url.hostname));
    else assert.equal(badge.name,'b_last_meadow');
  }
  for(const alias of Object.keys(badgeAliases))assert.ok(!manifest.some(entry=>entry.name===alias));
});

test('SVG原本・PNG原本・出力PNGを用途とバッジの種類ごとのフォルダーへ分ける',async()=>{
  for(const entry of manifest){
    assert.match(entry.sourceFile,/^(svg|originals)\/(characters|games|status|badges)\//);
    assert.match(entry.outputFile,/^png\/(characters|games|status|badges)\//);
    if(entry.category){assert.ok(entry.sourceFile.includes(`/badges/${entry.category}/`));assert.ok(entry.outputFile.includes(`/badges/${entry.category}/`));}
    await readFile(`assets/emojis/${entry.outputFile}`);
  }
  for(const folder of ['svg','originals','png'])assert.ok((await readdir(`assets/emojis/${folder}`,{withFileTypes:true})).every(entry=>entry.isDirectory()));
});

test('アカウント年齢の段階を年単位で計算し、1年未満・閏日・未来日時を扱う',()=>{
  const created=new Date('2020-10-23T10:00:00Z');
  assert.equal(accountAgeBadge(created,new Date('2021-10-23T09:59:59.999Z')).name,undefined);
  assert.equal(accountAgeBadge(created,new Date('2021-10-23T10:00:00Z')).name,'b_account_age_1');
  assert.equal(accountAgeBadge(created,new Date('2026-12-23T10:00:00Z')).text,'6年2か月');
  assert.equal(accountAgeBadge(created,new Date('2035-10-23T10:00:00Z')).name,'b_account_age_10');
  assert.equal(accountAgeBadge(new Date('2024-02-29T12:00:00Z'),new Date('2025-02-28T12:00:00Z')).name,'b_account_age_1');
  assert.equal(accountAgeBadge(Date.NaN),undefined);assert.equal(accountAgeBadge(created,new Date('2019-01-01Z')),undefined);
});

test('サーバーのブースト継続日時から9段階を選び、月末と解除を扱う',()=>{
  const start=new Date('2020-01-31T12:00:00Z');
  for(const [month,tier] of [[0,1],[1,1],[2,2],[3,3],[6,4],[9,5],[12,6],[15,7],[18,8],[24,9],[36,9]]){
    const date=new Date(Date.UTC(2020,month,31,12));
    const year=date.getUTCFullYear(),targetMonth=month%12;
    const until=new Date(Date.UTC(year,targetMonth,Math.min(31,new Date(Date.UTC(year,targetMonth+1,0)).getUTCDate()),12));
    assert.equal(serverBoostBadge(start,until).name,`b_boost_${tier}`,String(month));
  }
  assert.equal(serverBoostBadge(start,new Date('2020-03-31T11:59:59.999Z')).name,'b_boost_1');
  assert.equal(serverBoostBadge(null),undefined);assert.equal(serverBoostBadge(new Date('invalid')),undefined);
});

test('公開フラグのバッジを表示し、金Bug Hunterを緑にせず未確認の新バッジを付けない',()=>{
  const names=publicBadgeNames(new UserFlagsBitField([UserFlags.Staff,UserFlags.BugHunterLevel1,UserFlags.BugHunterLevel2,UserFlags.PremiumEarlySupporter]));
  assert.deepEqual(new Set(names),new Set(['b_staff','b_bug_hunter_gold','b_early_supporter']));
  assert.deepEqual(publicBadgeNames(new UserFlagsBitField([UserFlags.BugHunterLevel1])),['b_bug_hunter_green']);
  assert.deepEqual(publicBadgeNames(new UserFlagsBitField()),[]);assert.deepEqual(publicBadgeNames(null),[]);
  for(const name of names)assert.ok(badgeManifest.some(badge=>badge.name===name));
});

test('旧バッジ名を参照しても新しいb_名に解決する',()=>{
  setEmojiMappings({b_staff:'<:b_staff_gb2_12345678:123>'});
  try{assert.equal(emoji('staff'),emoji('b_staff'));assert.equal(emoji('b_staff'),'<:b_staff_gb2_12345678:123>');}
  finally{setEmojiMappings({});}
});
