import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {commandNames} from '../src/commands/definitions.ts';
import {bugReportUrl,reportOperation} from '../src/ui/bug-report.ts';
import {exceptionCards} from '../src/ui/errors.ts';
import {UserError} from '../src/errors.ts';

const date=new Date('2026-10-23T00:00:00.000Z');
const reportLink=payload=>payload.components[0].toJSON().components
  .flatMap(component=>component.components??[]).find(component=>component.url)?.url;

test('報告フォームへ操作・時刻・エラーIDだけを自動入力する',()=>{
  const url=new URL(bugReportUrl('/imakita','0a4dcaf0',date));
  assert.equal(url.origin,'https://github.com');
  assert.equal(url.pathname,'/y-exe/games-bot/issues/new');
  assert.equal(url.searchParams.get('template'),'bug-report.yml');
  assert.equal(url.searchParams.get('title'),'[不具合] 0a4dcaf0');
  assert.equal(url.searchParams.get('diagnostics'),'操作: imakita\n日時: 2026-10-23T00:00:00.000Z\nエラーID: 0a4dcaf0');
  assert.equal(url.searchParams.get('problem'),null);
  const form=readFileSync(new URL('../.github/ISSUE_TEMPLATE/bug-report.yml',import.meta.url),'utf8');
  assert.match(form,/id: problem/);assert.match(form,/id: diagnostics/);
  assert.match(form,/required: true/);assert.match(form,/required: false/);
});

test('任意の操作・IDやcustomId内の非公開情報を報告URLに含めない',()=>{
  const inputs=['https://private.example/secret?cookie=value','again:bet:private-user:123456789012345678','game:private-session:2:move','prompt:voice:private-text','unknown:private-session','toString:private'];
  for(const input of inputs){
    const url=new URL(bugReportUrl(input,'private-token',date));
    assert.ok(!decodeURIComponent(url.href).includes('private'));
    assert.ok(!url.searchParams.get('diagnostics').includes('123456789012345678'));
    assert.ok(!url.searchParams.get('diagnostics').includes('エラーID'));
  }
  assert.equal(reportOperation('again:bet:private-user'),'bet');
  assert.equal(reportOperation('game:private-session:2:move'),'対戦の操作');
});

test('全コマンドとボタンのURLがDiscordの512文字制限に収まる',()=>{
  for(const operation of [...commandNames,'game:id:2:move','replay:id','eco:id','help:home','time:JP','tenki:東京','rate:100:USD','summary:id','editor:id','prompt:voice:id','again:bet:id','legacy command','interaction','不明']){
    for(const id of ['0a4dcaf0',undefined])assert.ok(bugReportUrl(operation,id,date).length<=512,operation);
  }
});

test('エラー画面とログの報告ID・時刻を揃え、詳細を含めず法的リンクを最下部に保つ',()=>{
  const original=console.error;console.error=()=>{};
  try {
    const cards=exceptionCards(new Error('private exception and token'),'again:bet:private-user');
    const response=new URL(reportLink(cards.response)),diagnostic=new URL(reportLink(cards.diagnostic));
    assert.equal(response.href,diagnostic.href);
    const text=cards.response.components[0].toJSON().components[0].content;
    const id=text.match(/エラーID: `([a-f0-9]{8})`/)[1];
    assert.match(response.searchParams.get('diagnostics'),new RegExp(id));
    assert.ok(!decodeURIComponent(response.href).includes('private'));
    for(const payload of [cards.response,cards.diagnostic])assert.match(payload.components[0].toJSON().components.at(-1).content,/利用規約.*プライバシーポリシー/);
    const friendly=exceptionCards(new UserError('権限を確認してください。'),'setchannel');
    assert.ok(!new URL(reportLink(friendly.response)).searchParams.get('diagnostics').includes('エラーID'));
    const expired=exceptionCards(Object.assign(new Error('Unknown interaction'),{code:10062}),'again:bet:private-user');
    assert.equal(expired.unavailable,true);assert.ok(reportLink(expired.diagnostic));
  } finally {console.error=original;}
});
