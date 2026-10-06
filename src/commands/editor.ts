import {UserError} from '../errors.js';
import { randomUUID } from 'node:crypto';
import { ActionRowBuilder, ButtonStyle, ComponentType, MessageFlags, ModalBuilder, PermissionFlagsBits, TextInputBuilder, TextInputStyle, type ButtonInteraction, type Client, type ModalSubmitInteraction } from 'discord.js';
import { card, button, row,legalFooter } from '../ui/cards.js';
import { Context } from './context.js';
import { emoji } from '../ui/emojis.js';

interface Draft { owner:string; channelId:string; title:string; body:string; color:number; image?:string; targetId?:string; targetVersion?:number|null; expires:number; busy:boolean }
interface PublishedEdit { id:string; title:string; channelId:string; at:number }
export class Editor {
  private drafts=new Map<string,Draft>();
  private published=new Map<string,PublishedEdit>();
  constructor(private client:Client) {}
  async open(ctx:Context) {
    if(!ctx.canManage)throw new UserError('カード編集には「メッセージの管理」権限が必要です。');
    for(const [key,d] of this.drafts)if(d.expires<Date.now())this.drafts.delete(key);
    const key=randomUUID();
    const draft:Draft={owner:ctx.user.id,channelId:ctx.channelId,title:ctx.text('title',0,'お知らせ'),body:ctx.text('body',1,'ここに本文を入力してください。'),color:0x3498db,expires:Date.now()+15*60_000,busy:false};
    if(ctx.slash?.options.getSubcommand()==='edit') {
      const id=ctx.text('message_id');if(!/^\d{17,20}$/.test(id))throw new UserError('メッセージIDを入力してください。');
      if(!ctx.channel||!('messages' in ctx.channel))throw new UserError('このチャンネルでは編集できません。');
      const message=await ctx.channel.messages.fetch(id);
      if(message.author.id!==this.client.user!.id||!message.flags.has(MessageFlags.IsComponentsV2))throw new UserError('このBotのComponents v2カードを指定してください。');
      const container=message.components.find(c=>c.type===ComponentType.Container);
      if(!container||container.type!==ComponentType.Container)throw new UserError('編集可能なカードが見つかりません。');
      const texts=container.components.filter(c=>c.type===ComponentType.TextDisplay).map(c=>c.content);
      const legal=texts.at(-1)===legalFooter;
      if(!(legal?texts.at(-2):texts.at(-1))?.includes('編集用カード'))throw new UserError('編集用カードのみ編集できます。ゲームやポイントの画面は対象外です。');
      const [heading,...bodyLines]=(texts[0]??'').split('\n');
      draft.title=heading?.replace(/^##\s+(?:<a?:[^>]+>|\S+)\s*/,'')??'お知らせ';
      draft.body=bodyLines.length?bodyLines.join('\n'):(!legal&&texts.length>2?texts[1]??'':'');
      draft.color=container.accentColor??draft.color;draft.targetId=id;draft.targetVersion=message.editedTimestamp;
      const gallery=container.components.find(c=>c.type===ComponentType.MediaGallery);
      if(gallery?.type===ComponentType.MediaGallery)draft.image=gallery.items[0]?.media.url;
    }
    this.drafts.set(key,draft);return ctx.send(this.preview(key,draft));
  }
  private preview(key:string,d:Draft) {
    const result=card(d.title,d.body,'info',[row(button(`editor:${key}:edit`,'内容を編集',ButtonStyle.Primary,emoji('status_info')),button(`editor:${key}:publish`,d.targetId?'変更を反映':'このチャンネルへ投稿',ButtonStyle.Success,emoji('status_success')),button(`editor:${key}:cancel`,'取り消す',ButtonStyle.Secondary,emoji('status_warning')))],`プレビュー · 自分のみ操作できます${d.targetId?' · 投稿済みカードを編集':''}`,d.image);
    result.components[0]!.setAccentColor(d.color);return result;
  }
  private check(key:string|undefined, owner:string, channelId:string|null, permission:boolean) {
    const d=this.drafts.get(key??'');
    if(!d||d.owner!==owner||d.channelId!==channelId||d.expires<Date.now()||!permission)throw new UserError('プレビューの期限か権限を確認し、もう一度 `embed` を実行してください。');
    if(d.busy)throw new UserError('現在投稿処理中です。');return d;
  }
  async handle(i:ButtonInteraction|ModalSubmitInteraction) {
    const [,key,action]=i.customId.split(':');const permission=i.memberPermissions?.has(PermissionFlagsBits.ManageMessages)??false;
    const d=this.check(key,i.user.id,i.channelId,permission);
    if(action==='edit'&&i.isButton()) {
      const modal=new ModalBuilder().setCustomId(`editor:${key}:save`).setTitle('カードの内容を編集');
      for(const [id,label,value,max,style] of [
        ['title','タイトル',d.title,100,TextInputStyle.Short],['body','本文',d.body,3000,TextInputStyle.Paragraph],['color','アクセントカラー (#3498db)',`#${d.color.toString(16).padStart(6,'0')}`,7,TextInputStyle.Short],['image','画像URL（空欄で削除）',d.image??'',1000,TextInputStyle.Short],
      ] as const)modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setValue(value).setMaxLength(max).setRequired(id!=='image').setStyle(style)));
      return i.showModal(modal);
    }
    if(action==='save'&&i.isModalSubmit()) {
      const color=i.fields.getTextInputValue('color');if(!/^#[a-f\d]{6}$/i.test(color))throw new UserError('カラーは #3498db のような6桁の色コードで指定してください。');
      const image=i.fields.getTextInputValue('image').trim();if(image&&(!URL.canParse(image)||new URL(image).protocol!=='https:'))throw new UserError('画像URLは https:// から始まるURLを指定してください。');
      if(!i.fields.getTextInputValue('title').trim()||!i.fields.getTextInputValue('body').trim())throw new UserError('タイトルと本文に文字を入力してください。');
      d.title=i.fields.getTextInputValue('title').trim();d.body=i.fields.getTextInputValue('body').trim();d.color=parseInt(color.slice(1),16);d.image=image||undefined;
      await i.deferUpdate();return i.editReply(this.preview(key!,d));
    }
    if(!i.isButton())return;
    await i.deferUpdate();
    if(action==='cancel'){this.drafts.delete(key!);return i.editReply(card('取り消しました','カードの投稿・変更は行っていません。'));}
    if(action!=='publish')throw new UserError('操作が見つかりません。');
    d.busy=true;
    try {
      const channel=await this.client.channels.fetch(d.channelId);
      if(!channel?.isSendable())throw new UserError('このチャンネルには投稿できません。');
      const payload=card(d.title,d.body,'info',[],'編集用カード · ボタンから再編集',d.image);payload.components[0]!.setAccentColor(d.color);
      let message;
      if(d.targetId){
        message=await channel.messages.fetch(d.targetId);
        if(message.author.id!==this.client.user!.id)throw new UserError('対象の投稿者が一致しません。');
        if(message.editedTimestamp!==d.targetVersion)throw new UserError('プレビューを開いた後に、このカードが更新されています。内容を確認してから、もう一度編集してください。');
        await message.edit(payload);
      }
      else message=await channel.send(payload);
      this.remember(message.id,d.title,d.channelId);this.drafts.delete(key!);
      return i.editReply(card(d.targetId?'変更を反映しました':'投稿しました',`[投稿したカードを開く](${message.url})`,'success'));
    } finally {d.busy=false;}
  }
  private remember(id:string,title:string,channelId:string) {
    const now=Date.now();this.published.set(id,{id,title,channelId,at:now});
    for(const [key,value] of this.published)if(now-value.at>24*3600_000)this.published.delete(key);
    while(this.published.size>50) {
      const oldest=[...this.published.values()].sort((a,b)=>a.at-b.at)[0]!;
      this.published.delete(oldest.id);
    }
  }
  recentEditorCards(channelId:string):PublishedEdit[] {
    const now=Date.now();
    for(const [key,value] of this.published)if(now-value.at>24*3600_000)this.published.delete(key);
    return [...this.published.values()].filter(entry=>entry.channelId===channelId).sort((a,b)=>b.at-a.at);
  }
}
