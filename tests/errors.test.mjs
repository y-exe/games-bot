import assert from 'node:assert/strict';
import { test } from 'node:test';
import { errorReport, UserError } from '../src/errors.ts';

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
