import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { Store } from '../src/data/store.ts';

test('PGliteで大きいポイント・送金・順位・ログボ・並列処理を検証する', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'games-bot-pglite-'));
  let store = new Store('', directory);
  try {
    await store.initialize();
    const huge = 10n ** 110n;
    await store.reward('seed', { '100': huge, '200': -huge, '300': 0n });
    assert.equal(await store.reward('seed', { '100': huge }), false);
    await Promise.all(Array.from({ length: 8 }, (_, n) => store.reward(`parallel-${n}`, { '100': 1n })));
    assert.equal(await store.balance('100'), huge + 8n);
    assert.deepEqual((await store.ranking('999')).map(row => row.user_id), ['100', '300', '200']);
    assert.equal((await store.poorRanking('999'))[0].points, (-huge).toString());
    const result = await store.transfer('transfer', '100', '300', 100n);
    assert.equal(await store.balance('300'), 100n);
    await assert.rejects(store.transfer('transfer', '100', '300', 100n), /処理/);
    const before = await store.balance('100');
    await assert.rejects(store.accounts(['100'], accounts => { accounts.get('100').points = 1n; throw new Error('rollback'); }), /rollback/);
    assert.equal(await store.balance('100'), before);
    const date = new Date('2026-10-13T03:00:00Z');
    assert.equal((await store.login('300', '999', date)).received, true);
    assert.equal((await store.login('300', '999', date)).received, false);
    assert.equal(await store.toggleChannel('123456789012345678'), true);
    await store.saveSession('session', { owner: '300' });
    await store.close(); store = new Store('', directory); await store.initialize();
    assert.equal(await store.balance('100'), result.balance);
    assert.equal((await store.allowedChannels()).has('123456789012345678'), true);
    assert.equal((await store.sessions())[0].payload, JSON.stringify({ owner: '300' }));
    await assert.rejects(store.transaction(c => c.query("UPDATE games_bot_economy SET points='NaN' WHERE user_id=100")), /constraint/);
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }); }
});

test('旧SQLiteの全テーブルを一度だけ移行し、元ファイルと移行後の更新を保持する', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'games-bot-migrate-'));
  const path = join(directory, 'bot.sqlite');
  const legacy = new Database(path);
  legacy.exec(`CREATE TABLE games_bot_economy(user_id text PRIMARY KEY,points text,last_login text,consecutive_days integer,gamble_date text,gamble_count integer);
    CREATE TABLE games_bot_allowed_channels(channel_id text);
    CREATE TABLE games_bot_weather_cities(city_name text,city_id text);
    CREATE TABLE games_bot_events(event_id text,created_at text);
    CREATE TABLE games_bot_sessions(session_id text,payload text);`);
  const points = (10n ** 110n).toString();
  legacy.query('INSERT INTO games_bot_economy VALUES(?,?,?,?,?,?)').run('100', points, '2026-10-12', 4, '2026-10-12', 2);
  legacy.query('INSERT INTO games_bot_allowed_channels VALUES(?)').run('123456789012345678');
  legacy.query('INSERT INTO games_bot_weather_cities VALUES(?,?)').run('東京', 'city');
  legacy.query('INSERT INTO games_bot_events VALUES(?,?)').run('old-event', '2026-10-12');
  legacy.query('INSERT INTO games_bot_sessions VALUES(?,?)').run('old-session', '{}');
  legacy.close();
  let store = new Store('', directory);
  try {
    await store.initialize();
    assert.equal(await store.balance('100'), BigInt(points));
    assert.equal((await store.account('100')).consecutive, 4);
    assert.equal((await store.account('100')).gambleCount, 2);
    assert.equal((await store.allowedChannels()).has('123456789012345678'), true);
    for (const table of ['games_bot_economy', 'games_bot_allowed_channels', 'games_bot_weather_cities', 'games_bot_sessions'])
      assert.equal((await store.transaction(c => c.query(`SELECT count(*)::int AS count FROM ${table}`)))[0].count, 1);
    await store.reward('after-migration', { '100': 1n });
    await store.close(); store = new Store('', directory); await store.initialize();
    assert.equal(await store.balance('100'), BigInt(points) + 1n);
    const check = new Database(path, { readonly: true });
    try { assert.equal(check.query('SELECT points FROM games_bot_economy').get().points, points); } finally { check.close(); }
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }); }
});
