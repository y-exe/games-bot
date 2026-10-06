import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, type StringSelectMenuBuilder } from 'discord.js';
import { emoji } from './emojis.js';

export type Status = 'success' | 'danger' | 'info' | 'warning' | 'pending';
const colors: Record<Status,number> = { success: 0x2ecc71, danger: 0xe74c3c, info: 0x3498db, warning: 0xe67e22, pending: 0x95a5a6 };
export const legalFooter='-# [利用規約](https://github.com/y-exe/games-bot/blob/main/TERMS_OF_SERVICE.md)・[プライバシーポリシー](https://github.com/y-exe/tokumei-bot/blob/main/PRIVACY_POLICY.md)';
export type CardRow = ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>;
export function button(id: string, label: string, style = ButtonStyle.Secondary, icon?: string, disabled = false) {
  const b = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(icon&&/^<a?:status_[^:]+:\d+>$/.test(icon)?ButtonStyle.Secondary:style).setDisabled(disabled);
  if (icon && !/^:[^:]+:$/.test(icon)) b.setEmoji(icon);
  return b;
}
export const row = (...buttons: ButtonBuilder[]) => new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
export function card(title: string, body: string, status: Status = 'info', rows: CardRow[] = [], footer?: string, image?: string, thumbnail?:string,accent?:number) {
  const container = new ContainerBuilder().setAccentColor(accent??colors[status]);
  const heading=`## ${emoji(`status_${status}`)} ${title}`;
  if(thumbnail) {
    container.addSectionComponents(new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(heading)).setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail)));
    if(body)container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  } else container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${heading}${body?`\n${body}`:''}`));
  if (image) container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(image).setDescription(title)));
  if(footer)container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footer}`));
  const seen=new Set<string>();
  if (rows.length) { container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)); for (const r of rows) {
    const data=r.toJSON();
    for(const control of data.components)if(control.type===2&&'emoji' in control&&control.emoji) {
      const key=control.emoji.id??control.emoji.name!;
      if(seen.has(key))delete control.emoji;else seen.add(key);
    }
    container.addActionRowComponents(data);
  } }
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(legalFooter));
  return { flags: MessageFlags.IsComponentsV2 as const, components: [container], allowedMentions: { parse: [] as ('users'|'roles'|'everyone')[], repliedUser: false } };
}
export function errorCard(message: string) { return card('操作を確認してください', message.replace(/。(?!\n|$)/g,'。\n'), 'warning'); }
export function disabledRawComponents(components:readonly unknown[]) {
  return components.map(component=>{
    const data=component as {type:number;components?:{disabled?:boolean}[]};
    if(data.type===1&&Array.isArray(data.components))return {...data,components:data.components.map(control=>({...control,disabled:true}))};
    return data;
  });
}
export function disableCardControls(payload:ReturnType<typeof card>) {
  return {...payload,components:payload.components.map(container=>{
    const data=container.toJSON();
    return new ContainerBuilder({...data,components:data.components.map(component=>component.type===1?{...component,components:component.components.map(control=>({...control,disabled:true}))}:component)});
  })};
}
