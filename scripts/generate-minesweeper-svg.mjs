import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fitIcon} from './lib/fit-svg-icon.mjs';
const root='assets/emojis/svg/games/minesweeper';await mkdir(root,{recursive:true});
const blue='#3b88c3',red='#dd2e44',white='#ffffff',ink='#263238';
const grass=['#aad751','#7fb344'],earth=['#e4c79e','#a47b55'];
const numberColors=[blue,'#388e3c',red,'#7e57c2','#b55d14','#00838f',ink,'#aa3377'];
const numbers=await Promise.all(Array.from({length:8},async(_,i)=>{
 const original=await readFile(`assets/emojis/svg/characters/numbers/b_${i+1}.svg`,'utf8');
 const paths=original.match(/<path\b[^>]*\/>/g)?.slice(1).join('');if(!paths)throw new Error('Missing Twemoji digit');
 const colored=paths.replace(/#fff(?:fff)?/ig,numberColors[i]);
 return `<g transform="translate(64 64) scale(4.35) translate(-18 -18)" stroke="${white}" stroke-width="2.8" stroke-linejoin="round" paint-order="stroke fill">${colored}</g>`;
}));
const icon=async(name,color)=>fitIcon(await readFile(`${root}/icons/${name}.svg`,'utf8'),color,name==='cursor-fill'?108:92,name==='cursor-fill'?undefined:{outline:color===white?ink:white,width:12});
const flag=await icon('flag-fill',red),bomb=await icon('bomb-fill',ink),hit=await icon('bomb-fill',white),wrong=await icon('x-bold',red),cursor=await icon('cursor-fill',white);
let total=0;
for(let dark=0;dark<2;dark++){
 const tiles=[['ms_c',grass[dark],''],['ms_o',earth[dark],''],...numbers.map((figure,i)=>[`ms_${i+1}`,earth[dark],figure]),
  ['ms_f',grass[dark],flag],['ms_b',earth[dark],bomb],['ms_x',dark?'#c9263c':red,hit],['ms_w',earth[dark],wrong],
  ...(dark?[]:[['ms_a',blue,cursor]]),
 ];
 for(const [base,bg,figure]of tiles){
  const name=base+(dark?'_d':'');
  await writeFile(`${root}/${name}.svg`,`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><path fill="${bg}" d="M3 3H125V125H3Z"/>${figure}</svg>\n`);total++;
 }
}
console.log(`${total}種類のマインスイーパーSVGを更新しました。`);
