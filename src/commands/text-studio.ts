import {randomUUID} from 'node:crypto';
import {ActionRowBuilder,AttachmentBuilder,ButtonStyle,MessageFlags,ModalBuilder,TextInputBuilder,TextInputStyle,type ButtonInteraction,type ModalSubmitInteraction,type StringSelectMenuInteraction} from 'discord.js';
import {Context} from './context.js';
import {TextTemplates,templateId} from '../data/text-templates.js';
import {initialTextStyle,presetTextStyle,validateTextStyle,hexColor,numberIn,toCustomTextStyle,type TextLayer} from '../data/text-style.js';
import {isTextFont} from '../data/text-fonts.js';
import {encodeTextStyle,decodeTextStyle,isTextStyleCode} from '../data/text-style-code.js';
import type {TextStyle} from '../data/text-style.js';
import {noMentions} from '../ui/mentions.js';
import {textResultPayload} from '../ui/text-result.js';
import {MediaWorker} from '../services/media.js';
import {textStudioCard,textLibraryCard,type TextDraft} from '../ui/text-studio.js';
import {card,button,row} from '../ui/cards.js';
import {trackInteractionButtons} from '../ui/button-expiry.js';
import {buttonLifetimeMs} from './policy.js';
import {UserError} from '../errors.js';

type StudioInteraction=ButtonInteraction|StringSelectMenuInteraction|ModalSubmitInteraction;
type FormField=[id:string,label:string,value:string,max?:number,paragraph?:boolean];
function form(key:string,action:string,title:string,fields:FormField[]) {
  const modal=new ModalBuilder().setCustomId(`txt:${key}:${action}`).setTitle(title);
  for(const [id,label,value,max=100,paragraph=false]of fields)modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(paragraph?TextInputStyle.Paragraph:TextInputStyle.Short).setValue(value).setMaxLength(max).setRequired(!['background'].includes(id))));
  return modal;
}
const pct=(n:number)=>String(Math.round(n*100));
export class TextStudio {
  private drafts=new Map<string,TextDraft>();
  constructor(private templates:TextTemplates,private worker:MediaWorker){}
  private create(owner:string,channelId:string,text:string,screen:TextDraft['screen'],keep?:string) {
    for(const [key,d]of this.drafts)if(d.expires<=Date.now()||d.owner===owner&&key!==keep)this.drafts.delete(key);
    if(this.drafts.size>=100)throw new UserError('文字画像の編集が混み合っています。少し待ってから開き直してください。');
    if(text.length>200)throw new UserError('文字は200文字以内にしてください。');
    const key=randomUUID(),draft:TextDraft={owner,channelId,expires:Date.now()+buttonLifetimeMs,text:text||'サンプル',style:initialTextStyle(),screen,square:true,selected:0,page:0,busy:false};
    this.drafts.set(key,draft);return {key,draft};
  }
  async open(ctx:Context,custom=false) {
    const input=(ctx.slash?.options.getString('text')??ctx.args.join(' ')).trim(),id=input.match(/^(?:add\s+)?([\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12})$/i)?.[1];
    const fromCode=custom&&isTextStyleCode(input);
    const {key,draft}=this.create(ctx.user.id,ctx.channelId,id||fromCode?'':input,custom?'editor':'hub');
    if(custom&&(id||fromCode)){const saved=await this.importStyle(ctx.user.id,id??input);draft.style=saved.style;draft.templateId=saved.id;draft.templateName=saved.name;}
    if(custom&&!ctx.slash&&!ctx.modal&&!ctx.componentSource)return ctx.send(card('カスタムテキスト','下のボタンから、**本人だけに見える編集画面**を開けます。','info',[row(button(`txt:${key}:open`,'編集画面を開く',ButtonStyle.Primary))]));
    if(draft.screen==='editor')await this.render(draft);
    return ctx.send({...textStudioCard(key,draft),...(draft.preview?{files:[new AttachmentBuilder(draft.preview,{name:'text-preview.png'})]}:{})});
  }
  private async openPrivate(i:StudioInteraction,parentKey:string,parent:TextDraft,action:string) {
    await i.deferReply({flags:MessageFlags.Ephemeral});
    const {key,draft}=this.create(parent.owner,parent.channelId,parent.text,'editor',parentKey);
    Object.assign(draft,{style:structuredClone(parent.style),preset:parent.preset,square:parent.square,templateId:parent.templateId,templateName:parent.templateName});
    if(/^text[1-5]$/.test(action)){draft.preset=action;draft.style=presetTextStyle(action);draft.templateId=undefined;draft.templateName=undefined;}
    else if(action==='custom'){draft.preset=undefined;draft.style=toCustomTextStyle(draft.style);}
    else if(action==='library')draft.screen='library';
    else if(action==='setimport'&&i.isModalSubmit()) {
      const saved=await this.importStyle(draft.owner,i.fields.getTextInputValue('id').trim());
      draft.style=saved.style;draft.templateId=saved.id;draft.templateName=saved.name;draft.preset=undefined;
    }
    await this.display(i,key,draft,true);
  }
  private importStyle(user:string,value:string) {
    return isTextStyleCode(value)?this.templates.save(user,'追加したデザイン',decodeTextStyle(value)):this.templates.import(user,value);
  }
  private async sendCode(i:StudioInteraction,style:TextStyle,shared?:{id:string;name:string}) {
    const code=encodeTextStyle(style),inline=code.length<=2200;
    const body=`${shared?`**${shared.name.replace(/[*_~`<>]/g,'')}**\n`:''}${inline?`\`\`\`text\n${code}\n\`\`\``:'設定が多いため、コードを下のテキストファイルに入れています。'}\n\`textc コード\` または「共有コードから追加」で復元できます。\n-# コードに含まれるのはデザインだけです。入力した文字や名前は含みません。`;
    await i.followUp({...card(shared?'文字テンプレートを共有':'スタイルコード',body,'success',shared?[row(button(`txt:import:${shared.id}`,'自分の一覧に追加',ButtonStyle.Success))]:[]),flags:MessageFlags.IsComponentsV2|(shared?0:MessageFlags.Ephemeral)});
    if(!inline)await i.followUp({files:[new AttachmentBuilder(Buffer.from(code,'utf8'),{name:'text-style.txt'})],allowedMentions:noMentions,flags:shared?undefined:MessageFlags.Ephemeral});
  }
  private check(key:string|undefined,i:StudioInteraction) {
    const d=this.drafts.get(key??'');
    if(!d||d.expires<=Date.now())throw new UserError('編集画面の期限が切れました。`text` または `textc` で開き直してください。');
    if(d.owner!==i.user.id||d.channelId!==i.channelId)throw new UserError('この編集画面は開いた本人だけが操作できます。自分で `textc` を実行してください。');
    if(d.busy)throw new UserError('画像を処理しています。完了してから操作してください。');
    return d;
  }
  private async render(d:TextDraft) {
    d.preview=undefined;
    d.preview=await this.worker.run(d.preset?{kind:d.preset,text:d.text,square:d.square}:{kind:'textc',text:d.text,style:d.style});
  }
  private async display(i:StudioInteraction,key:string,d:TextDraft,redraw=false) {
    if(d.screen==='library') {
      const entries=await this.templates.list(d.owner,d.page);
      const message=await i.editReply({...textLibraryCard(key,d,entries),attachments:[]});trackInteractionButtons(i,message);return;
    }
    if(redraw||d.screen==='editor'&&!d.preview)await this.render(d);
    const payload=textStudioCard(key,d);
    const message=await i.editReply({...payload,attachments:[],...(d.screen==='editor'&&d.preview?{files:[new AttachmentBuilder(d.preview,{name:'text-preview.png'})]}:{})});
    trackInteractionButtons(i,message);
  }
  private modal(i:ButtonInteraction,key:string,action:string,d:TextDraft) {
    const s=toCustomTextStyle(d.style),l=s.layers[d.selected];
    if(action==='edittext')return i.showModal(form(key,'settext','画像にする文字',[['text','文字（コンマ・改行で複数行）',d.text,200,true]]));
    if(action==='paint')return i.showModal(form(key,'setpaint','塗り・背景',[
      ['kind','塗り（単色 / グラデーション / 虹色）',{solid:'単色',gradient:'グラデーション',rainbow:'虹色'}[s.fill.kind]],
      ['colors','カラーコード（グラデーションはコンマ区切り）',s.fill.colors.join(','),100],['angle','グラデーションの角度（90で縦方向）',String(s.fill.angle)],['background','背景色（空欄で透過）',s.background??''],['opacity','全体の不透明度（0〜100%）',pct(s.opacity)],
    ]));
    if(action==='format')return i.showModal(form(key,'setformat','書式・文字間隔・行間隔',[
      ['italic','斜体（1=有効 / 0=無効）',s.italic?'1':'0'],['rotation','回転（-45〜45度）',String(s.rotation)],['skew','横方向の傾き（-0.6〜0.6）',String(s.skew)],['spacing','字間（マイナス値・小数も指定可）',String(s.spacing)],['lineheight','行間（0.6〜2.5）',String(s.lineHeight)],
    ]));
    if(action==='layout')return i.showModal(form(key,'setlayout','画像サイズ・配置',[
      ['width','画像の幅（256〜1000px）',String(s.width)],['height','画像の高さ（256〜1000px）',String(s.height)],['padding','余白（0〜100px）',String(s.padding)],['fit','文字の比率（維持 / 引伸）',s.fit==='contain'?'維持':'引伸'],['align','複数行の位置（左 / 中央 / 右）',{left:'左',center:'中央',right:'右'}[s.align]],
    ]));
    if(['addoutline','addshadow','editlayer'].includes(action)) {
      if(action==='editlayer'&&!l)throw new UserError('編集するレイヤーを選んでください。');
      if(action!=='editlayer'&&s.layers.length>=24)throw new UserError('レイヤーは合計24層までです。不要な層を削除してください。');
      const layer:TextLayer=action==='editlayer'?l!:action==='addoutline'?{kind:'outline',color:'#ffffff',width:6,opacity:1}:{kind:'shadow',color:'#000000',x:8,y:8,blur:0,spread:0,opacity:1};
      const apply=action==='editlayer'?`setlayer-${d.selected}`:layer.kind==='outline'?'newoutline':'newshadow';
      if(layer.kind==='outline')return i.showModal(form(key,apply,'縁取りを設定',[
        ['color','色（#ffffff）',layer.color],['width','この層の太さ（0.5〜60px）',String(layer.width)],['opacity','不透明度（0〜100%）',pct(layer.opacity)],
      ]));
      return i.showModal(form(key,apply,'影を設定',[
        ['color','色（#000000）',layer.color],['x','横位置（-100〜100px）',String(layer.x)],['y','縦位置（-100〜100px）',String(layer.y)],['effects','ぼかし,広がり（0〜20,0〜40px）',`${layer.blur},${layer.spread}`],['opacity','不透明度（0〜100%）',pct(layer.opacity)],
      ]));
    }
    if(action==='save'||action==='share')return i.showModal(form(key,action==='save'?'setsave':'setshare',action==='save'?'テンプレートを保存':'共有するテンプレートを保存',[
      ['name','テンプレート名（文字そのものは保存しません）',d.templateName??'マイテキスト',60],
    ]));
    if(action==='import')return i.showModal(form(key,'setimport','共有テンプレートを追加',[['id','スタイルコード（旧IDも利用可）','',4000,true]]));
    throw new UserError('操作が見つかりません。');
  }
  private settings(i:ModalSubmitInteraction,action:string,d:TextDraft) {
    const value=(id:string)=>i.fields.getTextInputValue(id).trim();
    const num=(id:string)=>{const input=value(id);if(!input)throw new UserError('数値を入力してください。');const result=Number(input);if(!Number.isFinite(result))throw new UserError('数値の形式を確認してください。');return result;};
    let text=d.text;
    if(action==='settext') {text=value('text');if(!text||text.length>200)throw new UserError('文字は1〜200文字で入力してください。');return {style:structuredClone(d.style),text,keepPreset:true};}
    const style=toCustomTextStyle(d.style);
    if(action==='setpaint') {
      const kinds:Record<string,'solid'|'gradient'|'rainbow'>={単色:'solid',solid:'solid',グラデーション:'gradient',gradient:'gradient',虹色:'rainbow',rainbow:'rainbow'};
      const kind=kinds[value('kind')];if(!kind)throw new UserError('塗りは「単色」「グラデーション」「虹色」から選んでください。');
      style.fill={kind,colors:value('colors').split(/[,、\s]+/).filter(Boolean).map(hexColor),angle:num('angle')};style.background=value('background')?hexColor(value('background')):null;style.opacity=num('opacity')/100;
    } else if(action==='setformat') {
      if(!['0','1'].includes(value('italic')))throw new UserError('斜体は1か0で指定してください。');
      style.italic=value('italic')==='1';style.rotation=num('rotation');style.skew=num('skew');style.spacing=num('spacing');style.lineHeight=num('lineheight');
    } else if(action==='setlayout') {
      const fit:Record<string,'contain'|'stretch'>={維持:'contain',contain:'contain',引伸:'stretch',stretch:'stretch'},align:Record<string,'left'|'center'|'right'>={左:'left',left:'left',中央:'center',center:'center',右:'right',right:'right'};
      if(!fit[value('fit')]||!align[value('align')])throw new UserError('比率と配置の入力を確認してください。');
      style.width=num('width');style.height=num('height');style.padding=num('padding');style.fit=fit[value('fit')]!;style.align=align[value('align')]!;
    } else if(action==='newoutline'||action==='newshadow'||action.startsWith('setlayer-')) {
      const index=action.startsWith('setlayer-')?Number(action.slice(9)):-1;
      const original=index>=0?style.layers[index]:undefined;
      if(index>=0&&!original)throw new UserError('対象のレイヤーは削除されています。');
      const color=hexColor(value('color')),opacity=num('opacity')/100;
      let layer:TextLayer;
      if(action==='newoutline'||original?.kind==='outline')layer={kind:'outline',color,opacity,width:num('width')};
      else {
        const effects=value('effects').split(',').map(v=>Number(v.trim()));
        if(effects.length!==2||effects.some(v=>!Number.isFinite(v)))throw new UserError('ぼかし,広がり を「0,0」の形式で指定してください。');
        layer={kind:'shadow',color,opacity,x:num('x'),y:num('y'),blur:effects[0]!,spread:effects[1]!};
      }
      if(index>=0)style.layers[index]=layer;else style.layers.push(layer);
    } else throw new UserError('設定フォームを開き直してください。');
    return {style:validateTextStyle(style),text,keepPreset:false};
  }
  async handle(i:StudioInteraction) {
    const [,key,action]=i.customId.split(':');
    if(key==='import'&&i.isButton()) {
      await i.deferReply({flags:MessageFlags.Ephemeral});
      const saved=await this.templates.import(i.user.id,templateId(action??''));
      const {key:newKey,draft}=this.create(i.user.id,i.channelId!,'','editor');draft.style=saved.style;draft.templateId=saved.id;draft.templateName=saved.name;await this.display(i,newKey,draft,true);return;
    }
    const d=this.check(key,i);
    const privateMessage=i.isModalSubmit()?i.message?.flags.has(MessageFlags.Ephemeral):i.message.flags.has(MessageFlags.Ephemeral);
    if(!privateMessage&&((i.isButton()&&['open','custom','library','text1','text2','text3','text4','text5'].includes(action??''))||(i.isModalSubmit()&&action==='setimport'))) {
      d.busy=true;try{return await this.openPrivate(i,key!,d,action!);}finally{d.busy=false;}
    }
    if(i.isButton()&&['edittext','paint','format','layout','addoutline','addshadow','editlayer','save','share','import'].includes(action??''))return this.modal(i,key!,action!,d);
    d.busy=true;
    try {
      await i.deferUpdate();d.notice=undefined;
      if(i.isModalSubmit()) {
        if(action==='setsave'||action==='setshare') {
          const saved=await this.templates.save(d.owner,i.fields.getTextInputValue('name'),d.style);
          d.templateId=saved.id;d.templateName=saved.name;
          d.notice='**テンプレートを保存しました。**';
          if(action==='setshare') {
            await this.templates.share(d.owner,saved.id);
            await this.sendCode(i,d.style,{id:saved.id,name:saved.name});
            d.notice='**共有カードを投稿しました。**';
          }
          await this.display(i,key!,d);return;
        }
        if(action==='setimport') {
          const saved=await this.importStyle(d.owner,i.fields.getTextInputValue('id').trim());
          d.style=saved.style;d.templateId=saved.id;d.templateName=saved.name;d.preset=undefined;d.screen='editor';d.selected=0;
        } else {
          const next=this.settings(i,action??'',d);d.style=next.style;d.text=next.text;if(!next.keepPreset)d.preset=undefined;
          if(action==='newoutline'||action==='newshadow')d.selected=d.style.layers.length-1;
        }
        await this.display(i,key!,d,true);return;
      }
      if(i.isStringSelectMenu()) {
        const value=i.values[0]!;
        if(action==='load'){const saved=await this.templates.get(d.owner,value);d.style=saved.style;d.templateId=saved.id;d.templateName=saved.name;d.preset=undefined;d.screen='editor';d.selected=0;}
        else if(action==='font') {if(!isTextFont(value))throw new UserError('フォントを選び直してください。');d.style=toCustomTextStyle(d.style);d.style.font=value;d.preset=undefined;}
        else if(action==='layer') {d.selected=numberIn(Number(value),0,d.style.layers.length-1,'レイヤー');await this.display(i,key!,d);return;}
        else throw new UserError('操作が見つかりません。');
        await this.display(i,key!,d,true);return;
      }
      if(/^text[1-5]$/.test(action??'')) {d.preset=action;d.style=presetTextStyle(action!);d.square=true;d.screen='editor';d.selected=0;d.templateId=undefined;d.templateName=undefined;}
      else if(action==='custom') {d.screen='editor';d.preset=undefined;d.style=toCustomTextStyle(d.style);}
      else if(action==='hub') {d.screen='hub';await this.display(i,key!,d);return;}
      else if(action==='library'||action==='prev'||action==='next') {d.screen='library';d.page=action==='prev'?Math.max(0,d.page-1):action==='next'?d.page+1:0;await this.display(i,key!,d);return;}
      else if(action==='back')d.screen='editor';
      else if(action==='square') {
        if(d.preset) {d.square=!d.square;if(d.style.builtin)d.style.builtin.square=d.square;}
        else {
          d.style=toCustomTextStyle(d.style);
          if(d.style.fit==='stretch'&&d.style.width===d.style.height)d.style.fit='contain';
          else {const side=Math.max(d.style.width,d.style.height);d.style.width=d.style.height=side;d.style.fit='stretch';}
        }
      }
      else if(['up','down','duplicate','delete'].includes(action??'')) {
        const layers=d.style.layers,index=d.selected;if(!layers[index])throw new UserError('レイヤーを選んでください。');
        const next=toCustomTextStyle(d.style);
        if(action==='delete'){next.layers.splice(index,1);d.selected=Math.max(0,index-1);}
        else if(action==='duplicate')next.layers.splice(index,0,structuredClone(layers[index]!));
        else {const other=index+(action==='up'?-1:1);if(other<0||other>=layers.length)throw new UserError('これ以上移動できません。');[next.layers[index],next.layers[other]]=[next.layers[other]!,next.layers[index]!];d.selected=other;}
        d.style=validateTextStyle(next);d.preset=undefined;
      } else if(action==='remove') {if(d.templateId)await this.templates.remove(d.owner,d.templateId);d.templateId=undefined;d.templateName=undefined;d.notice='**自分の保存一覧から外しました。**';}
      else if(action==='code') {await this.sendCode(i,d.style);return;}
      else if(action==='generate') {
        if(!d.preview)await this.render(d);
        const kind=d.preset??d.style.builtin?.kind??'textc';
        await i.followUp({...textResultPayload(kind,d.text,d.preview!,d.style),flags:MessageFlags.IsComponentsV2});return;
      } else throw new UserError('操作が見つかりません。');
      await this.display(i,key!,d,true);
    } catch(error) {
      if(error instanceof UserError&&(i.deferred||i.replied)) {
        await i.followUp({...card('設定を確認してください',error.message,'warning'),flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});return;
      }
      throw error;
    } finally {d.busy=false;}
  }
}
