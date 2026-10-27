import assert from 'node:assert/strict';
import { test } from 'node:test';
import { errorReport, UserError } from '../src/errors.ts';
import {exceptionCards,replyWithError} from '../src/ui/errors.ts';
import {settings} from '../src/config.ts';

test('internal details stay in redacted logs and do not reach users', () => {
  const previous = process.env.DISCORD_BOT_TOKEN;
  process.env.DISCORD_BOT_TOKEN = 'test-secret-token';
  const original = console.error;
  const logs = [];
  console.error = message => logs.push(message);
  try {
    const report = errorReport(new Error('internal SQL table test-secret-token'), 'database');
    assert.ok(report.body.includes(report.id));
    assert.ok(!report.body.includes('internal SQL'));
    assert.ok(!report.body.includes('test-secret-token'));
    assert.ok(logs[0].includes('internal SQL'));
    assert.ok(!logs[0].includes('test-secret-token'));
    assert.equal(errorReport(new UserError('金額を指定してください。'), 'bet').body, '金額を指定してください。');
  } finally {
    console.error = original;
    if (previous === undefined) delete process.env.DISCORD_BOT_TOKEN;
    else process.env.DISCORD_BOT_TOKEN = previous;
  }
});

test('公開カードと調査用カードのIDを揃え、コード・処理名・時刻を残し秘密とスタックはDiscordへ出さない',()=>{
  const original=console.error,logs=[];console.error=line=>logs.push(line);
  try {
    const error=Object.assign(new Error('password="sensitive-value" postgres://user:password@db.example/private SQL internal_table'),{name:'DiscordAPIError',code:10062,status:404});
    const failure=exceptionCards(error,'again:bet:example');
    const response=failure.response.components[0].toJSON().components[0].content;
    const diagnostic=failure.diagnostic.components[0].toJSON().components[0].content;
    const id=response.match(/エラーID: `([\da-f]{8})`/)[1];
    assert.ok(diagnostic.includes(id));assert.ok(logs[0].includes(id));assert.match(logs[0],/code=10062/);
    assert.match(diagnostic,/again:bet:example/);assert.match(diagnostic,/10062/);assert.match(diagnostic,/404/);assert.match(diagnostic,/<t:\d+:F>/);
    for(const value of [response,diagnostic])for(const forbidden of ['sensitive-value','postgres://','internal_table','at exceptionCards'])assert.ok(!value.includes(forbidden));
    assert.ok(!logs[0].includes('sensitive-value'));assert.ok(!logs[0].includes('postgres://'));assert.equal(failure.unavailable,true);
  } finally {console.error=original;}
});

test('期限切れのinteractionへ再返信して二次エラーを起こさず、受付済みの非公開返信は編集する',async()=>{
  const originalLog=console.error,originalChannel=settings.errorLogChannelId;
  console.error=()=>{};settings.errorLogChannelId='';
  try {
    let replies=0;
    const expired={customId:'again:gamble:owner',isChatInputCommand:()=>false,isRepliable:()=>true,reply:async()=>{replies++;},followUp:async()=>{replies++;},editReply:async()=>{replies++;}};
    for(const code of [10062,10015,50027])await replyWithError(expired,Object.assign(new Error('Expired response'),{code}));
    assert.equal(replies,0);
    await replyWithError({...expired,deferred:true,ephemeral:true,editReply:async()=>{replies++;}},new UserError('このボタンは期限切れです。'));
    assert.equal(replies,1);
  } finally {console.error=originalLog;settings.errorLogChannelId=originalChannel;}
});
