import {renameLegacyChessEmojis} from '../src/ui/emoji-sync.ts';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {Chess} from 'chess.js';
import {ChessClock,chessTimeControls} from '../src/games/chess-clock.ts';
import {isDeadPosition,canPossiblyMate} from '../src/games/chess-material.ts';
import {ChessGame,promotions} from '../src/games/chess.ts';
import {Minesweeper,mineLevels,mineLevel} from '../src/games/minesweeper.ts';
import {Games} from '../src/games/manager.ts';
import {playBotTurn} from '../src/games/bot-turn.ts';
import {chessReward} from '../src/data/rewards.ts';
import {chessEmojiNames,chessEmojiImage,chessEmojiSvg} from '../src/ui/chess-emojis.ts';
import {chessText,chessControls,chessCells} from '../src/ui/chess-board.ts';
import {minesControls,minesText,minesCellName} from '../src/ui/minesweeper-board.ts';
import {help} from '../src/commands/help.ts';
import {boardLabel,boardLabelEmoji} from '../src/ui/board-labels.ts';
import {boardMarkerEntries,loadBoardMarkerAssets} from '../src/ui/board-markers.ts';
import {mineEmojiNames,loadMineEmojiAssets} from '../src/ui/minesweeper-emojis.ts';
import {manifest,setEmojiMappings} from '../src/ui/emojis.ts';
import {parseLegacy} from '../src/commands/legacy.ts';
import {slashCommands} from '../src/commands/definitions.ts';
import {chooseChessMove} from '../src/games/chess-ai.ts';
import {chessBotMove} from '../src/games/chess-bot.ts';

function move(game,from,to,promotion) {game.select(from);return game.play(to,promotion);}
const json=payload=>JSON.parse(JSON.stringify(payload));

test('旧チェス絵文字は画像とIDを保ったままc_へ改名し、再実行しても変更しない',async()=>{
  const entries=chessEmojiNames.map((name,i)=>({id:String(i+1),name:name.replace(/^c_/,'chess4_')}));
  entries.push({id:'other',name:'status_info'});
  const ids=entries.map(e=>e.id);
  const api={list:async()=>entries.map(e=>({...e})),rename:async(entry,name)=>Object.assign(entries.find(e=>e.id===entry.id),{name})};
  assert.equal(await renameLegacyChessEmojis(api),82);
  assert.deepEqual(entries.map(e=>e.id),ids);
  assert.deepEqual(entries.slice(0,82).map(e=>e.name),chessEmojiNames);
  assert.equal(await renameLegacyChessEmojis(api),0);
  assert.equal(entries[82].name,'status_info');
});

test('チェスの番号素材は指定色のSVG・PNGで、位置合わせ用絵文字は完全透過',async()=>{
  const assets=await loadBoardMarkerAssets();assert.equal(assets.length,73);
  assert.deepEqual([1,9,10,11,20,35].map(boardLabel),['1','9','A','B','K','Z']);
  assert.throws(()=>boardLabel(36),RangeError);
  assert.ok(!boardMarkerEntries.some(e=>/^[gr]_\d{2}/.test(e.name)));
  for(const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'){
    assert.ok(manifest.some(e=>e.name===`b_${letter}`));
    assert.ok(assets.some(e=>e.name===`g_${letter}`));
    assert.ok(assets.some(e=>e.name===`r_${letter}`));
  }
  for(const asset of assets){
    const entry=boardMarkerEntries.find(e=>e.name===asset.name);
    const source=await readFile(`assets/emojis/svg/characters/${entry.file}.svg`,'utf8');
    assert.ok(!/<image|data:image|<script/i.test(source));
    const {data,info}=await sharp(asset.image).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    assert.equal(info.width,128);assert.equal(info.height,128);assert.ok(asset.image.length<256*1024);
    if(asset.name==='board_spacer')assert.ok(data.every((v,i)=>i%4!==3||v===0));
    else assert.deepEqual([...data.subarray((64*128+8)*4,(64*128+9)*4)],asset.name.startsWith('g_')?[119,178,86,255]:[221,46,68,255]);
  }
  for(const [suffix,color]of [['_s','#3b88c3'],['_m','#77b256'],['_t','#dd2e44']])assert.ok(chessEmojiSvg(`c_empty_0${suffix}`).includes(color));
});

test('チェスはページごとの番号で移動先を示し、座標に文字の空白を挟まず、全ボタンに駒を表示する',async()=>{
  const names=[...manifest.map(e=>e.name),...chessEmojiNames,...boardMarkerEntries.map(e=>e.name)];
  const mapping=Object.fromEntries(names.map((name,i)=>[name,`<:${name}:${10000000000000000000n+BigInt(i)}>`]));
  setEmojiMappings(mapping);const h=harness();
  try{
    const s=h.session();const initial=json(await h.games.payload(s));validateCard(initial);
    const buttons=initial.components[0].components.filter(c=>c.type===1).flatMap(r=>r.components).filter(b=>b.custom_id.endsWith('piece'+b.label.slice(0,2)));
    assert.equal(buttons.length,10);assert.ok(buttons.every(b=>b.emoji?.id));
    s.chess.select('e2');validateCard(await h.games.payload(s));
    const text=chessText(s.chess),lines=text.split('\n');
    assert.equal(lines.length,9);assert.ok(lines.every(line=>!/[ \u3000]/.test(line)));
    assert.ok(lines[8].startsWith(mapping.board_spacer+mapping.b_A));
    assert.ok(lines[0].startsWith(mapping['b_8']+mapping.c_br_0));
    assert.ok(text.includes(mapping.g_1)&&text.includes(mapping.g_2));
    const wide=new ChessGame('7k/8/8/8/3Q4/8/8/K7 w - - 0 1');wide.select('d4');
    for(const page of [0,1]){
      const destinations=wide.destinations().slice(page*20,(page+1)*20),board=chessText(wide,page);
      const controls=chessControls(wide,page,a=>a).flatMap(r=>r.toJSON().components).filter(b=>b.custom_id.startsWith('to'));
      assert.equal(controls.length,destinations.length);
      destinations.forEach((square,i)=>{if(!wide.engine.get(square))assert.ok(board.includes(mapping[boardLabelEmoji(i+1,'green')]));assert.equal(controls[i].custom_id,`to${square}`);assert.ok(controls[i].label.startsWith(`${boardLabel(i+1)} · `));});
      validateCard(await h.games.payload({...s,chess:wide,page}));
    }
    const capture=new ChessGame('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1');capture.select('d1');
    assert.ok(chessText(capture).includes(mapping.c_bq_0_m));
  }finally{setEmojiMappings({});await h.games.close();}
});
function validateCard(payload) {
  const ids=new Set();let count=0;let textLength=0;
  function visit(c) {
    count++;
    if(c.type===10) {assert.ok(c.content.length<=4000);textLength+=c.content.length;}
    if(c.type===1)assert.ok(c.components.length<=5);
    if(c.custom_id) {assert.ok(c.custom_id.length<=100);assert.ok(!ids.has(c.custom_id));ids.add(c.custom_id);}
    for(const child of c.components??[])visit(child);
  }
  json(payload).components.forEach(visit);
  assert.ok(count<=40,`${count} components`);
  assert.ok(textLength<=4000,`${textLength} text characters`);
}
function harness() {
  const edits=[],notices=[],rewards=[],saved=new Map(),settled=new Set();
  const client={user:{id:'bot'},channels:{fetch:async()=>({isTextBased:()=>true,messages:{fetch:async()=>({edit:async p=>{validateCard(p);edits.push(json(p));}})}})}};
  const store={balance:async()=>1000n,saveSession:async(id,s)=>saved.set(id,json(s)),deleteSession:async id=>saved.delete(id),reward:async(id,delta)=>{
    if(settled.has(id))return false;settled.add(id);rewards.push(delta);return true;
  }};
  const games=new Games(client,store);
  function session(chess=new ChessGame()) {
    const s={id:'test',kind:'chess',host:'white',players:['white','black'],phase:'playing',revision:0,expires:Date.now()+180_000,channelId:'channel',messageId:'message',size:8,page:0,hands:{},currentCard:1,bet:'0',escrow:false,chess};
    s.chessClock=new ChessClock('10+5',chess.turn);s.expires=s.chessClock.deadline();
    games.sessions.set(s.id,s);return s;
  }
  function interaction(s,action,user='white',revision=s.revision) {return {
    customId:`game:${s.id}:${revision}:${action}`,user:{id:user},channelId:'channel',message:{id:'message'},
    isStringSelectMenu:()=>false,deferUpdate:async()=>{},followUp:async p=>{notices.push(json(p));return {id:'confirmation'};},
  };}
  return {games,session,interaction,edits,notices,rewards,saved};
}

test('チェスは合法手だけを受け付け、キャスリング・アンパッサン・4種類の昇格を扱う',()=>{
  const game=new ChessGame();game.select('e2');
  assert.deepEqual(game.destinations(),['e3','e4']);
  const fen=game.engine.fen();assert.throws(()=>game.play('e5'),/移動できません/);assert.equal(game.engine.fen(),fen);
  game.play('e4');assert.equal(game.turn,2);assert.throws(()=>game.select('e4'),/動かせる駒/);
  const castle=new ChessGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  move(castle,'e1','g1');assert.equal(castle.engine.get('f1').type,'r');assert.equal(castle.engine.get('e1'),undefined);
  const ep=new ChessGame();for(const [from,to]of [['e2','e4'],['a7','a6'],['e4','e5'],['d7','d5'],['e5','d6']])move(ep,from,to);
  assert.equal(ep.engine.get('d5'),undefined);assert.equal(ep.engine.get('d6').color,'w');
  for(const piece of promotions) {
    const promotion=new ChessGame('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');promotion.select('a7');
    assert.equal(promotion.play('a8'),false);assert.equal(promotion.turn,1);assert.equal(promotion.promotion,'a8');
    assert.throws(()=>promotion.play('a8','k'),/昇格先/);
    assert.equal(promotion.play('a8',piece),true);assert.equal(promotion.engine.get('a8').type,piece);
  }
  assert.doesNotThrow(()=>JSON.stringify(game));
});

test('チェスはチェックメイト・ステイルメイト・同一局面反復を判定する',()=>{
  const mate=new ChessGame();for(const [from,to]of [['f2','f3'],['e7','e5'],['g2','g4'],['d8','h4']])move(mate,from,to);
  assert.equal(mate.winner,2);assert.equal(mate.ending(),'チェックメイト');assert.throws(()=>mate.select('a2'));
  const stale=new ChessGame('7k/8/5KQ1/8/8/8/8/8 w - - 0 1');move(stale,'g6','f7');
  assert.equal(stale.winner,0);assert.equal(stale.ending(),'ステイルメイト');
  const repeat=new ChessGame();for(let n=0;n<2;n++)for(const [from,to]of [['g1','f3'],['g8','f6'],['f3','g1'],['f6','g8']])move(repeat,from,to);
  assert.equal(repeat.winner,null);assert.equal(repeat.claimReason(),'3回の同一局面反復');repeat.claimDraw();assert.equal(repeat.winner,0);
});

test('チェス時計は総持ち時間を消費し、着手完了時だけ加算して正確な境界で旗落ちする',()=>{
  const c=new ChessClock('10+5',1,1000);
  assert.equal(c.left(1,66000),535000);assert.equal(c.left(2,66000),600000);
  c.move(1,66000);assert.deepEqual(c.remaining,[540000,600000]);assert.equal(c.turn,2);
  c.move(2,71000);assert.deepEqual(c.remaining,[540000,600000]);assert.equal(c.deadline(),611000);
  assert.equal(c.expired(610999),false);assert.equal(c.expired(611000),true);
  const before=JSON.stringify(c);assert.throws(()=>c.move(1,611000));assert.equal(JSON.stringify(c),before);
  const noIncrement=new ChessClock('5+0',1,0);noIncrement.move(1,10000);assert.equal(noIncrement.remaining[0],290000);
  assert.equal(chessTimeControls['15+10'].increment,10);
});

test('3回反復は申告して終了し、申告せず続けた5回反復は自動終了する',()=>{
  const game=new ChessGame(),cycle=[['g1','f3'],['g8','f6'],['f3','g1'],['f6','g8']];
  for(let n=0;n<2;n++)for(const [from,to]of cycle)move(game,from,to);
  assert.equal(game.winner,null);assert.equal(game.claimReason(),'3回の同一局面反復');
  for(let n=0;n<2;n++)for(const [from,to]of cycle)move(game,from,to);
  assert.equal(game.winner,0);assert.equal(game.ending(),'5回の同一局面反復');
  const intended=new ChessGame();for(const [from,to]of [...cycle,...cycle.slice(0,3)])move(intended,from,to);
  const fen=intended.engine.fen(),history=intended.engine.history();
  const candidates=intended.claimMoves();assert.ok(candidates.some(m=>m.from==='f6'&&m.to==='g8'));
  assert.equal(intended.engine.fen(),fen);assert.deepEqual(intended.engine.history(),history);
  intended.claimDraw(candidates.find(m=>m.to==='g8'));assert.equal(intended.winner,0);
  assert.equal(intended.engine.fen(),fen);assert.match(intended.ending(),/予定手 f6 → g8/);
});

test('50手は申告制、75手は自動終了、ポーン・駒取りでリセットしメイトを優先する',()=>{
  const game=new ChessGame('7k/8/8/8/8/8/8/KR6 w - - 99 51');
  assert.ok(game.claimMoves().some(m=>m.to==='b2'));move(game,'b1','b2');
  assert.equal(game.winner,null);assert.equal(game.claimReason(),'50手ルール');game.claimDraw();assert.equal(game.winner,0);
  const automatic=new ChessGame('7k/8/8/8/8/8/8/KR6 w - - 149 75');move(automatic,'b1','b2');
  assert.equal(automatic.winner,0);assert.equal(automatic.ending(),'75手ルール');
  const pawn=new ChessGame('7k/8/8/8/8/8/P7/KR6 w - - 149 75');move(pawn,'a2','a3');
  assert.equal(pawn.winner,null);assert.equal(pawn.claimReason(),'');assert.equal(pawn.engine.fen().split(' ')[4],'0');
  const capture=new ChessGame('7k/8/8/8/8/8/1b6/KR6 w - - 149 75');move(capture,'b1','b2');
  assert.equal(capture.winner,null);assert.equal(capture.engine.fen().split(' ')[4],'0');
  const mate=new ChessGame('7k/8/5KQ1/8/8/8/8/8 w - - 149 75');move(mate,'g6','g7');
  assert.equal(mate.winner,1);assert.equal(mate.ending(),'チェックメイト');
});

test('反復は合法なアンパッサンとキャスリング権を区別し、ピンで不可能なアンパッサンを区別しない',()=>{
  const kingCycle=[['e1','f1'],['a8','b8'],['f1','e1'],['b8','a8']];
  const pinned=new ChessGame('k3r3/8/8/3pP3/8/8/8/4K3 w - d6 0 2');
  const legal=new ChessGame('k7/8/8/3pP3/8/8/8/4K3 w - d6 0 2');
  for(let n=0;n<2;n++)for(const [from,to]of kingCycle){move(pinned,from,to);move(legal,from,to);}
  assert.equal(pinned.claimReason(),'3回の同一局面反復');assert.equal(legal.claimReason(),'');
  for(const [from,to]of kingCycle)move(legal,from,to);assert.equal(legal.claimReason(),'3回の同一局面反復');
  const castling=new ChessGame('4k2r/8/8/8/8/8/8/4K2R w Kk - 0 1');
  for(let n=0;n<2;n++)for(const [from,to]of [['h1','h2'],['h8','h7'],['h2','h1'],['h7','h8']])move(castling,from,to);
  assert.equal(castling.claimReason(),'');
});

test('旗落ち・投了は相手が詰ませられなければ引き分け、強制できなくても詰みが可能なら勝ち',()=>{
  for(const reason of ['時間切れ','投了']){
    const lone=new ChessGame('7k/8/8/8/8/8/8/KR6 w - - 0 1');lone.lose(1,reason);assert.equal(lone.winner,0);
    const rook=new ChessGame('7k/8/8/8/8/8/8/KR6 b - - 0 1');rook.lose(2,reason);assert.equal(rook.winner,1);
    const knight=new ChessGame('7k/8/8/8/8/8/8/KN6 b - - 0 1');knight.lose(2,reason);assert.equal(knight.winner,0);
    const two=new ChessGame('7k/8/8/8/8/8/8/KNN5 b - - 0 1');two.lose(2,reason);assert.equal(two.winner,1);
  }
  assert.equal(canPossiblyMate(new Chess('7k/7p/8/8/8/8/8/KB6 w - - 0 1'),'w'),true);
});

test('双方のキングでも崩せない固定ポーン壁をデッドポジションとし、崩せる壁は終了しない',()=>{
  const fen='7k/8/1p1p1p1p/pPpPpPpP/P1P1P1P1/8/8/K7 w - - 0 1';
  assert.equal(isDeadPosition(new Chess(fen)),true);
  const game=new ChessGame(fen);move(game,'a1','b1');assert.equal(game.winner,0);assert.match(game.ending(),/デッドポジション/);
  assert.equal(isDeadPosition(new Chess('7k/8/1p1p1p1p/1PpPpPpP/P1P1P1P1/8/8/K7 w - - 0 1')),false);
  assert.equal(isDeadPosition(new Chess('8/8/8/k7/P7/8/8/7K w - - 0 1')),false);
  assert.equal(isDeadPosition(new Chess('7k/8/8/p7/P7/8/8/K7 w - - 0 1')),false);
});

test('自分の着手で引き分け提案を維持し、相手の着手または明示的な拒否で取り消す',async()=>{
  const h=harness();try{
    const s=h.session();await h.games.handle(h.interaction(s,'draw'));assert.equal(s.chess.drawOffer,'white');
    await h.games.handle(h.interaction(s,'piecee2'));await h.games.handle(h.interaction(s,'toe4'));assert.equal(s.chess.drawOffer,'white');
    await h.games.handle(h.interaction(s,'piecee7','black'));assert.equal(s.chess.drawOffer,'white');
    await h.games.handle(h.interaction(s,'toe5','black'));assert.equal(s.chess.drawOffer,undefined);
    await h.games.handle(h.interaction(s,'draw'));await h.games.handle(h.interaction(s,'declinedraw','black'));assert.equal(s.chess.drawOffer,undefined);
  }finally{await h.games.close();}
});

test('チェス時計は駒選択・昇格待ちで止まらず、最後の確定操作だけ加算する',async()=>{
  const h=harness();try{
    const s=h.session();s.chessClock.remaining=[20000,50000];s.chessClock.startedAt=Date.now()-7000;s.expires=s.chessClock.deadline();
    const deadline=s.expires;await h.games.handle(h.interaction(s,'piecee2'));assert.equal(s.expires,deadline);
    await h.games.handle(h.interaction(s,'toe4'));assert.equal(s.chessClock.turn,2);
    assert.ok(s.chessClock.remaining[0]<=18000&&s.chessClock.remaining[0]>17000);assert.equal(s.chessClock.remaining[1],50000);
    const promotion=h.session(new ChessGame('4k3/P7/8/8/8/8/8/4K3 w - - 0 1'));
    const before=promotion.chessClock.remaining[0],expires=promotion.expires;
    await h.games.handle(h.interaction(promotion,'piecea7'));await h.games.handle(h.interaction(promotion,'toa8'));
    assert.equal(promotion.expires,expires);assert.equal(promotion.chessClock.turn,1);assert.equal(promotion.chessClock.remaining[0],before);
    await h.games.handle(h.interaction(promotion,'promoteq'));assert.equal(promotion.chessClock.turn,2);assert.ok(promotion.chessClock.remaining[0]>before);
  }finally{await h.games.close();}
});

test('予定手による申告のUIは対象の手だけを表示し、盤面を動かさず一度だけ精算する',async()=>{
  const game=new ChessGame(),cycle=[['g1','f3'],['g8','f6'],['f3','g1'],['f6','g8']];
  for(const [from,to]of [...cycle,...cycle.slice(0,3)])move(game,from,to);
  const h=harness();try{
    const s=h.session(game),fen=game.engine.fen();
    assert.ok(JSON.stringify(await h.games.payload(s)).includes('引き分けを申告'));
    await h.games.handle(h.interaction(s,'claim','black'));assert.equal(game.claiming,true);validateCard(await h.games.payload(s));
    await h.games.handle(h.interaction(s,'piecef6','black'));assert.ok(game.destinations().includes('g8'));
    validateCard(await h.games.payload(s));
    await h.games.handle(h.interaction(s,'tog8','black'));assert.equal(s.phase,'finished');assert.equal(game.winner,0);assert.equal(game.engine.fen(),fen);
    assert.equal(h.rewards.length,1);
    await h.games.handle(h.interaction(s,'claim','black'));assert.equal(h.rewards.length,1);
  }finally{await h.games.close();}
});

test('Bot戦でも引き分け提案を受け付け、不利なら同意し、有利なら拒否する',async()=>{
  const h=harness();try{
    const accepts=h.session(new ChessGame('7k/8/8/8/8/8/8/KQR5 w - - 0 1'));accepts.players=['white','bot'];
    await h.games.handle(h.interaction(accepts,'draw'));assert.equal(accepts.phase,'finished');assert.equal(accepts.chess.winner,0);
    const declines=h.session(new ChessGame('6qk/8/8/8/8/8/8/K7 w - - 0 1'));declines.players=['white','bot'];
    await h.games.handle(h.interaction(declines,'draw'));assert.equal(declines.phase,'playing');assert.equal(declines.chess.drawOffer,undefined);
    const claims=h.session(new ChessGame('7k/8/8/8/8/8/8/KR6 b - - 100 51'));claims.players=['white','bot'];
    await playBotTurn(claims,'bot');assert.equal(claims.chess.winner,0);assert.match(claims.chess.ending(),/50手ルール/);
    assert.ok(chooseChessMove('7k/8/8/8/8/8/8/KR6 b - - 100 51',100,50));
  }finally{await h.games.close();}
});

test('募集者が持ち時間を選び、参加時に選択した総持ち時間の時計が開始する',async()=>{
  const h=harness();try{
    const s=h.session();s.phase='recruiting';s.players=['white'];s.chess=undefined;s.chessClock=undefined;
    const choose={...h.interaction(s,'clock'),isStringSelectMenu:()=>true,values:['15+10']};
    await h.games.handle({...choose,user:{id:'black'}});assert.equal(s.timeControl,undefined);
    await h.games.handle(choose);assert.equal(s.timeControl,'15+10');
    validateCard(await h.games.payload(s));
    await h.games.handle(h.interaction(s,'join','black'));assert.equal(s.phase,'playing');assert.equal(s.chessClock.control,'15+10');
    assert.deepEqual(s.chessClock.remaining,[900000,900000]);assert.equal(s.expires,s.chessClock.deadline());
    s.phase='finished';await h.games.payload(s);
    let replayArgs;h.games.create=async(...args)=>{replayArgs=args;};
    await h.games.replay({customId:`replay:${s.id}`,channelId:s.channelId,user:{id:'white'},deferReply:async()=>{}});
    assert.equal(replayArgs.at(-1),'15+10');
  }finally{await h.games.close();}
});

test('旗落ちは盤面を動かす前に判定し、相手がキングのみなら引き分けとして精算する',async()=>{
  const h=harness();try{
    const s=h.session(new ChessGame('7k/8/8/8/8/8/8/KR6 w - - 0 1')),fen=s.chess.engine.fen();
    s.chessClock.remaining[0]=0;s.chessClock.startedAt=Date.now()-1;s.expires=s.chessClock.deadline();
    await h.games.handle(h.interaction(s,'pieceb1'));assert.equal(s.phase,'finished');assert.equal(s.chess.winner,0);
    assert.equal(s.chess.engine.fen(),fen);assert.equal(s.chessClock.remaining[0],0);assert.match(s.result,/詰ませる手段/);
    assert.equal(h.rewards.length,1);
    const bot=h.session(new ChessGame('7k/8/8/8/8/8/8/KR6 b - - 100 51'));bot.players=['white','bot'];
    bot.chessClock.remaining[1]=0;bot.chessClock.startedAt=Date.now()-1;
    await playBotTurn(bot,'bot');assert.equal(bot.chess.winner,1);assert.equal(bot.chess.ending(),'時間切れ');
  }finally{await h.games.close();}
});

test('時計・申告・引分提案・20候補を同時表示してもDiscordの文字数と部品数の上限内に収まる',async()=>{
  const names=[...manifest.map(e=>e.name),...chessEmojiNames,...boardMarkerEntries.map(e=>e.name)];
  setEmojiMappings(Object.fromEntries(names.map((name,i)=>[name,`<:${name}:${10000000000000000000n+BigInt(i)}>`])));
  const h=harness();try{
    const s=h.session(new ChessGame('8/7k/8/8/3Q4/8/8/K7 w - - 99 51'));
    s.players=['10000000000000000000','10000000000000000001'];s.chess.offerDraw(s.players[0],'w');s.chess.select('d4');
    for(const page of [0,1]){s.page=page;validateCard(await h.games.payload(s));}
    s.chess.claiming=true;
    for(const page of [0,1]){s.page=page;validateCard(await h.games.payload(s));}
  }finally{setEmojiMappings({});await h.games.close();}
});

test('全難易度で地雷数と初手周辺の安全を保証し、旗だけではクリアしない',()=>{
  for(const level of Object.keys(mineLevels))for(const [r,c]of [[0,0],[2,2],[mineLevels[level].size-1,mineLevels[level].size-1]])for(let n=0;n<8;n++) {
    const game=new Minesweeper(level);assert.equal(game.planted,false);game.open(r,c);
    assert.equal(game.mines.flat().filter(Boolean).length,game.mineCount);
    for(const m of [{row:r,col:c},...game.neighbors(r,c)])assert.equal(game.mines[m.row][m.col],false);
    assert.ok(game.openCount>1);assert.notEqual(game.outcome,'lost');
    for(let row=0;row<game.size;row++)for(let col=0;col<game.size;col++)if(!game.mines[row][col]&&!game.opened[row][col]&&!game.outcome)game.open(row,col);
    assert.equal(game.outcome,'won');assert.equal(game.openCount,game.size**2-game.mineCount);
    assert.throws(()=>game.open(0,0),/終了/);
  }
  const flagOnly=new Minesweeper('easy');for(let c=0;c<6;c++)flagOnly.flag(0,c);
  assert.equal(flagOnly.outcome,null);assert.equal(flagOnly.planted,false);assert.throws(()=>flagOnly.flag(1,0),/地雷の数/);
  assert.throws(()=>flagOnly.open(0,0),/旗を外して/);flagOnly.flag(0,0);assert.equal(flagOnly.flagCount,5);
  assert.throws(()=>flagOnly.open(-1,0),/盤面内/);assert.equal(mineLevel('初級'),'easy');assert.throws(()=>mineLevel('unknown'));
});

test('数字マスからの一括展開は正しい旗で開き、誤った旗で地雷を踏む',()=>{
  for(const correct of [true,false]) {
    const game=new Minesweeper('easy');game.planted=true;game.mines[0][0]=true;game.opened[1][1]=true;
    assert.throws(()=>game.open(1,1),/旗の数/);
    game.flag(0,correct?0:1);game.open(1,1);
    assert.equal(game.outcome,correct?null:'lost');
    if(correct)assert.equal(game.opened[0][0],false);else assert.equal(game.openCount,1);
  }
});

test('チェスは他人・相手番・古い操作・連打を拒否し、駒選択で時計を延長しない',async()=>{
  const h=harness(),s=h.session();
  try {
    const deadline=s.expires;
    await h.games.handle(h.interaction(s,'piecee2','spectator'));assert.equal(s.chess.selected,undefined);
    await h.games.handle(h.interaction(s,'piecee2','black'));assert.equal(s.chess.selected,undefined);
    await h.games.handle(h.interaction(s,'piecee2'));assert.equal(s.chess.selected,'e2');assert.equal(s.expires,deadline);
    const rev=s.revision;
    await h.games.handle(h.interaction(s,'toe4','white',rev-1));assert.equal(s.chess.turn,1);
    await Promise.all([h.games.handle(h.interaction(s,'toe4','white',rev)),h.games.handle(h.interaction(s,'toe4','white',rev))]);
    assert.equal(s.chess.engine.history().length,1);assert.equal(s.chess.turn,2);
    assert.ok(h.notices.length>=4);assert.equal(h.rewards.length,0);
    for(const notice of h.notices)assert.equal(notice.flags&64,64);
    const serialized=h.saved.get(s.id);assert.match(serialized.chess.pgn,/e4/);
  } finally {await h.games.close();}
});

test('引き分けは対戦相手の同意が必要で一度だけ精算し、短い対戦は報酬なし',async()=>{
  const h=harness(),s=h.session();
  for(const san of ['e4','e5','Nf3','Nc6','Bb5','a6','Ba4','Nf6','O-O','Be7','Re1','b5'])s.chess.engine.move(san);
  try {
    const deadline=s.expires;
    await h.games.handle(h.interaction(s,'draw'));assert.equal(s.chess.drawOffer,'white');assert.equal(s.expires,deadline);
    await h.games.handle(h.interaction(s,'draw'));assert.equal(h.rewards.length,0);
    await h.games.handle(h.interaction(s,'draw','black'));assert.equal(s.phase,'finished');assert.deepEqual(h.rewards,[{white:50n,black:50n}]);
    await h.games.handle(h.interaction(s,'draw','black'));assert.equal(h.rewards.length,1);
    assert.deepEqual(chessReward(11),{win:0n,lose:0n,draw:0n});assert.equal(chessReward(12).win,300n);assert.equal(chessReward(12,true).win,180n);
  } finally {await h.games.close();}
});

test('着手で引分提案を取り消し、時間切れ・投了の勝者を正しく決める',async()=>{
  const h=harness();
  try {
    const s=h.session();await h.games.handle(h.interaction(s,'draw','black'));assert.equal(s.chess.drawOffer,'black');
    await h.games.handle(h.interaction(s,'piecee2'));await h.games.handle(h.interaction(s,'toe4'));assert.equal(s.chess.drawOffer,undefined);
    await h.games.handle(h.interaction(s,'resignblack','black'));assert.equal(s.chess.winner,1);assert.equal(s.phase,'finished');
    const expired=h.session();expired.id='expired';h.games.sessions.clear();h.games.sessions.set(expired.id,expired);expired.expires=Date.now()-1;
    await h.games.handle(h.interaction(expired,'piecee2'));assert.equal(expired.chess.winner,2);assert.equal(expired.phase,'finished');
  } finally {await h.games.close();}
});

test('マインスイーパー単体実行は難易度選択を表示し、本人の選択でだけ開始する',async()=>{
  for(const level of Object.keys(mineLevels)) {
    const h=harness();
    try {
      let initial;
      const s=await h.games.create('minesweeper','white','channel',async payload=>{validateCard(payload);initial=json(payload);return {id:'message'};});
      assert.equal(s.phase,'recruiting');assert.equal(s.mines,undefined);
      const contents=JSON.stringify(initial);
      for(const spec of Object.values(mineLevels)) {
        assert.ok(contents.includes(spec.label));assert.ok(contents.includes(`+${spec.reward}pt`));
      }
      for(const forbidden of ['対戦相手を募集中','承認する','Botと対戦'])assert.ok(!contents.includes(forbidden));
      const all=initial.components[0].components;
      const choices=all.filter(c=>c.type===1).flatMap(c=>c.components).filter(c=>c.custom_id.includes('difficulty_'));
      assert.equal(choices.length,3);assert.equal(all.filter(c=>c.type===1&&c.components.some(b=>b.custom_id.includes('difficulty_'))).length,1);
      await h.games.handle(h.interaction(s,`difficulty_${level}`,'spectator'));
      assert.equal(s.phase,'recruiting');assert.equal(s.mines,undefined);assert.equal(h.notices.at(-1).flags&64,64);
      await h.games.handle(h.interaction(s,'join'));assert.equal(s.phase,'recruiting');
      await h.games.handle(h.interaction(s,'difficulty_invalid'));assert.equal(s.phase,'recruiting');
      const previous=s.revision;
      await h.games.handle(h.interaction(s,`difficulty_${level}`));
      assert.equal(s.phase,'playing');assert.equal(s.mines.level,level);assert.equal(s.size,mineLevels[level].size);assert.equal(s.mines.planted,false);
      assert.ok(s.expires>Date.now()+590_000);
      await h.games.handle(h.interaction(s,'difficulty_easy','white',previous));assert.equal(s.mines.level,level);
      assert.equal(h.rewards.length,0);
    } finally {await h.games.close();}
  }
});

test('マインスイーパー難易度選択は取消・期限切れで精算せず終了する',async()=>{
  for(const expired of [false,true]) {
    const h=harness();
    try {
      const s=await h.games.create('minesweeper','white','channel',async()=>({id:'message'}));
      await h.games.handle(h.interaction(s,'cancel','spectator'));assert.equal(s.phase,'recruiting');
      if(expired)s.expires=Date.now()-1;
      await h.games.handle(h.interaction(s,expired?'difficulty_easy':'cancel'));
      assert.equal(s.phase,'finished');assert.equal(s.mines,undefined);assert.equal(h.games.sessions.size,0);assert.equal(h.rewards.length,0);
      assert.ok(!JSON.stringify(h.edits.at(-1)).includes('募集'));
    } finally {await h.games.close();}
  }
});

test('マインスイーパーの募集不要・本人操作・再挑戦設定・クリア精算を確認する',async()=>{
  const h=harness();
  try {
    const s=await h.games.create('minesweeper','white','channel',async p=>{validateCard(p);return {id:'message'};},undefined,8,0n,'hard');
    assert.equal(s.phase,'playing');assert.equal(s.mines.level,'hard');assert.equal(s.size,10);
    await assert.rejects(h.games.create('minesweeper','white','channel',async()=>({id:'other'})),/参加中/);
    await h.games.handle(h.interaction(s,'row9','spectator'));assert.equal(s.mines.selectedRow,undefined);
    await h.games.handle(h.interaction(s,'row9'));assert.equal(s.mines.selectedRow,9);
    await h.games.handle(h.interaction(s,'mode'));await h.games.handle(h.interaction(s,'cell0'));assert.equal(s.mines.flags[9][0],true);
    await h.games.handle(h.interaction(s,'cell0'));assert.equal(s.mines.flags[9][0],false);
    for(let r=0;r<s.mines.size;r++)for(let c=0;c<s.mines.size;c++)s.mines.mines[r][c]=r%2===0&&[1,3,5,7].includes(c);
    s.mines.planted=true;
    await h.games.handle(h.interaction(s,'mode'));await h.games.handle(h.interaction(s,'cell0'));assert.equal(s.mines.planted,true);
    let last;
    for(let r=0;r<s.mines.size;r++)for(let c=0;c<s.mines.size;c++)if(!s.mines.mines[r][c]&&!s.mines.opened[r][c])last={r,c};
    assert.ok(last);
    for(let r=0;r<s.mines.size;r++)for(let c=0;c<s.mines.size;c++)if(!s.mines.mines[r][c])s.mines.opened[r][c]=!(r===last.r&&c===last.c);
    s.mines.selectedRow=last.r;
    await h.games.handle(h.interaction(s,`cell${last.c}`));assert.equal(s.phase,'finished');assert.deepEqual(h.rewards,[{white:220n}]);
    await h.games.handle(h.interaction(s,`cell${last.c}`));assert.equal(h.rewards.length,1);
    let args;h.games.create=async(...values)=>{args=values;};
    await h.games.replay({customId:`replay:${s.id}`,user:{id:'white'},channelId:'channel',deferReply:async()=>{}});
    assert.equal(args[7],'hard');
  } finally {await h.games.close();}
});

test('盤面・長い候補・ヘルプがDiscordのサイズ制限に収まり、既存のスラッシュ登録を保つ',async()=>{
  const h=harness();
  try {
    const game=new ChessGame('7k/8/8/8/3Q4/8/8/K7 w - - 0 1');game.select('d4');assert.ok(game.destinations().length>20);
    const s=h.session(game),payload=await h.games.payload(s);validateCard(payload);
    const boardRows=json(payload).components[0].components.filter(c=>c.type===10&&c.content.startsWith('## ')&&!c.content.includes('\n'));
    assert.equal(boardRows.length,0);
    assert.ok(json(payload).components[0].components.some(c=>c.type===10&&c.content.includes(chessText(game))));
    assert.ok(!/^#|\u2028/mu.test(chessText(game)));
    s.page=1;validateCard(await h.games.payload(s));
    assert.ok(chessControls(game,0,a=>a).length<=6);assert.equal(chessText(game).split(/\n|\u2028/u).length,9);
    for(const level of Object.keys(mineLevels)) {
      const mines=new Minesweeper(level);mines.selectedRow=mines.size-1;
      validateCard(await h.games.payload({...s,kind:'minesweeper',chess:undefined,mines}));assert.equal(minesControls(mines,a=>a).length,5);
    }
    validateCard(help('games'));
    assert.deepEqual(parseLegacy('チェス <@123>'),{name:'chess',args:['<@123>']});
    assert.deepEqual(parseLegacy('マインスイーパー 初級'),{name:'minesweeper',args:['初級']});
    assert.deepEqual(slashCommands.map(c=>c.name),['help','imakita']);
  } finally {await h.games.close();}
});

test('チェス専用絵文字と選択・移動・駒取り・チェックの表示を128px PNGとして生成できる',async()=>{
  assert.equal(chessEmojiNames.length,82);assert.equal(new Set(chessEmojiNames).size,82);
  for(const name of chessEmojiNames) {
    const bytes=await chessEmojiImage(name),meta=await sharp(bytes).metadata();
    assert.equal(meta.width,128);assert.equal(meta.height,128);assert.equal(meta.format,'png');assert.ok(bytes.length<256*1024);
    const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const alpha=(x,y)=>data[(y*128+x)*info.channels+3];
    for(let p=0;p<128;p++){
      assert.equal(alpha(0,p),0,name);assert.equal(alpha(127,p),0,name);
      assert.equal(alpha(p,0),0,name);assert.equal(alpha(p,127),0,name);
    }
    assert.equal(alpha(2,64),0,name);assert.equal(alpha(3,64),255,name);
    if(/^c_[wb]p_/.test(name)){
      const pixel=data.subarray((91*128+95)*info.channels,(91*128+96)*info.channels);
      assert.deepEqual([...pixel],name.startsWith('c_wp_')?[0,0,0,255]:[255,255,255,255],name);
      const center=data.subarray((64*128+64)*info.channels,(64*128+65)*info.channels);
      assert.deepEqual([...center],name.startsWith('c_wp_')?[255,255,255,255]:[0,0,0,255],name);
    }
    if(name.includes('empty')){
      const pixel=(x,y)=>data.subarray((y*128+x)*info.channels,(y*128+x+1)*info.channels);
      for(let y=16;y<112;y+=8)for(let x=16;x<112;x+=8)assert.deepEqual(pixel(x,y),pixel(64,64),name);
    }
  }
  await assert.rejects(chessEmojiImage('../arbitrary'));
});

test('初期配置は10個の駒・20通りの合法手を持ち、全32個の駒を番号で隠さない',async()=>{
  const game=new ChessGame();
  assert.equal(game.pieces().length,10);assert.equal(game.moves().length,20);
  assert.equal(chessCells(game).flat().filter(c=>c.piece).length,32);
  assert.ok(chessCells(game).flat().every(c=>c.state===''));
  game.select('e2');const cells=chessCells(game).flat();
  assert.equal(cells.find(c=>c.square==='e2').state,'s');
  assert.equal(cells.find(c=>c.square==='e2').piece.type,'p');
  assert.deepEqual(cells.filter(c=>c.state==='m').map(c=>c.square).sort(),['e3','e4']);
  const controls=chessControls(game,0,a=>a).flatMap(r=>r.toJSON().components);
  assert.equal(controls.find(c=>c.custom_id==='toe4').style,3);
  assert.match(controls.find(c=>c.custom_id==='toe4').label,/e4.*移動/);
  const h=harness();
  try {
    const payload=JSON.stringify(await h.games.payload(h.session()));
    assert.match(payload,/① 動かす駒を選ぶ/);assert.match(payload,/10個/);assert.match(payload,/20通り/);
  } finally {await h.games.close();}
});

test('駒取りは相手の駒を残して赤く示し、アンパッサン・チェック・全ページの移動先を区別する',()=>{
  const capture=new ChessGame('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1');capture.select('d1');
  const target=chessCells(capture).flat().find(c=>c.square==='d5');assert.equal(target.state,'m');assert.equal(target.piece.type,'q');
  const attack=chessControls(capture,0,a=>a).flatMap(r=>r.toJSON().components).find(c=>c.custom_id==='tod5');
  assert.equal(attack.style,4);assert.match(attack.label,/クイーンを取る/);
  const ep=new ChessGame();for(const [from,to]of [['e2','e4'],['a7','a6'],['e4','e5'],['d7','d5']])move(ep,from,to);
  ep.select('e5');assert.equal(chessCells(ep).flat().find(c=>c.square==='d6').state,'t');
  const check=new ChessGame('k3r3/8/8/8/8/8/8/4K3 w - - 0 1');
  assert.equal(chessCells(check).flat().find(c=>c.square==='e1').state,'c');
  const wide=new ChessGame('7k/8/8/8/3Q4/8/8/K7 w - - 0 1');wide.select('d4');
  const highlighted=chessCells(wide).flat().filter(c=>c.state==='m').map(c=>c.square).sort();
  assert.deepEqual(highlighted,[...wide.destinations()].sort());assert.ok(highlighted.length>20);
  const buttons=[0,1].flatMap(page=>chessControls(wide,page,a=>a).flatMap(r=>r.toJSON().components)).filter(c=>/^to[a-h][1-8]$/.test(c.custom_id));
  assert.deepEqual(buttons.map(b=>b.custom_id.slice(2)).sort(),highlighted);
  assert.ok(chessCells(wide,true).flat().every(c=>c.state===''));
});

test('チェスBotはメイト・駒取り・チェック回避・昇格を合法手から選ぶ',()=>{
  const mate=new ChessGame('7k/5K2/6Q1/8/8/8/8/8 w - - 0 1');
  const winning=chooseChessMove(mate.engine.fen());move(mate,winning.from,winning.to,winning.promotion);assert.equal(mate.ending(),'チェックメイト');
  const capture=new ChessGame('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1');
  const taking=chooseChessMove(capture.engine.fen());assert.equal(taking.from,'d1');assert.equal(taking.to,'d5');
  for(const fen of ['k3r3/8/8/8/8/8/8/4K3 w - - 0 1','4k3/P7/8/8/8/8/8/4K3 w - - 0 1']) {
    const game=new ChessGame(fen),chosen=chooseChessMove(fen);
    assert.ok(game.moves().some(m=>m.from===chosen.from&&m.to===chosen.to&&m.promotion===chosen.promotion));
    move(game,chosen.from,chosen.to,chosen.promotion);
    if(fen.includes('P7'))assert.equal(game.engine.get('a8').type,'q');
  }
  assert.equal(chooseChessMove(mate.engine.fen()),undefined);
});

test('Botを先手・後手にして自動応手し、駒の選択・昇格の途中では着手しない',async()=>{
  const h=harness();
  try {
    const whiteBot=h.session();whiteBot.players=['bot','white'];whiteBot.phase='recruiting';
    let recruiting=json(await h.games.payload(whiteBot));assert.match(JSON.stringify(recruiting),/Botと対戦/);
    await h.games.handle(h.interaction(whiteBot,'bot','white'));
    assert.equal(whiteBot.phase,'playing');
    assert.equal(whiteBot.chess.engine.history().length,whiteBot.players[0]==='bot'?1:0);
    assert.equal(whiteBot.players[whiteBot.chess.turn-1],'white');
    const opening=h.session();opening.players=['bot','white'];
    await playBotTurn(opening,'bot');assert.equal(opening.chess.engine.history().length,1);assert.equal(opening.chess.turn,2);
    const s=h.session();s.players=['white','bot'];
    const deadline=s.expires;
    await h.games.handle(h.interaction(s,'piecee2'));assert.equal(s.chess.engine.history().length,0);assert.equal(s.expires,deadline);
    await h.games.handle(h.interaction(s,'toe4'));assert.equal(s.chess.engine.history().length,2);assert.equal(s.chess.turn,1);
    assert.ok(JSON.stringify(await h.games.payload(s)).includes('引き分けを提案'));
    const promotion=h.session(new ChessGame('4k3/P7/8/8/8/8/8/4K3 w - - 0 1'));promotion.players=['white','bot'];
    await h.games.handle(h.interaction(promotion,'piecea7'));await h.games.handle(h.interaction(promotion,'toa8'));
    assert.equal(promotion.chess.engine.history().length,0);assert.equal(promotion.chess.promotion,'a8');
    await h.games.handle(h.interaction(promotion,'promoteq'));assert.equal(promotion.chess.engine.history().length,2);
    assert.equal(promotion.chess.turn,1);
  } finally {await h.games.close();}
});

test('Bot戦の指名・操作権限・勝敗と精算を確認し、Botの口座は変更しない',async()=>{
  const h=harness();
  try {
    const named=h.session();named.phase='recruiting';named.target='black';
    const data=JSON.stringify(await h.games.payload(named));assert.match(data,/Botと対戦/);
    await h.games.handle(h.interaction(named,'bot'));assert.equal(named.phase,'recruiting');
    named.target='bot';await h.games.handle(h.interaction(named,'bot','black'));assert.equal(named.phase,'recruiting');
    const game=new ChessGame('8/8/8/8/6q1/5k2/8/7K w - - 0 7');
    const s=h.session(game);s.players=['white','bot'];
    for(const m of game.moves()) {
      const trial=new ChessGame(game.engine.fen());move(trial,m.from,m.to,m.promotion);
      const answer=chooseChessMove(trial.engine.fen());
      if(answer) {move(trial,answer.from,answer.to,answer.promotion);if(trial.winner===2) {
        await h.games.handle(h.interaction(s,`piece${m.from}`));await h.games.handle(h.interaction(s,`to${m.to}`));break;
      }}
    }
    assert.equal(s.phase,'finished');assert.equal(s.chess.winner,2);assert.equal(h.rewards.length,1);
    assert.ok(!Object.hasOwn(h.rewards[0],'bot'));
    assert.equal(chessReward(12,false,true).win,200n);assert.equal(chessReward(12,false,true).lose,-40n);
    const resignation=h.session();resignation.id='bot-resignation';resignation.players=['white','bot'];h.games.sessions.set(resignation.id,resignation);
    for(const san of ['e4','e5','Nf3','Nc6','Bb5','a6','Ba4','Nf6','O-O','Be7','Re1','b5'])resignation.chess.engine.move(san);
    await h.games.handle(h.interaction(resignation,'resignwhite'));
    assert.deepEqual(h.rewards[1],{white:-40n});
  } finally {await h.games.close();}
});

test('ソース版とビルド版のチェス思考WorkerがBunで動く',async()=>{
  const game=new ChessGame(),fen=game.engine.fen();
  const source=await chessBotMove(fen);assert.ok(source);assert.ok(game.moves().some(m=>m.from===source.from&&m.to===source.to));
  const {chessBotMove:compiledBotMove}=await import('../dist/games/chess-bot.js');
  const compiled=await compiledBotMove(fen);assert.ok(compiled);assert.ok(game.moves().some(m=>m.from===compiled.from&&m.to===compiled.to));
});

test('マインスイーパー専用の29種類がSVG原本・128px PNG・透明な余白を持つ',async()=>{
  const assets=await loadMineEmojiAssets();assert.equal(assets.length,29);assert.equal(new Set(mineEmojiNames).size,29);assert.equal(new Set(assets.map(a=>a.image.toString('base64'))).size,29);
  for(const asset of assets){
    const source=await readFile(`assets/emojis/svg/games/minesweeper/${asset.name}.svg`,'utf8');
    assert.match(source,/<svg[\s>]/);assert.doesNotMatch(source,/<image[\s>]|data:image|<script[\s>]/i);
    const {data,info}=await sharp(asset.image).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    assert.equal(info.width,128);assert.equal(info.height,128);assert.ok(asset.image.length<256*1024);
    const pixel=(x,y)=>data.subarray((y*128+x)*info.channels,(y*128+x+1)*info.channels);
    for(let n=0;n<128;n++)for(const [x,y] of [[0,n],[127,n],[n,0],[n,127]])assert.equal(pixel(x,y)[3],0,asset.name);
    assert.equal(pixel(2,64)[3],0,asset.name);assert.equal(pixel(3,64)[3],255,asset.name);
    if(['ms_c','ms_o'].includes(asset.name))for(let y=16;y<112;y+=16)for(let x=16;x<112;x+=16)assert.deepEqual(pixel(x,y),pixel(64,64),asset.name);
  }
});

test('マインスイーパーは指定色と大きい字形を使い、数字の高さを92px以上にする',async()=>{
  const assets=await loadMineEmojiAssets();
  const blue=[59,136,195],red=[221,46,68];
  const grass=[[170,215,81],[127,179,68]],earth=[[228,199,158],[164,123,85]];
  const colors=[blue,[56,142,60],red,[126,87,194],[181,93,20],[0,131,143],[38,50,56],[170,51,119]];
  assert.equal(new Set(colors.map(c=>c.join(','))).size,8);
  for(const {name,image}of assets){
    const data=await sharp(image).ensureAlpha().raw().toBuffer();
    const dark=name.endsWith('_d')?1:0,base=name.replace(/_d$/,'');
    const expected=base==='ms_a'?blue:['ms_c','ms_f'].includes(base)?grass[dark]:base==='ms_x'?(dark?[201,38,60]:red):earth[dark];
    assert.deepEqual([...data.subarray((4*128+4)*4,(4*128+5)*4)],[...expected,255],name);
    if(/^ms_[1-8](?:_d)?$/.test(name)){
      const color=colors[Number(name.match(/ms_([1-8])/)[1])-1],ys=[];
      for(let y=0;y<128;y++)for(let x=0;x<128;x++)if(color.every((v,i)=>data[(y*128+x)*4+i]===v)&&data[(y*128+x)*4+3]===255)ys.push(y);
      assert.ok(Math.max(...ys)-Math.min(...ys)+1>=92,name);assert.ok(ys.length>=1000,name);
    }
  }
});

test('マインスイーパーの座標を空白なしで揃え、選択行とボタンの絵文字を一致させる',async()=>{
  const names=[...manifest.map(e=>e.name),...mineEmojiNames,...boardMarkerEntries.map(e=>e.name)];
  const mapping=Object.fromEntries(names.map((name,i)=>[name,`<:${name}:${1000000000000000000n+BigInt(i)}>`]));
  setEmojiMappings(mapping);const h=harness();try{
    const game=new Minesweeper('hard');game.selectedRow=9;
    const lines=minesText(game).split('\n');assert.equal(lines.length,11);
    assert.ok(lines.every(line=>!/[ \u3000]/.test(line)));
    assert.ok(lines[0].startsWith(mapping.board_spacer+mapping.b_A));assert.ok(lines[10].startsWith(mapping.r_A+mapping.ms_c_d));
    assert.ok(minesText(game,true).split('\n')[10].startsWith(mapping.b_A));
    const s={...h.session(),kind:'minesweeper',chess:undefined,mines:game};
    const payload=json(await h.games.payload(s));validateCard(payload);
    const buttons=payload.components[0].components.filter(c=>c.type===1).flatMap(r=>r.components);
    assert.ok(buttons.filter(b=>/:row\d$|:cell\d$/.test(b.custom_id)).every(b=>b.emoji?.id));
    assert.equal(buttons.find(b=>b.custom_id.endsWith(':row9')).emoji.id,/:([0-9]+)>/.exec(mapping.r_A)[1]);
    assert.equal(buttons.find(b=>b.custom_id.endsWith(':cell0')).label,'AA');
  }finally{setEmojiMappings({});await h.games.close();}
});

test('周囲を開くボタンは旗がそろってから有効になり、旗や開いた数字もアイコンで確認できる',()=>{
  const names=[...manifest.map(e=>e.name),...mineEmojiNames];
  const mapping=Object.fromEntries(names.map((name,i)=>[name,`<:${name}:${1000000000000000000n+BigInt(i)}>`]));
  setEmojiMappings(mapping);try{
    const game=new Minesweeper('easy');game.planted=true;game.mines[0][0]=true;game.opened[1][1]=true;game.selectedRow=1;
    const buttons=()=>minesControls(game,a=>a).flatMap(r=>r.toJSON().components);
    assert.equal(buttons().find(b=>b.custom_id==='cell1').disabled,true);
    game.flags[0][0]=true;
    const chord=buttons().find(b=>b.custom_id==='cell1');assert.equal(chord.disabled,false);assert.match(chord.label,/周囲を開く/);
    assert.equal(chord.emoji.id,/:([0-9]+)>/.exec(mapping.ms_1)[1]);
    game.flags[1][3]=true;assert.equal(buttons().find(b=>b.custom_id==='cell3').disabled,true);
    game.mode='flag';assert.equal(buttons().find(b=>b.custom_id==='cell1').disabled,true);
    assert.equal(buttons().find(b=>b.custom_id==='cell3').disabled,false);
    assert.equal(buttons().find(b=>b.custom_id==='cell3').emoji.id,/:([0-9]+)>/.exec(mapping.ms_f)[1]);
  }finally{setEmojiMappings({});}
});

test('未開封・空白・数字・旗・地雷・爆発・間違った旗を区別する',()=>{
  const game=new Minesweeper('easy');game.planted=true;
  game.mines[1][1]=true;game.mines[0][2]=true;game.mines[5][5]=true;
  game.flags[0][0]=true;game.flags[1][1]=true;game.opened[0][2]=true;game.opened[1][0]=true;game.opened[5][0]=true;
  assert.equal(minesCellName(game,4,4),'ms_c');assert.equal(minesCellName(game,5,0),'ms_o');assert.equal(minesCellName(game,1,0),'ms_1');
  assert.equal(minesCellName(game,0,0),'ms_f');assert.equal(minesCellName(game,5,5),'ms_c');
  assert.equal(minesCellName(game,0,0,true),'ms_w');assert.equal(minesCellName(game,1,1,true),'ms_f');
  assert.equal(minesCellName(game,0,2,true),'ms_x');assert.equal(minesCellName(game,5,5,true),'ms_b');
});

test('実際のカスタム絵文字参照でも10×10のゲーム中・終了カードが4000文字以内に収まる',async()=>{
  const names=[...manifest.map(e=>e.name),...mineEmojiNames,...boardMarkerEntries.map(e=>e.name)];
  const mapping=Object.fromEntries(names.map((name,i)=>[name,`<:${name}:${10000000000000000000n+BigInt(i)}>`]));
  setEmojiMappings(mapping);const h=harness();
  try {
    for(const level of Object.keys(mineLevels)){
      const mines=new Minesweeper(level);mines.selectedRow=mines.size-1;mines.mode='flag';
      const s={...h.session(),kind:'minesweeper',host:'10000000000000000000',players:['10000000000000000000'],chess:undefined,mines,size:mines.size};
      validateCard(await h.games.payload(s));
      const text=minesText(mines);assert.equal((text.match(/<:ms_c(?:_d)?:/g)||[]).length,mines.size**2);
      if(level==='hard'){assert.ok(text.includes(mapping.r_A));assert.ok(!text.includes('🔟'));}
      for(let r=0;r<mines.size;r++)for(let c=0;c<mines.size;c++){mines.flags[r][c]=true;mines.mines[r][c]=c===0;mines.opened[r][c]=true;}
      s.phase='finished';s.result='ゲーム終了';validateCard(await h.games.payload(s));
      assert.ok(minesText(mines,true).includes(mapping.ms_w));
    }
  }finally{setEmojiMappings({});await h.games.close();}
});
