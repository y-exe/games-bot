import {UserError} from '../errors.js';
import {aliases,commandNames} from './definitions.js';

const quotes=new Map(Object.entries({'"':'"','‘':'’','‚':'‛','“':'”','„':'‟','⹂':'⹂','「':'」','『':'』','〝':'〞','﹁':'﹂','﹃':'﹄','＂':'＂','｢':'｣','«':'»','‹':'›','《':'》','〈':'〉'}));
const quoteCharacters=new Set([...quotes.keys(),...quotes.values()]);
const remainderCommands=new Set(['text','text2','text3','text4','text5','voice','tenki','totusi']);
const positionalCount:Record<string,number>={point:0,login:0,gamble:0,leave:0,help:0,setchannel:0,ping:0,imakita:0,rate:2,give:2,othello:1,connectfour:1,highlow:2,janken:1,info:1,time:1,sync:1,bet:1};
export function quotedArguments(input:string,limit=Infinity) {
  const args:string[]=[];let i=0;
  while(i<input.length&&args.length<limit) {
    while(i<input.length&&/\s/u.test(input[i]!))i++;
    if(i===input.length)break;
    const opener=input[i]!,closer=quotes.get(opener);let word='';
    if(closer)i++;
    else word=input[i++]!;
    let closed=!closer;
    while(i<input.length) {
      const char=input[i++]!;
      if(char==='\\'&&i===input.length&&!closer)break;
      if(char==='\\'&&i<input.length) {
        const next=input[i]!;
        if(closer?(next===opener||next===closer):quoteCharacters.has(next)){word+=next;i++;continue;}
        word+=char;continue;
      }
      if(closer&&char===closer){closed=true;if(i<input.length&&!/\s/u.test(input[i]!))throw new UserError('引用符の後には空白を入れてください。');break;}
      if(!closer&&quoteCharacters.has(char))throw new UserError('複数語を指定する場合は引数全体を引用符で囲んでください。');
      if(!closer&&/\s/u.test(char))break;
      word+=char;
    }
    if(!closed)throw new UserError(`閉じる引用符 ${closer} がありません。`);
    args.push(word);
  }
  return args;
}
export function parseLegacy(content:string,acceptName?:(name:string)=>boolean):{name:string;args:string[]}|undefined {
  const match=content.match(/^\s*(\S+)([\s\S]*)$/u);if(!match)return;
  const root=match[1]!.toLowerCase();let name=aliases[root]??root;
  if(!commandNames.has(name)||(acceptName&&!acceptName(name)))return;
  const tail=match[2]!.trim();
  const args=remainderCommands.has(name)?tail?[tail]:[]:quotedArguments(tail,positionalCount[name]??Infinity);
  if(name==='othello'&&['leave','point','points'].includes(args[0]??''))name=args.shift()==='leave'?'leave':'point';
  return {name,args};
}
