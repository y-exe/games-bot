import {UserError} from '../errors.js';
import { ComponentType, MessageFlags, PermissionFlagsBits, type Attachment, type ButtonInteraction, type ChatInputCommandInteraction, type Client, type FileUploadModalData, type GuildMember, type Message, type MessageCreateOptions, type ModalSubmitInteraction, type User } from 'discord.js';
import { card } from '../ui/cards.js';
import {resolveGuildTarget} from './targets.js';
import {redact} from '../errors.js';
import {isPublicChannel} from '../ui/errors.js';

export class Context {
  private response?:Message;
  private privateDelivery=false;
  makePrivate(){if(!this.privateDelivery)this.response=undefined;this.privateDelivery=true;}
  constructor(readonly source: Message|ChatInputCommandInteraction|ModalSubmitInteraction|ButtonInteraction, readonly client: Client, readonly args: string[] = []) {}
  get slash() { return 'options' in this.source ? this.source : undefined; }
  get modal() { return 'fields' in this.source ? this.source as ModalSubmitInteraction : undefined; }
  get user() { return this.slash?.user??this.modal?.user??('user' in this.source?this.source.user:(this.source as Message).author); }
  get channel() { return this.source.channel; }
  get channelId() { return this.source.channelId??''; }
  get guild() { return this.source.guild; }
  get member() { return this.source.member as GuildMember|null; }
  get id() { return this.source.id; }
  get canManage() { return this.member?.permissions?.has(PermissionFlagsBits.ManageMessages)??false; }
  get admin() { return this.member?.permissions?.has(PermissionFlagsBits.Administrator)??false; }
  text(option: string, index=0, fallback='') { return this.slash?.options.getString(option)??this.args[index]??fallback; }
  async target(option: string, index=0): Promise<User|undefined> {
    const user=this.slash?.options.getUser(option);const input=user?.id??this.args[index];
    if(input===undefined)return undefined;
    if(!this.guild)throw new UserError('相手の指定はサーバー内で行ってください。');
    return resolveGuildTarget(this.guild,input);
  }
  attachment(preferred='image'): Attachment|undefined {
    const slashAttachment=this.slash?.options.getAttachment(preferred)??this.slash?.options.getAttachment('image');
    if(slashAttachment)return slashAttachment;
    for(const data of this.modal?.fields.fields.values()??[])if(data.type===ComponentType.FileUpload)return (data as FileUploadModalData).attachments.first();
    return 'attachments' in this.source?this.source.attachments.first():undefined;
  }
  modalCheckbox(id:string):boolean|undefined {
    for(const data of this.modal?.fields.fields.values()??[])if(data.customId===id&&data.type===ComponentType.Checkbox)return data.value;
    return undefined;
  }
  modalRadio(id:string):string|undefined {
    for(const data of this.modal?.fields.fields.values()??[])if(data.customId===id&&data.type===ComponentType.RadioGroup)return data.value??undefined;
    return undefined;
  }
  async prepare(privateReply=false) {
    if(this.slash)this.privateDelivery=this.privateDelivery||privateReply;
    if(this.slash&&!this.slash.deferred&&!this.slash.replied)await this.slash.deferReply({flags:this.privateDelivery?MessageFlags.Ephemeral:undefined});
    else if(this.modal) {
      this.privateDelivery=this.privateDelivery||privateReply;
      if(!this.modal.deferred&&!this.modal.replied)await this.modal.deferReply({flags:this.privateDelivery?MessageFlags.Ephemeral:undefined});
    }
    else if(!this.slash&&!this.privateDelivery&&this.channel&&'sendTyping' in this.channel)await this.channel.sendTyping();
  }
  async send(payload: MessageCreateOptions): Promise<Message> {
    if(this.slash) {
      if(this.slash.deferred||this.slash.replied)return this.slash.editReply({...payload,flags:MessageFlags.IsComponentsV2} as Parameters<ChatInputCommandInteraction['editReply']>[0]);
      await this.slash.reply({...payload,flags:MessageFlags.IsComponentsV2|(this.privateDelivery?MessageFlags.Ephemeral:0)} as Parameters<ChatInputCommandInteraction['reply']>[0]);return this.slash.fetchReply();
    }
    if(this.modal) {
      if(this.modal.deferred||this.modal.replied)return this.modal.editReply({...payload,flags:MessageFlags.IsComponentsV2});
      await this.modal.reply({...payload,flags:MessageFlags.IsComponentsV2|(this.privateDelivery?MessageFlags.Ephemeral:0)});return this.modal.fetchReply();
    }
    if(this.response)return this.response.edit({...payload,attachments:[]} as Parameters<Message['edit']>[0]);
    this.response=this.privateDelivery?await this.user.send(payload):await (this.source as Message).reply(payload);return this.response;
  }
  async error(message:string) { return this.send(card('操作を確認してください',redact(message).replace(/。(?!\n|$)/g,'。\n'),'warning')); }
  async fail(payload:MessageCreateOptions,privateReply=false) {
    if(privateReply&&!isPublicChannel(this.channelId)) {
      const previous=this.privateDelivery?undefined:this.response;this.makePrivate();
      if(previous)await previous.edit(card('処理エラー','**処理を完了できませんでした。**\n詳細は本人向けの通知、または管理者のログを確認してください。','danger')).catch(()=>{});
    }
    return this.send(payload);
  }
}
export {positiveAmount} from '../data/money.js';