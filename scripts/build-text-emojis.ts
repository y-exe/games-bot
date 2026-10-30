import {mkdir,readFile,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {generateTextImage} from '../src/services/text-image.js';

const root='assets/emojis',path='assets/emoji-manifest.json';
await mkdir(`${root}/originals/characters/text`,{recursive:true});await mkdir(`${root}/png/characters/text`,{recursive:true});
const manifest=JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,'')) as {name:string;animated:boolean;sourceFile?:string;outputFile?:string}[];
for(const kind of ['text1','text2','text3','text4','text5']) {
  const sourceFile=`originals/characters/text/${kind}.png`,outputFile=`png/characters/text/${kind}.png`;
  const image=await generateTextImage(kind,'テキスト',true);
  await writeFile(`${root}/${sourceFile}`,image);
  await sharp(image).resize(128,128,{fit:'fill',kernel:'lanczos3'}).png().toFile(`${root}/${outputFile}`);
  const entry={name:kind,animated:false,sourceFile,outputFile},index=manifest.findIndex(item=>item.name===kind);
  if(index<0)manifest.push(entry);else manifest[index]=entry;
}
await writeFile(path,JSON.stringify(manifest,null,2)+'\n');
console.log('text1〜text5のスタンプ絵文字を生成しました。');
