import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {EmojiAsset} from './emoji-sync.js';

export const boardMarkerEntries=[
  ...['green','red'].flatMap(color=>[
    ...Array.from({length:10},(_,n)=>({name:`${color==='green'?'g':'r'}_${n}`,file:`${color}/numbers/${n}`})),
    ...Array.from({length:26},(_,n)=>({name:`${color==='green'?'g':'r'}_${String.fromCharCode(65+n)}`,file:`${color}/letters/${String.fromCharCode(65+n)}`})),
  ]),
  {name:'board_spacer',file:'blank'},
];
export async function loadBoardMarkerAssets(root='assets/emojis/png/characters'):Promise<EmojiAsset[]> {
  return Promise.all(boardMarkerEntries.map(async entry=>({name:entry.name,image:await readFile(join(root,`${entry.file}.png`))})));
}
