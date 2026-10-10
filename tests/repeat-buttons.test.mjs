import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Economy } from '../src/commands/economy.ts';
import { Games } from '../src/games/manager.ts';

function findId(payload, prefix) {
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.custom_id === 'string' && value.custom_id.startsWith(prefix)) return value.custom_id;
    for (const child of Object.values(value)) { const found = visit(child); if (found) return found; }
  };
  return visit(JSON.parse(JSON.stringify(payload)));
}

test('betの再実行は本人・元のチャンネルのみ許可し、大きい金額も短いボタンIDで保持する', async () => {
  const amount = '1' + '0'.repeat(110);
  const economy = new Economy({ accounts: async (_ids, work) => work(new Map([['owner', { points: BigInt(amount) * 2n }]]), {}), once: async () => true }, () => 'bot');
  try {
    let payload;
    await economy.run('bet', { user: { id: 'owner' }, channelId: 'channel', id: 'operation', text: () => amount, send: async value => { payload = value; } });
    const customId = findId(payload, 'again:bet:');
    assert.ok(customId.length < 100);
    const interaction = { customId, user: { id: 'owner' }, channelId: 'channel' };
    assert.deepEqual(economy.repeatAction(interaction), { kind: 'bet', args: [amount] });
    assert.throws(() => economy.repeatAction({ ...interaction, user: { id: 'other' } }), /最初にコマンドを実行した人専用/);
    assert.throws(() => economy.repeatAction({ ...interaction, channelId: 'elsewhere' }), /期限切れ/);
    assert.throws(() => economy.repeatAction({ ...interaction, customId: 'again:bet:100' }), /期限切れ/);
    await economy.expire(Date.now() + 600_001);
    assert.throws(() => economy.repeatAction(interaction), /期限切れ/);
  } finally { economy.close(); }
});

test('ギャンブルは本人のみ再実行でき、本人情報のない旧ボタンを拒否する', () => {
  const economy = new Economy({}, () => 'bot');
  try {
    assert.deepEqual(economy.repeatAction({ customId: 'again:gamble:owner', user: { id: 'owner' }, channelId: 'channel' }), { kind: 'gamble', args: [] });
    assert.throws(() => economy.repeatAction({ customId: 'again:gamble:owner', user: { id: 'other' }, channelId: 'channel' }), /最初にコマンドを実行した人専用/);
    assert.throws(() => economy.repeatAction({ customId: 'again:gamble', user: { id: 'owner' }, channelId: 'channel' }), /古い形式/);
  } finally { economy.close(); }
});

test('ゲームの再募集は対戦相手も押せず、募集者だけが元の設定で募集できる', async () => {
  const games = new Games({ user: { id: 'bot' } }, {});
  const state = { id: 'session', kind: 'highlow', host: 'owner', phase: 'finished', size: 8, bet: '1' + '0'.repeat(110), channelId: 'channel', players: ['owner', 'opponent'] };
  const customId = findId(await games.payload(state), 'replay:');
  assert.ok(customId.length < 100);
  let deferred = 0, created = 0;
  games.create = async (...args) => { created++; assert.equal(args[1], 'owner'); assert.equal(args[6], BigInt(state.bet)); };
  const interaction = { customId, user: { id: 'opponent' }, channelId: 'channel', deferReply: async () => { deferred++; } };
  await assert.rejects(games.replay(interaction), /最初にコマンドを実行した人専用/);
  assert.equal(deferred, 0); assert.equal(created, 0);
  await games.replay({ ...interaction, user: { id: 'owner' } });
  assert.equal(deferred, 1); assert.equal(created, 1);
  await assert.rejects(games.replay({ ...interaction, customId: 'replay:highlow:8:100' }), /期限切れ/);
  await games.close();
});
