import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { MediaWorker } from '../src/services/media.ts';
import { MediaWorker as CompiledMediaWorker } from '../dist/services/media.js';

test('BunのWorkerでCanvasとsharpを使う文字画像を生成できる', async () => {
  const worker = new MediaWorker();
  try {
    for (const kind of ['text1', 'text2', 'text3', 'text4', 'text5']) {
      const output = await worker.run({ kind, text: '永AWV', square: true });
      const metadata = await sharp(output).metadata();
      assert.equal(metadata.format, 'png');
      assert.ok(metadata.width > 0 && metadata.height > 0);
    }
  } finally { await worker.close(); }
});

test('本番と同じビルド済みWorkerでもBunで画像を生成できる', async () => {
  const worker = new CompiledMediaWorker();
  try {
    const output = await worker.run({ kind: 'text1', text: '永AWV', square: true });
    assert.equal((await sharp(output).metadata()).format, 'png');
  } finally { await worker.close(); }
});
