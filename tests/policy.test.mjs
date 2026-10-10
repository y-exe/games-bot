import assert from 'node:assert/strict';
import { test } from 'node:test';
import { channelAllowsCommand, channelAllowsComponent, expiredInteraction } from '../src/commands/policy.ts';

test('未設定チャンネルでも今北産業の要約と詳細を切り替えられる', () => {
  const allowed = new Set();
  assert.equal(channelAllowsCommand('imakita', 'channel', allowed), true);
  for (const id of ['summary:detail:owner', 'summary:short:owner']) {
    assert.equal(channelAllowsComponent(id, 'channel', allowed), true);
    assert.equal(expiredInteraction(id, 11 * 60_000), true);
  }
});

test('要約ボタンの修正でゲーム・ポイント操作のチャンネル制限を解除しない', () => {
  for (const id of ['replay:othello', 'eco:login:owner', 'again:bet:100']) {
    assert.equal(channelAllowsComponent(id, 'channel', new Set()), false);
    assert.equal(channelAllowsComponent(id, 'channel', new Set(['channel'])), true);
  }
});
