import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createConversationSummarizer, conversationHistory, parseSummaryMinutes, summaryRanges } from '../src/services/conversation.ts';
import { summaryAction, summaryCard } from '../src/ui/summary.ts';
import { slashCommands } from '../src/commands/definitions.ts';

const now = Date.now();
const message = (minutes, content, bot = false) => ({ id: String((BigInt(now - minutes * 60_000) - 1420070400000n) << 22n), createdTimestamp: now - minutes * 60_000, content, author: { id: '123', bot } });
function channel(id, messages) {
  const calls = [];
  return { id, calls, messages: { fetch: async options => {
    calls.push(options);
    return new Map(messages.filter(m => BigInt(m.id) < BigInt(options.before)).sort((a, b) => b.createdTimestamp - a.createdTimestamp).slice(0, options.limit).map(m => [m.id, m]));
  } } };
}
function controls(payload) {
  return payload.components.flatMap(container => container.toJSON().components).flatMap(component => component.type === 1 ? component.components : []);
}

test('10・30・60分の定義と、60分の古い会話・境界・Bot除外を確認する', () => {
  assert.equal(parseSummaryMinutes(), 30);
  assert.equal(parseSummaryMinutes('60'), 60);
  assert.throws(() => parseSummaryMinutes(15), /10分・30分・60分/);
  assert.deepEqual(summaryRanges(10), [[10, 5], [5, 0]]);
  assert.deepEqual(summaryRanges(30), [[30, 20], [20, 10], [10, 0]]);
  assert.deepEqual(summaryRanges(60), [[60, 45], [45, 30], [30, 15], [15, 0]]);
  const history = conversationHistory([message(45, '45分前'), message(60, '境界外'), message(5, 'Botの発言', true), message(-1, '未来'), message(0, '現在')], now, 60);
  assert.match(history, /45分前/); assert.match(history, /現在/);
  assert.doesNotMatch(history, /境界外|未来|Botの発言/);
});

test('要約と詳細は同じ取得結果を使い、範囲ごとのキャッシュを混ぜない', async () => {
  const prompts = [];
  const summarize = createConversationSummarizer(async prompt => { prompts.push(prompt); return '- 要約'; });
  const target = channel('summary-window-test', [message(50, '古い話題'), message(25, '中間の話題'), message(3, '最近の話題')]);
  const short = await summarize(target, false, 60, now);
  assert.match(prompts[0], /古い話題/); assert.equal(short.count, 3);
  const detail = await summarize(target, true, 60, now);
  assert.equal(target.calls.length, 1);
  assert.match(detail.text, /60〜45分前/); assert.match(detail.text, /この時間帯に要約できる会話はありません/);
  const count = prompts.length;
  assert.deepEqual(await summarize(target, false, 60, now), short);
  assert.equal(prompts.length, count);
  const recent = await summarize(target, false, 10, now);
  assert.equal(recent.count, 1); assert.doesNotMatch(prompts.at(-1), /古い話題|中間の話題/);
  assert.equal(target.calls.length, 2);
});

test('200件に達した際は取得漏れを明示し、範囲の外まで取得した場合は警告しない', async () => {
  const summarize = createConversationSummarizer(async () => '- 要約');
  const many = Array.from({ length: 210 }, (_, i) => message((i + 1) / 60, `投稿${i}`));
  const target = channel('summary-limit-test', many);
  const result = await summarize(target, false, 60, now);
  assert.equal(target.calls.length, 2); assert.equal(result.count, 200); assert.equal(result.limited, true);
  const detail = await summarize(target, true, 60, now);
  assert.match(detail.text, /取得上限のため/);
  const full = await summarize(channel('summary-complete-test', [message(1, '会話'), message(61, '範囲外')]), false, 60, now);
  assert.equal(full.count, 1); assert.equal(full.limited, false);
  const empty = await summarize(channel('summary-empty-test', []), false, 10, now);
  assert.match(empty.text, /過去10分/); assert.equal(empty.count, 0);
});

test('範囲変更は共有キャッシュを使い、詳細切替は取得時刻を保持して更新操作を提供しない', () => {
  const result = { text: '- 詳細', minutes: 60, at: now, count: 200, limited: true, detailed: true };
  const payload = summaryCard(result, 'owner');
  const sections = payload.components[0].toJSON().components;
  assert.doesNotMatch(sections[0].content, /取得時点の対象/);
  assert.match(sections[1].content, /^-# 取得時点の対象: <t:\d+:t>〜<t:\d+:t> · 会話 200件$/);
  assert.doesNotMatch(JSON.stringify(payload), /DeepSeek|ボタンは実行者専用|取得: /);
  const buttons = controls(payload);
  assert.equal(buttons.length, 4);
  assert.equal(payload.components[0].toJSON().components.filter(component => component.type === 1).length, 1);
  assert.equal(buttons.find(b => b.label === '60分').disabled, true);
  assert.equal(buttons.find(b => b.label === '60分').style, 3);
  assert.equal(buttons.find(b => b.label === '3行の要約に戻る').style, 1);
  const range = summaryAction(buttons.find(b => b.label === '10分').custom_id, 'owner', now + 1000);
  assert.deepEqual(range, { minutes: 10, detailed: true, at: undefined });
  const short = summaryAction(buttons.find(b => b.label === '3行の要約に戻る').custom_id, 'owner', now + 1000);
  assert.deepEqual(short, { minutes: 60, detailed: false, at: now });
  assert.ok(buttons.every(button => !button.custom_id.includes('refresh') && !button.label.includes('更新')));
  assert.throws(() => summaryAction(`summary:refresh-short:owner:60:${now}`, 'owner', now), /要約を開き直して/);
  assert.match(JSON.stringify(payload), /最新200件/);
  assert.throws(() => summaryAction(buttons[0].custom_id, 'other', now), /実行した人専用/);
  assert.throws(() => summaryAction(buttons[0].custom_id, 'owner', now + 1_800_001), /期限切れ/);
  assert.equal(summaryAction('summary:detail:owner', 'owner', now).minutes, 30);
  const definition = slashCommands.find(command => command.name === 'imakita').toJSON();
  assert.deepEqual(definition.options[0].choices.map(choice => choice.value), [10, 30, 60]);
});

test('再実行と範囲の往復は同じチャンネル・範囲の取得結果と要約を共有する', async () => {
  let requests = 0;
  const summarize = createConversationSummarizer(async () => { requests++; return '- 要約'; });
  const target = channel('summary-shared-cache-test', [message(5, '最近の会話'), message(40, '前の会話')]);
  const first = await summarize(target, false, 10);
  const others = await Promise.all(Array.from({ length: 5 }, () => summarize(target, false, 10)));
  assert.ok(others.every(result => result.at === first.at));
  assert.equal(target.calls.length, 1); assert.equal(requests, 1);
  await summarize(target, false, 60);
  const range = summaryAction(`summary:range-short:owner:10:${now}`, 'owner', Date.now());
  assert.deepEqual(await summarize(target, range.detailed, range.minutes, range.at), first);
  assert.equal(target.calls.length, 2); assert.equal(requests, 2);
});
