import {mkdir,writeFile,readFile} from 'node:fs/promises';
const root='assets/emojis';
for(let i=0;i<26;i++){
 const letter=String.fromCharCode(65+i),code=(0x1f1e6+i).toString(16);
 const url=`https://raw.githubusercontent.com/twitter/twemoji/v14.0.2/assets/svg/${code}.svg`;
 const response=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error(`${letter}: HTTP ${response.status}`);
 const svg=await response.text();if(!svg.includes('#3B88C3')||!svg.includes('viewBox="0 0 36 36"'))throw new Error(`Unexpected Twemoji: ${letter}`);
 await mkdir(`${root}/svg/characters/letters`,{recursive:true});await writeFile(`${root}/svg/characters/letters/b_${letter}.svg`,svg);
}
const path='assets/emoji-manifest.json';
const entries:{name:string;animated:boolean;sourceFile?:string;outputFile?:string}[]=JSON.parse(await readFile(path,'utf8'));
for(const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')if(!entries.some(e=>e.name===`b_${letter}`))entries.push({name:`b_${letter}`,animated:false,sourceFile:`svg/characters/letters/b_${letter}.svg`,outputFile:`png/characters/letters/b_${letter}.png`});
await writeFile(path,JSON.stringify(entries,null,2)+'\n');
console.log('Twemoji v14.0.2の英字A〜ZのSVG原本を取得しました。');
