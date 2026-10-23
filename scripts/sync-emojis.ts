import {REST} from 'discord.js';
import {settings,requireToken} from '../src/config.js';
import {emojiApi,syncBotEmojis,resetEmojiAssets,loadAllEmojiAssets,emojiAssetName} from '../src/ui/emoji-sync.js';

const rest=new REST({version:'10'}).setToken(requireToken());
const api=emojiApi(rest,settings.applicationId);
if(process.argv.includes('--audit-only')) {
  if(await api.applicationId()!==settings.applicationId)throw new Error('アプリケーションIDが一致しません。');
  const existing=await api.list(),assets=await loadAllEmojiAssets();
  const {readFile}=await import('node:fs/promises');
  const {join}=await import('node:path');
  const {createHash}=await import('node:crypto');
  let records:{id:string;sha256?:string}[]=[];
  try {
    const saved=JSON.parse(await readFile(join(settings.dataDir,'emoji-sync.json'),'utf8'));
    if(saved.applicationId===settings.applicationId)records=saved.assets??[];
  }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  const missing=assets.filter(asset=>!existing.some(emoji=>emoji.name===emojiAssetName(asset)&&records.some(record=>record.id===emoji.id&&record.sha256===createHash('sha256').update(asset.image).digest('hex'))));
  console.log(`登録 ${existing.length} / 最新素材の未登録 ${missing.length}`);
}else if(process.argv.includes('--reset')) {
  const {randomUUID}=await import('node:crypto');
  const {readFile}=await import('node:fs/promises');
  const {join}=await import('node:path');
  let id=randomUUID() as string;
  try {
    const state=JSON.parse(await readFile(join(settings.dataDir,'emoji-reset.json'),'utf8'));
    if(state.applicationId===settings.applicationId&&state.phase!=='done')id=state.id;
  }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  const result=await resetEmojiAssets(api,settings.applicationId,settings.dataDir,await loadAllEmojiAssets(),id);
  console.log(`絵文字を再登録: ${result.total}個`);
}else {
  await syncBotEmojis(rest,settings.applicationId,settings.dataDir);
}
