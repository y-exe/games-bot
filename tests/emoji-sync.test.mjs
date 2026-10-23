import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {emojiAssetName,loadEmojiAssets,syncEmojiAssets,resetEmojiAssets} from '../src/ui/emoji-sync.ts';
import {manifest,badgeManifest} from '../src/ui/emojis.ts';

function fakeApi(initial=[]){
  const items=[...initial],images=new Map(),calls={created:0,removed:[],renamed:[]};
  return {items,calls,
    applicationId:async()=>'test-app',list:async()=>[...items],
    create:async(name,image)=>{calls.created++;const emoji={id:String(1000+calls.created),name,animated:false};items.push(emoji);images.set(emoji.id,image);return emoji;},
    rename:async(emoji,name)=>{calls.renamed.push(emoji.id);Object.assign(items.find(item=>item.id===emoji.id),{name});return {...emoji,name};},
    download:async emoji=>images.get(emoji.id)??images.get(items.find(item=>item.name===emoji.name&&images.has(item.id))?.id),
    remove:async emoji=>{calls.removed.push(emoji.id);items.splice(items.findIndex(item=>item.id===emoji.id),1);},
  };
}
const temporary=async work=>{const dir=await mkdtemp(join(tmpdir(),'emoji-sync-'));try{await work(dir);}finally{await rm(dir,{recursive:true,force:true});}};

test('全絵文字が128pxで、SVGまたは公式形式の原本を持ち、偽のSVGを使わない',async()=>{
  const assets=await loadEmojiAssets();assert.equal(assets.length,119);assert.equal(badgeManifest.length,84);
  for(const asset of assets){
    const metadata=await sharp(asset.image).metadata();
    assert.equal(metadata.width,128,asset.name);assert.equal(metadata.height,128,asset.name);assert.equal(metadata.format,'png');
    assert.ok(asset.image.length<=256*1024);assert.ok(emojiAssetName(asset).length<=32);
    const entry=manifest.find(entry=>entry.name===asset.name),path=entry.sourceFile??`svg/${asset.name}.svg`;
    const source=await readFile(`assets/emojis/${path}`);
    if(path.endsWith('.svg')){assert.match(source.toString(),/<svg[\s>]/);assert.doesNotMatch(source.toString(),/<image[\s>]|data:image|<script[\s>]/i);}
    else assert.equal((await sharp(source).metadata()).format,'png');
    if(/^o_[A-N]$|^\d_o$/.test(asset.name))assert.match(source.toString(),/viewBox="0 0 36 36"/);
  }
});

test('ステータスSVGが元PNGの輪郭・色・背景透過を保つ',async()=>{
  for(const name of ['success','pending','warning','info','danger']){
    const entry=manifest.find(e=>e.name===`status_${name}`);
    assert.equal(entry.sourceFile,`svg/status/status_${name}.svg`);
    const image=await readFile(`assets/emojis/${entry.outputFile}`);
    const {data,info}=await sharp(image).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const alpha=(x,y)=>data[(y*info.width+x)*info.channels+3];
    assert.equal(alpha(0,0),0);assert.ok(Math.abs(alpha(64,8)-36)<=1,name);
    assert.ok(data.some((v,i)=>i%4===3&&v===255),name);
    for(const background of ['#232428','#ffffff']){
      const original=await sharp(`assets/emojis/originals/status/status_${name}.png`).resize(128,128).flatten({background}).raw().toBuffer();
      const actual=await sharp(image).flatten({background}).raw().toBuffer();
      let squared=0;for(let i=0;i<original.length;i++)squared+=(original[i]-actual[i])**2;
      assert.ok(Math.sqrt(squared/original.length)<12,`${name}: ${background}`);
    }
  }
});

test('初回登録し、再起動・対応表消失・別Botの対応表からも既存IDを再利用する',async()=>temporary(async dir=>{
  const assets=(await loadEmojiAssets()).slice(0,2),api=fakeApi([{id:'9',name:'chess4_empty_0'},{id:'8',name:'old_staff'}]);
  const first=await syncEmojiAssets(api,'test-app',dir,assets);assert.equal(first.created,2);
  assert.equal((await syncEmojiAssets(api,'test-app',dir,assets)).created,0);
  await writeFile(join(dir,'emojis.json'),JSON.stringify({o_A:'<:private:123>',staff:'<:old_staff:8>',chess4_empty_0:'<:chess4_empty_0:9>'}));
  const next=await syncEmojiAssets(api,'test-app',dir,assets);
  assert.equal(next.created,0);assert.deepEqual(next.mappings, {...first.mappings,chess4_empty_0:'<:chess4_empty_0:9>'});
  await rm(join(dir,'emojis.json'));assert.equal((await syncEmojiAssets(api,'test-app',dir,assets)).created,0);
  assert.equal(api.calls.created,2);assert.deepEqual(api.calls.removed,[]);
}));

test('途中の登録失敗で古い対応表を壊さず、再実行ではアップロード済み分を回収する',async()=>temporary(async dir=>{
  const assets=(await loadEmojiAssets()).slice(0,2),api=fakeApi(),create=api.create;
  await writeFile(join(dir,'emojis.json'),'{}');let attempts=0;
  api.create=async(name,image)=>{if(++attempts===2)throw new Error('API failure');return create(name,image);};
  await assert.rejects(syncEmojiAssets(api,'test-app',dir,assets),/API failure/);
  assert.equal(await readFile(join(dir,'emojis.json'),'utf8'),'{}');
  api.create=create;const result=await syncEmojiAssets(api,'test-app',dir,assets);
  assert.equal(result.created,1);assert.equal(result.reused,1);assert.equal(api.items.length,2);
}));

test('素材更新分だけ作り直し、同名重複があっても既存IDを選び、容量不足や別アプリを拒否する',async()=>temporary(async dir=>{
  const [asset]=await loadEmojiAssets(),api=fakeApi();
  await syncEmojiAssets(api,'test-app',dir,[asset]);
  api.items.push({...api.items[0],id:'9000'});
  assert.equal((await syncEmojiAssets(api,'test-app',dir,[asset])).created,0);
  const changed={...asset,image:await sharp(asset.image).negate().png().toBuffer()};
  assert.equal((await syncEmojiAssets(api,'test-app',dir,[changed])).created,1);
  const wrong=fakeApi();await assert.rejects(syncEmojiAssets(wrong,'another-app',dir,[asset]),/一致/);assert.equal(wrong.calls.created,0);
  const full=fakeApi(Array.from({length:2000},(_,i)=>({id:String(i),name:'other'})));
  await assert.rejects(syncEmojiAssets(full,'test-app',dir,[asset]),/空き容量/);assert.equal(full.calls.created,0);
}));

test('全削除の途中失敗と再登録失敗を再実行で回復し、完了後は削除し直さない',async()=>temporary(async dir=>{
  const assets=(await loadEmojiAssets()).slice(0,2),api=fakeApi([{id:'1',name:'old_one'},{id:'2',name:'old_two'}]);
  const remove=api.remove;let removals=0;
  api.remove=async emoji=>{if(++removals===2)throw new Error('delete failure');return remove(emoji);};
  await assert.rejects(resetEmojiAssets(api,'test-app',dir,assets,'reset-1'),/delete failure/);
  api.remove=remove;const create=api.create;let attempts=0;
  api.create=async(name,image)=>{if(++attempts===2)throw new Error('upload failure');return create(name,image);};
  await assert.rejects(resetEmojiAssets(api,'test-app',dir,assets,'reset-1'),/upload failure/);
  api.create=create;await resetEmojiAssets(api,'test-app',dir,assets,'reset-1');
  assert.equal(api.items.length,2);assert.deepEqual(api.calls.removed,['1','2']);
  await resetEmojiAssets(api,'test-app',dir,assets,'reset-1');
  assert.deepEqual(api.calls.removed,['1','2']);
  assert.deepEqual(JSON.parse(await readFile(join(dir,'emoji-reset.json'),'utf8')).targets,[]);
}));

test('素材不備・対象アプリ不一致では全削除を開始しない',async()=>temporary(async dir=>{
  const api=fakeApi([{id:'1',name:'old'}]),assets=await loadEmojiAssets();
  await assert.rejects(resetEmojiAssets(api,'wrong-app',dir,assets,'reset-1'),/一致/);
  await assert.rejects(resetEmojiAssets(api,'test-app',dir,[],'reset-1'),/素材/);
  await assert.rejects(resetEmojiAssets(api,'test-app',dir,[{name:'bad',image:Buffer.from('invalid')}],'reset-1'));
  assert.deepEqual(api.calls.removed,[]);
}));

test('旧ハッシュ付き名はIDを保って短くし、画像の更新判定を管理ファイルへ移す',async()=>temporary(async dir=>{
  const [asset]=await loadEmojiAssets();const hash=createHash('sha256').update(asset.image).digest('hex');
  const api=fakeApi([{id:'7',name:`${asset.name}_gb2_${hash.slice(0,8)}`}]);
  const result=await syncEmojiAssets(api,'test-app',dir,[asset]);
  assert.equal(result.created,0);assert.equal(api.items[0].name,asset.name);assert.equal(api.items[0].id,'7');
  assert.deepEqual(api.calls.renamed,['7']);assert.equal(result.mappings[asset.name],`<:${asset.name}:7>`);
  const state=JSON.parse(await readFile(join(dir,'emoji-sync.json'),'utf8'));
  assert.deepEqual(state.assets,[{name:asset.name,id:'7',sha256:hash}]);
  assert.equal((await syncEmojiAssets(api,'test-app',dir,[asset])).created,0);
  assert.deepEqual(api.calls.renamed,['7']);
}));

test('管理ファイルまで失っても画像を照合し、異なる画像は現在の素材として再利用しない',async()=>temporary(async dir=>{
  const [asset]=await loadEmojiAssets(),api=fakeApi();
  await syncEmojiAssets(api,'test-app',dir,[asset]);
  await rm(join(dir,'emoji-sync.json'));await rm(join(dir,'emojis.json'));
  assert.equal((await syncEmojiAssets(api,'test-app',dir,[asset])).created,0);
  await rm(join(dir,'emoji-sync.json'));
  const changed={...asset,image:await sharp(asset.image).negate().png().toBuffer()};
  assert.equal((await syncEmojiAssets(api,'test-app',dir,[changed])).created,1);
}));
