import { REST, Routes } from 'discord.js';
import { requireToken, settings } from '../src/config.js';
import { slashCommands } from '../src/commands/definitions.js';
if(!settings.guildId&&!settings.production)throw new Error('TEST_GUILD_ID を .env.local に設定してください。ローカルではグローバル登録しません。');
const rest=new REST({version:'10'}).setToken(requireToken());
const app=await rest.get(Routes.oauth2CurrentApplication()) as {id:string};
if(app.id!==settings.applicationId)throw new Error('アプリケーションIDが一致しません。');
if(settings.guildId) {
  await rest.put(Routes.applicationGuildCommands(app.id,settings.guildId),{body:slashCommands.map(c=>c.toJSON())});
  await rest.put(Routes.applicationCommands(app.id),{body:[]});
  console.log(`${slashCommands.map(c=>`/${c.name}`).join(' · ')} を ${settings.guildId} に登録し、グローバルの旧登録を掃除しました。`);
} else {
  await rest.put(Routes.applicationCommands(app.id),{body:slashCommands.map(c=>c.toJSON())});
  console.log(`${slashCommands.map(c=>`/${c.name}`).join(' · ')} をグローバルに登録しました。`);
}
