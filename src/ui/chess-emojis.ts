import sharp from 'sharp';

const shapes:Record<string,string>={
  p:'M94 64A30 30 0 1 1 34 64A30 30 0 1 1 94 64Z',
  r:'M26 30H44V48H55V30H73V48H84V30H102V98H26Z',
  n:'M28 100C29 83 40 72 54 60L41 67L26 59V47L45 34L52 20L64 32C85 31 99 44 99 63C99 77 90 84 89 100Z',
  b:'M64 22C50 39 34 52 34 71C34 88 46 100 64 100C82 100 94 88 94 71C94 52 78 39 64 22Z',
  q:'M24 40L46 59L64 27L82 59L104 40L94 95H34Z',
  k:'M52 24H76V48H100V72H76V104H52V72H28V48H52Z',
};
const baseNames=Array.from({length:2},(_,dark)=>[
  `c_empty_${dark}`,
  ...['w','b'].flatMap(color=>Object.keys(shapes).map(piece=>`c_${color}${piece}_${dark}`)),
]).flat();
export const chessEmojiNames=[...baseNames,
  ...baseNames.filter(name=>!name.includes('empty')).map(name=>`${name}_s`),
  ...baseNames.map(name=>`${name}_m`),
  ...baseNames.filter(name=>name.includes('empty')).map(name=>`${name}_t`),
  ...baseNames.filter(name=>/_[wb]k_/.test(name)).map(name=>`${name}_c`),
];
export function chessEmojiSvg(name:string) {
  const match=/^c_(empty|[wb][prnbqk])_([01])(?:_([smtc]))?$/.exec(name);
  if(!match)throw new Error('Invalid chess emoji name');
  const [,piece,dark,state]=match;
  const isDark=dark==='1',white=piece!.startsWith('w');
  const fill=white?'#ffffff':'#000000',outline=white?'#000000':'#ffffff',detail=outline;
  const base=isDark?'#a47b55':'#e4c79e';
  const marker=state==='s'?'#3b88c3'
    :state==='c'||state==='t'||state==='m'&&piece!=='empty'?'#dd2e44'
    :state?'#77b256':undefined;
  const background=`<path fill="${marker??base}" d="M3 3h122v122H3z"/>`;
  const details=piece?.[1]==='n'?`<circle cx="61" cy="47" r="4.5" fill="${detail}"/>`
    :piece?.[1]==='b'?`<path d="M61 66L79 44" fill="none" stroke="${detail}" stroke-width="9" stroke-linecap="round"/>`:'';
  const silhouette=piece==='empty'?'':shapes[piece![1]!]!;
  const edge=`stroke="${outline}" stroke-width="${white?5.5:4.5}" stroke-linejoin="round" stroke-linecap="round"`;
  const bounds:Record<string,number[]>={p:[34,34,94,94],r:[26,30,102,98],n:[26,20,99,100],b:[34,22,94,100],q:[24,27,104,95],k:[28,24,100,104]};
  const [x1,y1,x2,y2]=bounds[piece?.[1]??'']??[0,0,0,0];
  const scale=(piece?.[1]==='p'?86:114)/(Math.max(x2!-x1!,y2!-y1!)+(white?5.5:4.5)+5);
  const transform=`translate(64 64) scale(${scale}) translate(${-(x1!+x2!+5)/2} ${-(y1!+y2!+5)/2})`;
  const figure=piece==='empty'?'':`<g transform="${transform}"><path d="${silhouette}" transform="translate(5 5)" fill="${outline}" ${edge}/><path d="${silhouette}" fill="${fill}" ${edge}/>${details}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">${background}${figure}</svg>`;
}
export async function chessEmojiImage(name:string) {
  return sharp(Buffer.from(chessEmojiSvg(name)),{density:384}).resize(128,128).png().toBuffer();
}
