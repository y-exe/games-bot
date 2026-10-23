import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {boardMarkerEntries} from '../src/ui/board-markers.js';
for(const entry of boardMarkerEntries){
 let source:string;
 if(entry.name==='board_spacer')source='<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"></svg>\n';
 else {
  const label=entry.name.slice(2),file=/^\d$/.test(label)?`numbers/b_${label}.svg`:`letters/b_${label}.svg`;
  source=(await readFile(`assets/emojis/svg/characters/${file}`,'utf8')).replace(/#3b88c3/ig,entry.name.startsWith('g_')?'#77b256':'#dd2e44');
 }
 if(!/<svg[\s>]/.test(source)||/<image[\s>]|data:image|<script[\s>]/i.test(source))throw new Error(`Invalid SVG: ${entry.name}`);
 const svgPath=`assets/emojis/svg/characters/${entry.file}.svg`,pngPath=`assets/emojis/png/characters/${entry.file}.png`;
 await mkdir(dirname(svgPath),{recursive:true});await writeFile(svgPath,source);
 const image=await sharp(Buffer.from(source),{density:768}).resize(128,128).png().toBuffer();
 await mkdir(dirname(pngPath),{recursive:true});await writeFile(pngPath,image);
}
console.log(`盤面共通の文字・透明絵文字 ${boardMarkerEntries.length}種類を生成しました。`);
