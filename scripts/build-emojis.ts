import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';

const root='assets/emojis';
const entries=[...JSON.parse(await readFile('assets/emoji-manifest.json','utf8')),...JSON.parse(await readFile('assets/badge-manifest.json','utf8'))] as {name:string;sourceFile?:string;outputFile?:string}[];
for(const {name,sourceFile,outputFile} of entries) {
  const source=await readFile(join(root,sourceFile??`svg/${name}.svg`));
  if(!sourceFile?.endsWith('.png')&&(!/<svg[\s>]/.test(source.toString())||/<image[\s>]|data:image|<script[\s>]/i.test(source.toString())))throw new Error(`${name}: 純粋なSVG素材を用意してください。`);
  const png=await sharp(source,{density:768}).resize(128,128,{fit:'contain',background:'#00000000'}).png().toBuffer();
  if(png.length>256*1024)throw new Error(`${name}: Discordの256KiB制限を超えています。`);
  const output=join(root,outputFile??`${name}.png`);await mkdir(dirname(output),{recursive:true});await writeFile(output,png);
}
console.log(`${entries.length}種類のSVG・公式PNG素材から128px PNGを生成しました。`);
