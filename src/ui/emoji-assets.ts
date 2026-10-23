import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {manifest} from './emojis.js';
import {chessEmojiNames,chessEmojiImage} from './chess-emojis.js';
import {loadMineEmojiAssets} from './minesweeper-emojis.js';
import {loadBoardMarkerAssets} from './board-markers.js';
import type {EmojiAsset} from './emoji-sync.js';

export async function loadEmojiAssets(root='assets/emojis'):Promise<EmojiAsset[]> {
  return Promise.all(manifest.map(async entry=>({name:entry.name,image:await readFile(join(root,entry.outputFile??`${entry.name}.png`))})));
}

export async function loadAllEmojiAssets(root='assets/emojis'):Promise<EmojiAsset[]> {
  const groups=await Promise.all([
    loadEmojiAssets(root),
    Promise.all(chessEmojiNames.map(async name=>({name,image:await chessEmojiImage(name)}))),
    loadMineEmojiAssets(join(root,'png/games/minesweeper')),
    loadBoardMarkerAssets(join(root,'png/characters')),
  ]);
  return groups.flat();
}
