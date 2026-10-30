import {mkdir,writeFile} from 'node:fs/promises';
import {basename} from 'node:path';
import {textFontCatalog} from '../src/data/text-fonts.js';

const revision='66e15ff40ae068989dbec49a050ec6e0e55ef8ab';
const upstream=`https://raw.githubusercontent.com/zk-phi/MEGAMOJI/${revision}`;
const root='assets/fonts/megamoji';await mkdir(`${root}/licenses`,{recursive:true});
const files=Object.values(textFontCatalog).filter(font=>font.file.startsWith('megamoji/'));
await Promise.all(files.map(async font=>{
  const response=await fetch(`${upstream}/src/fonts/${basename(font.file)}`);
  if(!response.ok)throw new Error(`${font.label}: HTTP ${response.status}`);
  await writeFile(`assets/fonts/${font.file}`,Buffer.from(await response.arrayBuffer()));
}));
for(const name of ['mplus.txt','ofl1-1-no-rfn.txt','chikarayowaku.txt']) {
  const response=await fetch(`${upstream}/resources/licenses/${name}`);if(!response.ok)throw new Error(`HTTP ${response.status}`);
  await writeFile(`${root}/licenses/${name}`,await response.text());
}
const notice=await fetch(`${upstream}/LICENSE.markdown`);if(!notice.ok)throw new Error(`HTTP ${notice.status}`);
await writeFile(`${root}/LICENSES.md`,await notice.text());
await writeFile(`${root}/SOURCE.md`,`MEGAMOJI: https://github.com/zk-phi/MEGAMOJI/tree/${revision}/src/fonts\n\n玉ねぎ楷書「激」は同梱しません。公式配布のフォントを DATA_DIR/fonts/TamanegiKaishoGeki.ttf に配置してください。\n公式配布: https://booth.pm/ja/items/2929647\n`);
console.log(`MEGAMOJIの${files.length}書体とライセンスを保存しました。`);
