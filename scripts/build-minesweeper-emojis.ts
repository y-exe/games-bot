import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {mineEmojiNames} from '../src/ui/minesweeper-emojis.js';

const source='assets/emojis/svg/games/minesweeper',output='assets/emojis/png/games/minesweeper';
await mkdir(output,{recursive:true});
for(const name of mineEmojiNames){
  const svg=await readFile(`${source}/${name}.svg`);
  if(!/<svg[\s>]/.test(svg.toString())||/<image[\s>]|data:image|<script[\s>]/i.test(svg.toString()))throw new Error(`Invalid SVG: ${name}`);
  const image=await sharp(svg,{density:768}).resize(128,128).png().toBuffer();
  if(image.length>256*1024)throw new Error(`Emoji too large: ${name}`);
  await writeFile(`${output}/${name}.png`,image);
}
console.log(`マインスイーパー ${mineEmojiNames.length}種類のPNGを生成しました。`);
