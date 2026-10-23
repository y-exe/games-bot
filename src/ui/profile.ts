import {ContainerBuilder,SectionBuilder,TextDisplayBuilder,ThumbnailBuilder,SeparatorBuilder,SeparatorSpacingSize,MessageFlags,type ButtonBuilder,type ActionRowBuilder} from 'discord.js';
import {legalFooter} from './cards.js';
import {emoji} from './emojis.js';

export function profileCard(title:string,summary:string,body:string,avatar:string,rows:ActionRowBuilder<ButtonBuilder>[]=[],accent=0x3498db) {
  const container=new ContainerBuilder().setAccentColor(accent).addSectionComponents(
    new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${emoji('status_info')} ${title}\n${summary}`))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatar)),
  );
  if(body)container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  if(rows.length){container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));for(const row of rows)container.addActionRowComponents(row);}
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(legalFooter));
  return {flags:MessageFlags.IsComponentsV2 as const,components:[container],allowedMentions:{parse:[] as ('users'|'roles'|'everyone')[],repliedUser:false}};
}
