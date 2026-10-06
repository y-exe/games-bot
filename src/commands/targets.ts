import {UserError} from '../errors.js';
import type {Guild,GuildMember,User} from 'discord.js';

function matching(members:Iterable<GuildMember>,input:string) {
  const tag=input.match(/^(.*)#(0|\d{4})$/u);
  return [...members].filter(member=>tag?member.user.username===tag[1]&&member.user.discriminator===tag[2]:[member.user.username,member.user.globalName,member.nickname].includes(input));
}
function unique(members:GuildMember[]):User|undefined {
  if(members.length>1)throw new UserError('同じ名前のメンバーが複数います。メンションまたはユーザーIDで指定してください。');
  return members[0]?.user;
}
async function verified(guild:Guild,user:User,input:string) {
  let member:GuildMember;
  try{member=await guild.members.fetch({user:user.id,force:true});}
  catch{throw new UserError('指定した相手の在籍を確認できませんでした。メンションまたはユーザーIDで指定してください。');}
  if(!matching([member],input).length)throw new UserError('相手の名前が変わっています。メンションまたはユーザーIDで指定してください。');
  return member.user;
}
export async function resolveGuildTarget(guild:Guild,input:string):Promise<User> {
  const id=input.match(/^(?:\d{15,20}|<@!?\d{15,20}>)$/u);
  if(id) {
    const userId=input.replace(/[<@!>]/g,'');
    try{return (await guild.members.fetch({user:userId,force:true})).user;}
    catch(e){if((e as {code?:number}).code===10007)throw new UserError('指定した相手はこのサーバーにいません。');throw new UserError('メンバー情報を取得できませんでした。時間をおいて再試行してください。');}
  }
  const tag=input.match(/^(.*)#(?:0|\d{4})$/u);
  let searched;
  try{searched=await guild.members.search({query:tag?.[1]??input,limit:100});}
  catch{throw new UserError('メンバーを検索できませんでした。メンションまたはユーザーIDで指定してください。');}
  const candidates=new Map(guild.members.cache);for(const [key,member]of searched)candidates.set(key,member);
  let user:User|undefined;
  if(guild.members.cache.size<guild.memberCount) {
    try{await guild.members.fetch({time:30_000});}catch{throw new UserError('メンバー一覧を確認できませんでした。メンションまたはユーザーIDで指定してください。');}
    user=unique(matching(guild.members.cache.values(),input));if(user)return verified(guild,user,input);
    throw new UserError('指定したメンバーが見つかりません。メンションまたはユーザーIDで指定してください。');
  }
  user=unique(matching(candidates.values(),input));if(user)return verified(guild,user,input);
  throw new UserError('指定したメンバーが見つかりません。メンションまたはユーザーIDで指定してください。');
}
