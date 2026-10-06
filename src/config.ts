import {UserError} from './errors.js';
import { config } from 'dotenv';
import { resolve } from 'node:path';

const production = process.env.BOT_ENV === 'production';
config({ path: production ? '.env' : '.env.local', quiet: true });
export const settings = {
  production,
  token: process.env.DISCORD_BOT_TOKEN ?? '',
  applicationId: process.env.DISCORD_APPLICATION_ID ?? '',
  ownerId: process.env.BOT_OWNER_ID ?? '1102557945889300480',
  guildId: process.env.TEST_GUILD_ID ?? '',
  testChannelId: process.env.TEST_CHANNEL_ID ?? '',
  databaseUrl: process.env.DATABASE_URL ?? '',
  dataDir: resolve(process.env.DATA_DIR ?? '.local'),
  deepseekKey: process.env.DEEPSEEK_API_KEY ?? '',
  voicevoxKey: process.env.VOICEVOX_API_KEY ?? '',
  voiceGuildIds: new Set((process.env.VOICE_GUILD_IDS??(production?'1355073968532619376,1369344086326116453':process.env.TEST_GUILD_ID??'')).split(',').map(id=>id.trim()).filter(Boolean)),
  rvcPython: process.env.RVC_PYTHON || (production ? 'python' : resolve('.rvc/Scripts/python.exe')),
  rvcRoot: resolve(process.env.RVC_ROOT || (production ? '/opt/rvc' : '.local/rvc')),
  rvcAssets: resolve(process.env.RVC_ASSETS || (production ? '/app/rvc-assets' : '.local/rvc-assets')),
  ffprobe: process.env.FFPROBE_PATH || 'ffprobe',
  turnTimeoutMs: 180_000,
};
export function requireToken() {
  if (!settings.token) throw new UserError('DISCORD_BOT_TOKEN を .env.local に設定してください。');
  return settings.token;
}
