import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {emojiAssetName,loadEmojiAssets,loadAllEmojiAssets,syncBotEmojis,syncEmojiAssets,resetEmojiAssets} from '../src/ui/emoji-sync.ts';
import {manifest,badgeManifest} from '../src/ui/emojis.ts';

function fakeApi(initial=[]){
  const items=[...initial],images=new Map(),calls={created:0,removed:[],renamed:[]};
  return {items,calls,
    applicationId:async()=>'test-app',list:async()=>[...items],
    create:async(name,image)=>{if(items.some(item=>item.name===name))throw new Error('Duplicate application emoji name');calls.created++;const emoji={id:String(1000+calls.created),name,animated:false};items.push(emoji);images.set(emoji.id,image);return emoji;},
    rename:async(emoji,name)=>{if(items.some(item=>item.name===name&&item.id!==emoji.id))throw new Error('Duplicate application emoji name');calls.renamed.push(emoji.id);Object.assign(items.find(item=>item.id===emoji.id),{name});return {...emoji,name};},
    download:async emoji=>images.get(emoji.id)??images.get(items.find(item=>item.name===emoji.name&&images.has(item.id))?.id),
    remove:async emoji=>{calls.removed.push(emoji.id);items.splice(items.findIndex(item=>item.id===emoji.id),1);},
  };
}
const temporary=async work=>{const dir=await mkdtemp(join(tmpdir(),'emoji-sync-'));try{await work(dir);}finally{await rm(dir,{recursive:true,force:true});}};

function startupRest(api) {
  return {
    get:async route=>{
      if(route==='/oauth2/applications/@me')return {id:await api.applicationId()};
      if(route==='/applications/test-app/emojis')return {items:await api.list()};
      throw new Error(`Unexpected GET: ${route}`);
    },
    post:async(route,{body})=>{
      assert.equal(route,'/applications/test-app/emojis');
      return api.create(body.name,Buffer.from(body.image.split(',')[1],'base64'));
    },
    patch:async(route,{body})=>api.rename(api.items.find(e=>route.endsWith(`/${e.id}`)),body.name),
    delete:async route=>api.remove(api.items.find(e=>route.endsWith(`/${e.id}`))),
  };
}

test('空のBotの初回起動で全315種類を登録し、対応表保存後の再起動ではすべて再利用する',async()=>temporary(async dir=>{
  const assets=await loadAllEmojiAssets(),api=fakeApi(),rest=startupRest(api);
  assert.equal(assets.length,315);assert.equal(new Set(assets.map(a=>a.name)).size,315);
  const first=await syncBotEmojis(rest,'test-app',dir);
  assert.equal(first.created,315);
  assert.deepEqual(Object.keys(first.mappings).sort(),assets.map(a=>a.name).sort());
  const saved=JSON.parse(await readFile(join(dir,'emojis.json'),'utf8'));
  assert.deepEqual(saved,first.mappings);
  const ids=api.items.map(e=>e.id);
  const next=await syncBotEmojis(rest,'test-app',dir);
  assert.equal(next.created,0);assert.equal(next.reused,315);
  assert.deepEqual(api.items.map(e=>e.id),ids);assert.deepEqual(api.calls.removed,[]);
}));

test('素材追加後の最初の起動で青・赤・緑・チェス・マインスイーパーの不足分だけ登録する',async()=>temporary(async dir=>{
  const assets=await loadAllEmojiAssets(),api=fakeApi();
  const added=new Set(['b_Z','g_Z','r_Z','board_spacer','c_bk_1_c','ms_w_d']);
  const before=await syncEmojiAssets(api,'test-app',dir,assets.filter(a=>!added.has(a.name)));
  const first=await syncBotEmojis(startupRest(api),'test-app',dir);
  assert.equal(first.created,added.size);assert.equal(first.reused,assets.length-added.size);
  for(const [name,value]of Object.entries(before.mappings))assert.equal(first.mappings[name],value);
  for(const name of added)assert.ok(first.mappings[name],name);
  assert.equal((await syncBotEmojis(startupRest(api),'test-app',dir)).created,0);
  assert.equal(new Set(api.items.map(e=>e.name)).size,315);assert.deepEqual(api.calls.removed,[]);
}));

test('全絵文字が128pxで、SVGまたは公式形式の原本を持ち、偽のSVGを使わない',async()=>{
  const assets=await loadEmojiAssets();assert.equal(assets.length,131);assert.equal(badgeManifest.length,84);
  for(const asset of assets){
    const metadata=await sharp(asset.image).metadata();
    assert.equal(metadata.width,128,asset.name);assert.equal(metadata.height,128,asset.name);assert.equal(metadata.format,'png');
    assert.ok(asset.image.length<=256*1024);assert.ok(emojiAssetName(asset).length<=32);
    const entry=manifest.find(entry=>entry.name===asset.name),path=entry.sourceFile??`svg/${asset.name}.svg`;
    const source=await readFile(`assets/emojis/${path}`);
    if(path.endsWith('.svg')){assert.match(source.toString(),/<svg[\s>]/);assert.doesNotMatch(source.toString(),/<image[\s>]|data:image|<script[\s>]/i);}
    else assert.equal((await sharp(source).metadata()).format,'png');
    if(/^b_[A-Z0-9]$/.test(asset.name))assert.match(source.toString(),/viewBox="0 0 36 36"/);
  }
});

test('青い数字・英字をIDと画像を保ってb_へ改名し、途中失敗からも対応表を移行する',async()=>temporary(async dir=>{
  const assets=(await loadEmojiAssets()).filter(a=>['b_A','b_3'].includes(a.name));
  const api=fakeApi([{id:'31',name:'o_A'},{id:'32',name:'3_o'}]);
  await writeFile(join(dir,'emoji-sync.json'),JSON.stringify({applicationId:'test-app',assets:assets.map(a=>({name:a.name==='b_A'?'o_A':'3_o',id:a.name==='b_A'?'31':'32',sha256:createHash('sha256').update(a.image).digest('hex')}))}));
  await writeFile(join(dir,'emojis.json'),JSON.stringify({o_A:'<:o_A:31>','3_o':'<:3_o:32>'}));
  const rename=api.rename;let fail=true;
  api.rename=async(entry,name)=>{if(name==='b_3'&&fail){fail=false;throw new Error('Rename interrupted');}return rename(entry,name);};
  await assert.rejects(syncEmojiAssets(api,'test-app',dir,assets),/Rename interrupted/);
  const result=await syncEmojiAssets(api,'test-app',dir,assets);
  assert.equal(result.created,0);assert.deepEqual(result.mappings,{b_A:'<:b_A:31>',b_3:'<:b_3:32>'});
  assert.deepEqual(api.items.map(e=>e.id),['31','32']);assert.equal(api.calls.created,0);assert.deepEqual(api.calls.removed,[]);
  assert.equal((await syncEmojiAssets(api,'test-app',dir,assets)).created,0);
  assert.deepEqual(JSON.parse(await readFile(join(dir,'emojis.json'),'utf8')),result.mappings);
}));

test('盤面絵文字が従来の透明な外周余白を保つ',async()=>{
  for(const name of ['o0','o1','o2','4_0','4_1','4_2']){
    const entry=manifest.find(e=>e.name===name);
    const {data,info}=await sharp(`assets/emojis/${entry.outputFile}`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const alpha=(x,y)=>data[(y*128+x)*info.channels+3];
    for(let p=0;p<128;p++){
      assert.equal(alpha(0,p),0,name);assert.equal(alpha(127,p),0,name);
      assert.equal(alpha(p,0),0,name);assert.equal(alpha(p,127),0,name);
    }
    const inset=name.startsWith('o')?3:2;
    for(let p=0;p<inset;p++)assert.equal(alpha(p,64),0,name);
    assert.ok(alpha(inset,64)>0,name);assert.equal(alpha(4,64),255,name);
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

test('画像更新を一時名で登録してから切り替え、各段階の失敗後も同名重複や再アップロードを起こさない',async()=>temporary(async dir=>{
  const [asset]=await loadEmojiAssets(),api=fakeApi();
  const first=await syncEmojiAssets(api,'test-app',dir,[asset]);const oldId=api.items[0].id;
  const changed={...asset,image:await sharp(asset.image).negate().png().toBuffer()};
  const create=api.create,remove=api.remove,rename=api.rename;
  api.create=async()=>{throw new Error('upload failure');};
  await assert.rejects(syncEmojiAssets(api,'test-app',dir,[changed]),/upload failure/);
  assert.equal(api.items[0].id,oldId);assert.deepEqual(api.calls.removed,[]);
  api.create=create;api.remove=async()=>{throw new Error('delete failure');};
  await assert.rejects(syncEmojiAssets(api,'test-app',dir,[changed]),/delete failure/);
  assert.equal(api.items.length,2);assert.equal(api.calls.created,2);
  assert.deepEqual(JSON.parse(await readFile(join(dir,'emojis.json'),'utf8')),first.mappings);
  api.remove=remove;api.rename=async()=>{throw new Error('rename failure');};
  await assert.rejects(syncEmojiAssets(api,'test-app',dir,[changed]),/rename failure/);
  assert.equal(api.items.length,1);assert.match(api.items[0].name,/_tmp_/);assert.equal(api.calls.created,2);
  api.rename=rename;const result=await syncEmojiAssets(api,'test-app',dir,[changed]);
  assert.equal(result.created,0);assert.equal(api.items.length,1);assert.equal(api.items[0].name,asset.name);
  assert.notEqual(api.items[0].id,oldId);assert.deepEqual(api.calls.removed,[oldId]);
  assert.equal((await syncEmojiAssets(api,'test-app',dir,[changed])).created,0);
}));
