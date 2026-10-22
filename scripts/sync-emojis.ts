import { REST, Routes } from 'discord.js';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp, {type OverlayOptions} from 'sharp';
import { settings, requireToken } from '../src/config.js';
import { manifest } from '../src/ui/emojis.js';

const rest = new REST({ version: '10' }).setToken(requireToken());
const app = await rest.get(Routes.oauth2CurrentApplication()) as { id: string };
if (app.id !== settings.applicationId || settings.production) throw new Error('ローカルの指定テストアプリのみ同期できます。');
const existing = await rest.get(Routes.applicationEmojis(app.id)) as { items: { name: string; id: string; animated: boolean }[] };
await mkdir(join(settings.dataDir, 'emoji-originals'), { recursive: true });
const mappings: Record<string, string> = {};
const report: { name: string; sourceId: string; status: string }[] = [];
const tiles: OverlayOptions[] = [];
for (const [i, entry] of manifest.entries()) {
  let found = existing.items.find(e => e.name === entry.name);
  const path = join(settings.dataDir, 'emoji-originals', `${entry.sourceId}.png`);
  let bytes: Buffer;
  try { bytes = await readFile(path); }
  catch {
    const response = await fetch(`https://cdn.discordapp.com/emojis/${entry.sourceId}.png?size=128&quality=lossless`, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) { report.push({ ...entry, status: `source HTTP ${response.status}` }); continue; }
    bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(path, bytes);
  }
  if (!found && !process.argv.includes('--audit-only')) {
    try {
      found = await rest.post(Routes.applicationEmojis(app.id), { body: { name: entry.name, image: `data:image/png;base64,${bytes.toString('base64')}` } }) as { name: string; id: string; animated: boolean };
    } catch (e) { report.push({ ...entry, status: e instanceof Error ? e.message : 'upload failed' }); continue; }
  }
  if (found) mappings[entry.name] = `<${found.animated ? 'a' : ''}:${entry.name}:${found.id}>`;
  const tile = await sharp(bytes).resize(64, 64, { fit: 'contain', background: '#24272d' }).png().toBuffer();
  const x = (i % 8) * 140; const y = Math.floor(i / 8) * 110;
  tiles.push({ input: tile, left: x + 38, top: y + 8 });
  tiles.push({ input: Buffer.from(`<svg width="140" height="30"><text x="70" y="20" text-anchor="middle" fill="white" font-size="13">${entry.name}</text></svg>`), left: x, top: y + 76 });
  report.push({ ...entry, status: found ? 'registered' : 'audited' });
}

let footerIcon = existing.items.find(e => e.name === 'bot_icon');
if (!footerIcon && !process.argv.includes('--audit-only')) {
  const bytes = await readFile('assets/bot-icon.png');
  footerIcon = await rest.post(Routes.applicationEmojis(app.id), { body: { name: 'bot_icon', image: `data:image/png;base64,${bytes.toString('base64')}` } }) as { name: string; id: string; animated: boolean };
}
if (footerIcon) mappings.bot_icon = `<:bot_icon:${footerIcon.id}>`;
if (!process.argv.includes('--audit-only')) await writeFile(join(settings.dataDir, 'emojis.json'), JSON.stringify(mappings, null, 2));
await writeFile(join(settings.dataDir, 'emoji-audit.json'), JSON.stringify(report, null, 2));
await sharp({ create: { width: 1120, height: Math.ceil(manifest.length / 8) * 110, channels: 4, background: '#24272d' } }).composite(tiles).png().toFile(join(settings.dataDir, 'emoji-contact-sheet.png'));
console.log(`既存絵文字 ${manifest.length}種 / 登録 ${Object.keys(mappings).length}種。確認画像: ${join(settings.dataDir, 'emoji-contact-sheet.png')}`);
const failures = report.filter(e => !['registered', 'audited'].includes(e.status));
if (failures.length) { console.log(failures); process.exitCode = 1; }
