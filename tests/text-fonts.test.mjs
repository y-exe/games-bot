import assert from 'node:assert/strict';
import {test} from 'node:test';
import {existsSync} from 'node:fs';
import sharp from 'sharp';
import {textFontCatalog} from '../src/data/text-fonts.ts';
import {defaultTextStyle,initialTextStyle,validateTextStyle} from '../src/data/text-style.ts';
import {textFontFile,ensureTextFont} from '../src/services/text-fonts.ts';
import {generateCustomTextImage} from '../src/services/custom-text-image.ts';
import {encodeTextStyle,decodeTextStyle} from '../src/data/text-style-code.ts';
import {TextStudio} from '../src/commands/text-studio.ts';

test('重複する明朝を除いた16書体を選べ、各書体で画像と復元コードを生成できる',async()=>{
  assert.equal(Object.keys(textFontCatalog).length,16);
  assert.equal(Object.values(textFontCatalog).filter(font=>font.file.startsWith('megamoji/')).length,13);
  assert.equal(textFontCatalog.mochiy.label,'もっちーぽっぷ');assert.equal(textFontCatalog.serif.label,'明朝体(NotoSerifJP)');
  assert.equal(decodeTextStyle('tc1;font=mincho').font,'serif');
  for(const [key,font]of Object.entries(textFontCatalog)) {
    const style=defaultTextStyle();style.font=key;
    assert.deepEqual(decodeTextStyle(encodeTextStyle(style)),validateTextStyle(style));
    if('external' in font&&!existsSync(textFontFile(key)))continue;
    assert.equal(ensureTextFont(key),font.family);
    const bytes=await generateCustomTextImage('サンプル',style);
    const meta=await sharp(bytes).metadata();assert.equal(meta.width,500);assert.equal(meta.height,500);
    const raw=await sharp(bytes).raw().toBuffer();assert.ok(raw.some((value,index)=>index%4===3&&value>128),key);
  }
});

test('字間は固定範囲なしで受け付け、マイナス値や従来範囲外でも描画・復元できる',async()=>{
  for(const spacing of [-1000,-200,-21,61,200,1000]) {
    const style=defaultTextStyle();style.spacing=spacing;
    assert.equal(validateTextStyle(style).spacing,spacing);assert.equal(decodeTextStyle(encodeTextStyle(style)).spacing,spacing);
    assert.equal((await sharp(await generateCustomTextImage('サンプル',style)).metadata()).width,500);
  }
  for(const spacing of [NaN,Infinity,-Infinity])assert.throws(()=>validateTextStyle({...defaultTextStyle(),spacing}),/有限の数値/);
  assert.equal(validateTextStyle({...defaultTextStyle(),spacing:1e30}).spacing,1e30);
  await assert.rejects(generateCustomTextImage('長い字間',{...defaultTextStyle(),spacing:Number.MAX_VALUE}),/位置を計算/);
});

test('カスタムの初期表示はゴシック極太・黄色・強制squareで、旧コードの省略時設定は保持する',async()=>{
  const expected=initialTextStyle();assert.equal(expected.font,'gothicblack');assert.equal(expected.fill.colors[0],'#ffff00');assert.equal(expected.fit,'stretch');assert.equal(expected.layers.length,0);
  let job;
  const studio=new TextStudio({}, {run:async value=>{job=value;return Buffer.from('image');}});
  await studio.open({args:[],componentSource:{},user:{id:'1'},channelId:'channel',send:async()=>{}},true);
  assert.equal(job.text,'サンプル');assert.deepEqual(job.style,expected);
  assert.equal(decodeTextStyle('tc1').font,'mochiy');assert.equal(decodeTextStyle('tc1').fit,'contain');
  assert.equal(decodeTextStyle('tc1').fill.colors[0],'#e674dc');
});
