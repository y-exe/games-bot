import {ButtonStyle} from 'discord.js';
import {mineLevels,type Minesweeper} from '../games/minesweeper.js';
import {emoji} from './emojis.js';
import {button,row,type CardRow} from './cards.js';
import {boardLabel,boardLabelEmoji} from './board-labels.js';

const numbers=['▫️','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣'];
export function minesCellName(game:Minesweeper,r:number,c:number,finished=false) {
  if(finished&&game.mines[r]![c])return game.flags[r]![c]?'ms_f':game.opened[r]![c]?'ms_x':'ms_b';
  if(game.flags[r]![c])return finished?'ms_w':'ms_f';
  const count=game.opened[r]![c]?game.count(r,c):undefined;
  return count===undefined?'ms_c':count===0?'ms_o':`ms_${count}`;
}
export function minesTileName(game:Minesweeper,r:number,c:number,finished=false) {
  return `${minesCellName(game,r,c,finished)}${(r+c)%2?'_d':''}`;
}
export function minesText(game:Minesweeper,finished=false) {
  const fallback:Record<string,string>={ms_c:'⬜',ms_o:'▫️',ms_f:'🚩',ms_b:'💣',ms_x:'💥',ms_w:'❌'};
  const rows=game.opened.map((rank,r)=>`${emoji(boardLabelEmoji(r+1,!finished&&r===game.selectedRow?'red':'blue'))||boardLabel(r+1)}${rank.map((_,c)=>{
    const name=minesCellName(game,r,c,finished);
    return emoji(minesTileName(game,r,c,finished))||emoji(name)||fallback[name]||numbers[game.count(r,c)]!;
  }).join('')}`);
  return `${emoji('board_spacer')}${Array.from({length:game.size},(_,c)=>emoji(`b_${String.fromCharCode(65+c)}`)).join('')}\n${rows.join('\n')}`;
}
export function minesControls(game:Minesweeper,id:(action:string)=>string) {
  const controls:CardRow[]=[];
  for(let start=0;start<game.size;start+=5)controls.push(row(...Array.from({length:Math.min(5,game.size-start)},(_,i)=>{
    const r=start+i,selected=game.selectedRow===r;
    return button(id(`row${r}`),`${boardLabel(r+1)}行`,selected?ButtonStyle.Danger:ButtonStyle.Secondary,emoji(boardLabelEmoji(r+1,selected?'red':'blue')),selected);
  })));
  if(game.selectedRow!==undefined)for(let start=0;start<game.size;start+=5)controls.push(row(...Array.from({length:Math.min(5,game.size-start)},(_,i)=>{
    const c=start+i,r=game.selectedRow!;
    const opened=game.opened[r]![c],flagged=game.flags[r]![c],count=opened?game.count(r,c):0;
    const neighbors=opened?game.neighbors(r,c):[];
    const chord=opened&&count>0&&neighbors.filter(m=>game.flags[m.row]![m.col]).length===count&&neighbors.some(m=>!game.flags[m.row]![m.col]&&!game.opened[m.row]![m.col]);
    const icon=opened||flagged?emoji(minesCellName(game,r,c)):emoji(`b_${String.fromCharCode(65+c)}`);
    const disabled=game.mode==='flag'?opened:flagged||(opened&&!chord);
    const label=`${String.fromCharCode(65+c)}${boardLabel(r+1)}${game.mode==='open'&&chord?' · 周囲を開く':''}`;
    return button(id(`cell${c}`),label,game.mode==='flag'?ButtonStyle.Danger:ButtonStyle.Primary,icon,disabled);
  })));
  controls.push(row(button(id('mode'),game.mode==='open'?'旗を立てるモードへ':'マスを開くモードへ',game.mode==='open'?ButtonStyle.Danger:ButtonStyle.Primary,game.mode==='open'?emoji('ms_f')||'🚩':emoji('ms_a')||'⛏️'),button(id('leave'),'ゲームを終了',ButtonStyle.Secondary)));
  return controls;
}
export function minesInfo(game:Minesweeper) {
  return `**${mineLevels[game.level].label}** · ${game.size} × ${game.size} · 地雷 **${game.mineCount}個**\n${emoji('ms_f')||'🚩'} **${game.flagCount} / ${game.mineCount}** · 安全なマス **${game.openCount} / ${game.size*game.size-game.mineCount}**`;
}
