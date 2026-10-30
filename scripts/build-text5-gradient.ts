import {mkdir,readFile,writeFile} from 'node:fs/promises';
import sharp from 'sharp';

const directory='assets/text5',reference='1374099343468003501';
await mkdir(`${directory}/references`,{recursive:true});
const source=`${directory}/references/${reference}.png`;
let image:Buffer;
try {image=await readFile(source);}
catch(error) {
  if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
  const response=await fetch(`https://cdn.discordapp.com/emojis/${reference}.png?size=128&quality=lossless`);
  if(!response.ok)throw new Error(`参照絵文字の取得に失敗しました（HTTP ${response.status}）。`);
  image=Buffer.from(await response.arrayBuffer());await writeFile(source,image);
}
const {data,info}=await sharp(image).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const sampleRight=43;
const rows:(number[]|undefined)[]=[];
for(let y=0;y<info.height;y++) {
  const samples:number[][]=[],fallback:number[][]=[];
  for(let x=1;x<sampleRight-1;x++) {
    const color=[...data.subarray((y*info.width+x)*4,(y*info.width+x)*4+3)];
    if(data[(y*info.width+x)*4+3]===255)fallback.push(color);
    let opaque=true;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)
      if(y+dy<0||y+dy>=info.height||data[((y+dy)*info.width+x+dx)*4+3]!==255)opaque=false;
    if(opaque)samples.push(color);
  }
  const selected=samples.length?samples:fallback;
  rows.push(selected.length?[0,1,2].map(c=>selected.map(sample=>sample[c]!).sort((a,b)=>a-b)[Math.floor(selected.length/2)]!):undefined);
}
if(!rows.some(Boolean))throw new Error('参照絵文字から色を抽出できませんでした。');
for(let y=0;y<rows.length;y++)if(!rows[y]) {
  let before=y-1,after=y+1;
  while(before>=0&&!rows[before])before--;
  while(after<rows.length&&!rows[after])after++;
  if(before<0)rows[y]=rows[after]!.slice();
  else if(after>=rows.length)rows[y]=rows[before]!.slice();
  else rows[y]=[0,1,2].map(c=>Math.round(rows[before]![c]!+(rows[after]![c]!-rows[before]![c]!)*(y-before)/(after-before)));
}
const bands=[
  {start:0,end:3,row:3},
  {start:21,end:43,row:21},
  {start:55,end:55,row:55},
  {start:78,end:78,row:78},
  {start:101,end:101,row:101},
  {start:119,end:127,row:119},
].map(band=>({...band,color:rows[band.row]!.map(c=>c.toString(16).padStart(2,'0')).join('')}));
const stops=[{y:0,color:bands[0]!.color}];
for(let i=0;i<bands.length-1;i++) {
  const current=bands[i]!,next=bands[i+1]!,inset=(next.start-current.end)*.2;
  stops.push({y:current.end+inset,color:current.color},{y:next.start-inset,color:next.color});
}
stops.push({y:info.height-1,color:bands.at(-1)!.color});
const colors=stops.map(stop=>{
  return `    <stop offset="${(stop.y/(info.height-1)*100).toFixed(4)}%" stop-color="#${stop.color}"/>`;
}).join('\n');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="2000" viewBox="0 0 1 1">
  <defs><linearGradient id="rainbow" x1="0" y1="0" x2="0" y2="1" gradientUnits="userSpaceOnUse" color-interpolation="sRGB">
${colors}
  </linearGradient></defs>
  <path fill="url(#rainbow)" d="M0 0h1v1H0z"/>
</svg>
`;
await writeFile(`${directory}/gradient.svg`,svg);
console.log(`text5のSVGを保存しました（色の基準点: ${stops.length}）。`);
