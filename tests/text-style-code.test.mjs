import assert from 'node:assert/strict';
import {test} from 'node:test';
import {encodeTextStyle,decodeTextStyle} from '../src/data/text-style-code.ts';
import {defaultTextStyle,presetTextStyle,validateTextStyle} from '../src/data/text-style.ts';
import {generateCustomTextImage} from '../src/services/custom-text-image.ts';

test('コードだけから設定を復元し、同じ設定は同じ読みやすいコードになる',async()=>{
  const code='tc1;font=mochiy;fill=#e674dc;layers=outline:#ffffff:8';
  assert.equal(encodeTextStyle(defaultTextStyle()),code);
  assert.deepEqual(decodeTextStyle(code),validateTextStyle(defaultTextStyle()));
  assert.equal(encodeTextStyle(decodeTextStyle('tc1;layers=outline:#FFFFFF:8;fill=#E674DC;font=mochiy')),code);
  assert.deepEqual(await generateCustomTextImage('復元',decodeTextStyle(code)),await generateCustomTextImage('復元',defaultTextStyle()));
});

test('書式・配置・透明度・多重レイヤー・全プリセットを欠落なく往復変換する',()=>{
  const style=defaultTextStyle();
  Object.assign(style,{font:'serif',italic:true,rotation:-12.5,skew:.15,spacing:12.25,lineHeight:1.85,align:'right',fit:'stretch',width:700,height:900,padding:14,opacity:.55,background:'#123abc'});
  style.fill={kind:'gradient',colors:['#ff0000','#00ff00','#0000ff'],angle:-45};
  style.layers=[{kind:'outline',color:'#abcdef',width:4.5,opacity:.7},{kind:'shadow',color:'#123456',x:-8.5,y:12.25,blur:3,spread:4,opacity:.6},{kind:'shadow',color:'#777777',x:0,y:0,blur:0,spread:0,opacity:1}];
  assert.deepEqual(decodeTextStyle(encodeTextStyle(style)),validateTextStyle(style));
  style.fill.kind='rainbow';assert.deepEqual(decodeTextStyle(encodeTextStyle(style)),validateTextStyle(style));
  style.layers=[];assert.deepEqual(decodeTextStyle(encodeTextStyle(style)),validateTextStyle(style));
  style.layers=Array.from({length:24},(_,i)=>({kind:'shadow',color:'#123abc',x:i-12,y:12-i,blur:i%10,spread:i%8,opacity:.75}));
  const code=encodeTextStyle(style);assert.ok(code.length<=4000);assert.deepEqual(decodeTextStyle(code),validateTextStyle(style));
  for(const kind of ['text1','text2','text3','text4','text5'])for(const square of [true,false]) {
    const preset=presetTextStyle(kind);preset.builtin.square=square;
    assert.deepEqual(decodeTextStyle(encodeTextStyle(preset)),validateTextStyle(preset));
  }
});

test('未知の項目・重複・危険な入力・レイヤー過多は取り込まない',()=>{
  for(const code of ['tc2;fill=#ffffff','tc1;font=mochiy;font=serif','tc1;__proto__=bad','tc1;opacity=Infinity','tc1;rotate=NaN','tc1;fill=url(https://example.com)','tc1;size=100000x500','tc1;preset=text4;fill=#ffffff','tc1;italic=yes','tc1;layers=shadow:#000000:1','tc1;layers='+Array.from({length:25},()=> 'outline:#ffffff:1').join('|'),'tc1;'+ 'x'.repeat(4000)])assert.throws(()=>decodeTextStyle(code),code);
});
