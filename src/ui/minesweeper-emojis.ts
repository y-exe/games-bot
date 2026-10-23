import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {EmojiAsset} from './emoji-sync.js';

export const mineEmojiBaseNames=['ms_c','ms_o',...Array.from({length:8},(_,i)=>`ms_${i+1}`),'ms_f','ms_b','ms_x','ms_w','ms_a'];
export const mineEmojiNames=mineEmojiBaseNames.flatMap(name=>name==='ms_a'?[name]:[name,`${name}_d`]);
export async function loadMineEmojiAssets(root='assets/emojis/png/games/minesweeper'):Promise<EmojiAsset[]> {
  return Promise.all(mineEmojiNames.map(async name=>({name,image:await readFile(join(root,`${name}.png`))})));
}
