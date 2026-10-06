import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { settings } from '../config.js';

export interface EmojiEntry { name: string; sourceId: string; animated: boolean }
export const manifest: EmojiEntry[] = JSON.parse(readFileSync('assets/emoji-manifest.json', 'utf8').replace(/^\uFEFF/, ''));
let registered: Record<string, string> = {};
export function loadEmojis() {
  try { registered = JSON.parse(readFileSync(join(settings.dataDir, 'emojis.json'), 'utf8')); }
  catch { registered = {}; }
}
export function emoji(name: string) {
  if (registered[name]) return registered[name]!;
  const source=manifest.find(e=>e.name===name);
  return source?`<${source.animated?'a':''}:${name}:${source.sourceId}>`:'';
}
export const handEmojis = { rock: '✊', scissors: '✌️', paper: '✋' };
