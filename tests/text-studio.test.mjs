import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {Store} from '../src/data/store.ts';
import {TextTemplates,textStyleId} from '../src/data/text-templates.ts';
import {defaultTextStyle,presetTextStyle,validateTextStyle,toCustomTextStyle} from '../src/data/text-style.ts';
import {encodeTextStyle,decodeTextStyle} from '../src/data/text-style-code.ts';
import {TextStudio} from '../src/commands/text-studio.ts';
import {textStudioCard} from '../src/ui/text-studio.ts';
import {generateCustomTextImage} from '../src/services/custom-text-image.ts';
import {generateTextImage} from '../src/services/text-image.ts';
import {MediaWorker} from '../src/services/media.ts';
import {parseLegacy} from '../src/commands/legacy.ts';
import {MessageFlags,ButtonStyle} from 'discord.js';
import {textResultPayload,textResultStyles} from '../src/ui/text-result.ts';
import {setEmojiMappings,loadEmojis} from '../src/ui/emojis.ts';

test('textは選択画面、text1は旧黄色文字、textcは編集用として引数を保つ',()=>{
  assert.deepEqual(parseLegacy('text'),{name:'text',args:[]});
  assert.deepEqual(parseLegacy('text1 あ い square'),{name:'text1',args:['あ い square']});
  assert.deepEqual(parseLegacy('textc おはよう ございます'),{name:'textc',args:['おはよう ございます']});
  assert.deepEqual(parseLegacy('テキスト1 あ'),{name:'text1',args:['あ']});
});

test('スタイルIDは設定から決まり、キー順・色コードの大文字小文字・アカウントや名前に依存しない',async()=>{
  const style=defaultTextStyle(),reordered=Object.fromEntries(Object.entries(style).reverse());
  reordered.fill={angle:90,colors:['#E674DC'],kind:'solid'};
  assert.equal(textStyleId(style),textStyleId(reordered));
  assert.notEqual(textStyleId(style),textStyleId({...style,spacing:1}));
  const dir=await mkdtemp(join(tmpdir(),'text-style-identity-')),store=new Store('',dir);
  try {
    await store.initialize();const templates=new TextTemplates(store);
    const [a,b]=await Promise.all([templates.save('1','自分だけの名前',style),templates.save('2','別の名前',reordered)]);
    assert.equal(a.id,b.id);assert.equal(a.id,textStyleId(style));
    assert.equal((await templates.get('1',a.id)).name,'自分だけの名前');assert.equal((await templates.get('2',a.id)).name,'別の名前');
    await assert.rejects(templates.import('3',a.id),/共有されている/);
    await templates.save('1','改名',style);assert.equal((await templates.list('1')).length,1);
    assert.equal((await templates.get('2',a.id)).name,'別の名前');
    await templates.share('2',a.id);assert.equal((await templates.import('3',a.id)).name,'別の名前');
    assert.equal((await store.transaction(c=>c.query('SELECT id FROM games_bot_text_templates'))).length,1);
  }finally{await store.close();await rm(dir,{recursive:true,force:true});}
});

test('旧ランダムIDを共通スタイルへ移行し、旧ID・各人の名前・共有状態を保持する',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'text-style-migration-'));let store=new Store('',dir);
  const ids=['ec927e08-66c1-4778-b57f-8c7274367768','12345678-1234-1234-1234-123456789abc'],style=defaultTextStyle();
  try {
    await store.initialize();
    await store.transaction(async c=>{
      await c.query("DELETE FROM games_bot_events WHERE event_id='text-style-ids:v2'");
      for(const [index,id]of ids.entries()) {
        await c.query('INSERT INTO games_bot_text_templates(id,owner_id,name,style,fingerprint,shared,created_at) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7)',[id,String(index+1),index?'公開した名前':'非公開の名前',JSON.stringify(style),`legacy-${index}`,Boolean(index),new Date().toISOString()]);
        await c.query('INSERT INTO games_bot_text_library(user_id,template_id,added_at) VALUES($1,$2,$3)',[String(index+1),id,new Date().toISOString()]);
      }
    });
    await store.close();store=new Store('',dir);await store.initialize();const templates=new TextTemplates(store);
    const a=await templates.get('1',ids[0]),b=await templates.get('2',ids[1]);
    assert.equal(a.id,textStyleId(style));assert.equal(a.id,b.id);assert.equal(a.name,'非公開の名前');assert.equal(b.name,'公開した名前');
    const imported=await templates.import('3',ids[0]);assert.equal(imported.id,a.id);assert.equal(imported.name,'公開した名前');
    assert.equal((await store.transaction(c=>c.query('SELECT id FROM games_bot_text_templates'))).length,1);
    await templates.migrate();assert.equal((await templates.list('1')).length,1);
    await store.close();store=new Store('',dir);await store.initialize();assert.equal((await new TextTemplates(store).get('1',ids[0])).id,a.id);
  }finally{await store.close();await rm(dir,{recursive:true,force:true});}
});

test('保存は重複せず、共有前の他人のアクセスを拒否し、共有後はIDの参照を再起動後も保持する',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'text-templates-'));let store=new Store('',dir);
  try {
    await store.initialize();let templates=new TextTemplates(store);
    const style=defaultTextStyle();
    const [first,second]=await Promise.all([templates.save('1','テスト',style),templates.save('1','テスト',style)]);
    assert.equal(first.id,second.id);assert.equal((await templates.list('1')).length,1);
    await assert.rejects(templates.get('2',first.id),/見つかりません/);
    await assert.rejects(templates.import('2',first.id),/共有されている/);
    await assert.rejects(templates.share('2',first.id),/保存一覧/);
    await templates.share('1',first.id);
    await templates.import('2',first.id);await templates.import('2',first.id);
    assert.equal((await templates.list('2')).length,1);
    const original=await templates.get('2',first.id);original.style.fill.colors=['#000000'];
    const copy=await templates.save('2','編集したデザイン',original.style);
    assert.notEqual(copy.id,first.id);assert.deepEqual((await templates.get('1',first.id)).style.fill.colors,['#e674dc']);
    await templates.remove('2',first.id);assert.equal((await templates.list('2')).length,1);
    await store.close();store=new Store('',dir);await store.initialize();templates=new TextTemplates(store);
    assert.equal((await templates.get('2',copy.id)).style.fill.colors[0],'#000000');
    await templates.import('2',first.id);assert.equal((await templates.list('2')).length,2);
    await templates.remove('1',first.id);assert.ok((await templates.get('2',first.id)).shared);
    const rows=await store.transaction(c=>c.query('SELECT style::text FROM games_bot_text_templates'));
    assert.ok(rows.every(r=>!r.style.includes('画像にする文字')));
  }finally{await store.close();await rm(dir,{recursive:true,force:true});}
});

test('複数の縁取り・影、斜体・回転・グラデーションを描画し、範囲外の設定は拒否する',async()=>{
  const style=defaultTextStyle();style.italic=true;style.rotation=-5;style.fill={kind:'gradient',colors:['#ff0000','#00ff00','#0000ff'],angle:90};
  style.layers=[{kind:'outline',color:'#ffffff',width:4,opacity:1},{kind:'outline',color:'#000000',width:5,opacity:1},{kind:'shadow',color:'#3300ff',x:12,y:12,blur:2,spread:1,opacity:.8},{kind:'shadow',color:'#ff0000',x:-8,y:6,blur:0,spread:0,opacity:1}];
  const bytes=await generateCustomTextImage('永,AW',style),metadata=await sharp(bytes).metadata();
  assert.equal(metadata.width,500);assert.equal(metadata.height,500);assert.ok(metadata.hasAlpha);
  const raw=await sharp(bytes).raw().toBuffer();assert.ok(raw.some((v,i)=>i%4===3&&v===255));assert.equal(raw[3],0);
  assert.throws(()=>validateTextStyle({...style,layers:Array.from({length:25},()=>style.layers[0])}),/24層/);
  assert.throws(()=>validateTextStyle({...style,width:10000}),/画像の幅/);
  assert.throws(()=>validateTextStyle({...style,fill:{kind:'solid',colors:['url(secret)'],angle:0}}),/カラーコード/);
  const impossible={...style,padding:100,layers:[{kind:'outline',width:120,color:'#000000',opacity:1}]};
  await assert.rejects(generateCustomTextImage('文字',impossible));
});

test('文字を変形してから縁取り・影を加え、効果の追加で文字の縦横比を変えない',async()=>{
  const fillBounds=async bytes=>{
    const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let left=info.width,right=-1,top=info.height,bottom=-1;
    for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++) {
      const i=(y*info.width+x)*4;
      if(data[i]===255&&data[i+1]===0&&data[i+2]===255&&data[i+3]>=250){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    }
    assert.ok(right>=left&&bottom>=top);return {width:right-left+1,height:bottom-top+1};
  };
  for(const width of [500,800]) {
    const style=defaultTextStyle();Object.assign(style,{width,height:500,fit:'stretch',layers:[],fill:{kind:'solid',colors:['#ff00ff'],angle:90}});
    const base=await fillBounds(await generateCustomTextImage('田',style));
    style.layers=[{kind:'outline',color:'#ffffff',width:8,opacity:1}];
    const thin=await fillBounds(await generateCustomTextImage('田',style));
    assert.ok(Math.abs(thin.width-base.width)<=2);assert.ok(Math.abs(thin.height-base.height)<=2);
    style.layers=[{kind:'outline',color:'#ffffff',width:60,opacity:1},{kind:'shadow',color:'#000000',x:80,y:0,blur:2,spread:0,opacity:1}];
    const thick=await fillBounds(await generateCustomTextImage('田',style));
    assert.ok(Math.abs(thick.width/thick.height-base.width/base.height)<.02);
  }
  const square=toCustomTextStyle(presetTextStyle('text2'));
  assert.deepEqual(square.layers.map(layer=>layer.width),[15,12]);assert.equal(square.spacing,-17*200/110);
});

test('text4の塗りは指定のピンクで、標準デザインをテンプレート経由で使っても描画が変わらない',async()=>{
  const data=await sharp(await generateTextImage('text4','永',true)).raw().toBuffer();
  let pink=0;for(let i=0;i<data.length;i+=4)if(data[i]===230&&data[i+1]===116&&data[i+2]===220&&data[i+3]===255)pink++;
  assert.ok(pink>1000);
  assert.deepEqual(await generateCustomTextImage('テスト',presetTextStyle('text1')),await generateTextImage('text1','テスト',true));
});

test('編集は本人のみ・受付後に描画し、フォーム更新と保存共有は文字をDBに渡さない',async()=>{
  const calls=[],worker={run:async job=>{calls.push(['render',job]);return Buffer.from('image');}};
  const templates={save:async(user,name,style)=>{calls.push(['save',user,name,style]);return {id:'12345678-1234-1234-1234-123456789abc',name};},share:async()=>{calls.push(['share']);}};
  const studio=new TextStudio(templates,worker);let sent;
  await studio.open({args:['秘密の文字'],user:{id:'1'},channelId:'channel',send:async p=>{sent=p;}},false);
  const key=[...studio.drafts.keys()][0];
  const i={customId:`txt:${key}:custom`,user:{id:'2'},channelId:'channel',isButton:()=>true,isModalSubmit:()=>false,isStringSelectMenu:()=>false,
    message:{flags:{has:()=>true}},deferUpdate:async()=>{calls.push(['ack']);},editReply:async p=>{sent=p;return {id:'fake',channelId:'channel',components:[],flags:{has:()=>false}};},followUp:async p=>{calls.push(['follow',p]);}};
  await assert.rejects(studio.handle(i),/本人/);assert.equal(calls.length,0);
  i.user.id='1';await studio.handle(i);assert.equal(calls[0][0],'ack');assert.equal(calls[1][0],'render');
  i.customId=`txt:${key}:addoutline`;i.showModal=async modal=>{sent=modal.toJSON();};await studio.handle(i);
  assert.equal(sent.custom_id,`txt:${key}:newoutline`);
  i.customId=sent.custom_id;i.isButton=()=>false;i.isModalSubmit=()=>true;i.fields={getTextInputValue:id=>({color:'#000000',width:'4',opacity:'100'})[id]};
  await studio.handle(i);assert.equal(studio.drafts.get(key).style.layers.length,1);
  i.customId=`txt:${key}:setformat`;i.fields.getTextInputValue=id=>({italic:'1',rotation:'5',skew:'0',spacing:'12',lineheight:'1.8'})[id];
  await studio.handle(i);assert.equal(studio.drafts.get(key).style.spacing,12);assert.equal(studio.drafts.get(key).style.lineHeight,1.8);
  i.customId=`txt:${key}:square`;i.isButton=()=>true;i.isModalSubmit=()=>false;
  studio.drafts.get(key).style.width=600;studio.drafts.get(key).style.height=300;
  await studio.handle(i);assert.equal(studio.drafts.get(key).style.width,600);assert.equal(studio.drafts.get(key).style.height,600);assert.equal(studio.drafts.get(key).style.fit,'stretch');
  await studio.handle(i);assert.equal(studio.drafts.get(key).style.fit,'contain');
  i.isButton=()=>false;i.isModalSubmit=()=>true;
  i.customId=`txt:${key}:setshare`;i.fields.getTextInputValue=()=> '共有するデザイン';await studio.handle(i);
  const saved=calls.find(entry=>entry[0]==='save');assert.equal(saved[1],'1');assert.equal(saved[2],'共有するデザイン');assert.ok(!JSON.stringify(saved[3]).includes('秘密の文字'));
  assert.ok(calls.some(entry=>entry[0]==='share'));
});

test('text2の縁取り削除や書式変更でカスタム化してもsquareを維持し、明示的に外した場合は戻さない',async()=>{
  for(const square of [true,false])for(const action of ['delete','duplicate','up','down','font','newoutline','newshadow','setpaint','setformat','setlayout','custom']) {
    let job,modal;
    const studio=new TextStudio({}, {run:async value=>{job=value;return Buffer.from('image');}});
    await studio.open({args:['テスト'],user:{id:'1'},channelId:'channel',send:async()=>{}},false);
    const key=[...studio.drafts.keys()][0];
    const i={customId:`txt:${key}:text2`,user:{id:'1'},channelId:'channel',message:{flags:{has:()=>true}},isButton:()=>true,isModalSubmit:()=>false,isStringSelectMenu:()=>false,
      deferUpdate:async()=>{},editReply:async()=>({id:'fake',channelId:'channel',components:[],flags:{has:()=>false}}),showModal:async value=>{modal=value.toJSON();}};
    await studio.handle(i);
    if(!square){i.customId=`txt:${key}:square`;await studio.handle(i);}
    const d=studio.drafts.get(key);if(action==='up')d.selected=1;
    if(action==='setlayout') {
      i.customId=`txt:${key}:layout`;await studio.handle(i);
      assert.equal(modal.components.map(row=>row.components[0]).find(field=>field.custom_id==='fit').value,square?'引伸':'維持');
    }
    i.customId=`txt:${key}:${action}`;
    i.isButton=()=>!action.startsWith('set')&&!action.startsWith('new')&&action!=='font';
    i.isModalSubmit=()=>action.startsWith('set')||action.startsWith('new');
    i.isStringSelectMenu=()=>action==='font';i.values=['serif'];
    const fields={color:'#123456',width:action==='setlayout'?'500':'4',height:'500',opacity:'100',x:'8',y:'8',effects:'2,0',kind:'単色',colors:'#123456',angle:'90',background:'',italic:'0',rotation:'0',skew:'0',spacing:'2',lineheight:'1.2',padding:'16',fit:square?'引伸':'維持',align:'中央'};
    i.fields={getTextInputValue:id=>fields[id]};
    await studio.handle(i);
    assert.equal(job.kind,'textc',action);assert.equal(job.style.fit,square?'stretch':'contain',action);assert.equal(job.style.builtin,undefined,action);
    assert.equal(decodeTextStyle(encodeTextStyle(job.style)).fit,square?'stretch':'contain',action);
  }
});

test('保存した標準テンプレートからのカスタム化でもsquareを引き継ぐ',async()=>{
  const style=presetTextStyle('text2');let job;
  const studio=new TextStudio({}, {run:async value=>{job=value;return Buffer.from('image');}});
  await studio.open({args:['テスト'],user:{id:'1'},channelId:'channel',send:async()=>{}},false);
  const key=[...studio.drafts.keys()][0],draft=studio.drafts.get(key);draft.screen='editor';draft.style=style;
  const i={customId:`txt:${key}:delete`,user:{id:'1'},channelId:'channel',message:{flags:{has:()=>true}},isButton:()=>true,isModalSubmit:()=>false,isStringSelectMenu:()=>false,
    deferUpdate:async()=>{},editReply:async()=>({id:'fake',channelId:'channel',components:[],flags:{has:()=>false}})};
  await studio.handle(i);assert.equal(job.style.fit,'stretch');
});

test('textcのスタイルコード読み込みはDBのID検索を使わずに設定を復元する',async()=>{
  const style=defaultTextStyle();style.spacing=15;style.lineHeight=1.5;let rendered;
  const studio=new TextStudio({save:async(user,name,settings)=>({id:'12345678-1234-1234-1234-123456789abc',name,style:settings}),import:async()=>{throw new Error('ID検索を使わない');}},
    {run:async job=>{rendered=job.style;return Buffer.from('image');}});
  await studio.open({args:[encodeTextStyle(style)],componentSource:{},user:{id:'1'},channelId:'channel',send:async()=>{}},true);
  assert.deepEqual(rendered,validateTextStyle(style));
});

test('種類ボタンは短い名前と専用絵文字を使い、文字ボタンだけ青になる',()=>{
  const d={owner:'1',channelId:'channel',expires:Date.now()+10000,text:'テスト',style:defaultTextStyle(),screen:'hub',square:true,selected:0,page:0,busy:false};
  const controls=p=>JSON.parse(JSON.stringify(p)).components[0].components.flatMap(c=>c.components??[]);
  try {
    setEmojiMappings(Object.fromEntries([1,2,3,4,5].map(n=>[`text${n}`,`<:text${n}:12345678901234567${n}>`])));
    const buttons=controls(textStudioCard('key',d)).filter(b=>/^txt:key:text[1-5]$/.test(b.custom_id));
    assert.ok(!JSON.stringify(textStudioCard('key',d)).includes('文字 ·'));
    assert.deepEqual(buttons.map(b=>b.label),['text1','text2','text3','text4','text5']);assert.ok(buttons.every(b=>b.emoji?.id));
    d.screen='editor';const editor=controls(textStudioCard('key',d));
    assert.equal(editor.find(b=>b.custom_id==='txt:key:edittext').style,ButtonStyle.Primary);
    assert.equal(editor.find(b=>b.custom_id==='txt:key:paint').style,ButtonStyle.Secondary);
  }finally{loadEmojis();}
});

test('本人限定の編集画面からの生成結果は公開し、通常の文字コマンドと同じ表示形式にする',async()=>{
  const bytes=Buffer.from('image'),posted=[];
  const studio=new TextStudio({}, {run:async()=>bytes});
  await studio.open({args:['テスト'],componentSource:{},user:{id:'1'},channelId:'channel',send:async()=>{}},true);
  const key=[...studio.drafts.keys()][0];
  const i={customId:`txt:${key}:generate`,user:{id:'1'},channelId:'channel',message:{flags:{has:()=>true}},isButton:()=>true,isModalSubmit:()=>false,isStringSelectMenu:()=>false,
    deferUpdate:async()=>{},followUp:async p=>{posted.push(p);}};
  await studio.handle(i);
  assert.equal(posted[0].flags,MessageFlags.IsComponentsV2);assert.equal(posted[0].flags&MessageFlags.Ephemeral,0);
  assert.deepEqual(JSON.parse(JSON.stringify(posted[0])),JSON.parse(JSON.stringify(textResultPayload('textc','テスト',bytes))));
  studio.drafts.get(key).preset='text5';await studio.handle(i);
  assert.deepEqual(JSON.parse(JSON.stringify(posted[1])),JSON.parse(JSON.stringify(textResultPayload('text5','テスト',bytes))));
  assert.equal(textResultStyles.textc.title,'カスタムテキスト');
  for(const kind of ['text1','text2','text3','text4','text5'])assert.match(textResultStyles[kind].title,/^テキスト[1-5] \(.+\)$/);
});

test('文字コマンドでは開くボタンだけを公開し、公開カードからの編集は本人限定の別返信にする',async()=>{
  const calls=[],studio=new TextStudio({}, {run:async()=>{calls.push('render');return Buffer.from('image');}});
  let launch;
  await studio.open({args:['秘密の文字'],user:{id:'1'},channelId:'channel',send:async p=>{launch=p;}},true);
  assert.equal(calls.length,0);assert.equal(launch.files,undefined);assert.ok(!JSON.stringify(launch).includes('秘密の文字'));
  const key=[...studio.drafts.keys()][0];
  const i={customId:`txt:${key}:open`,user:{id:'1'},channelId:'channel',message:{flags:{has:()=>false}},isButton:()=>true,isModalSubmit:()=>false,isStringSelectMenu:()=>false,
    deferReply:async p=>{assert.equal(p.flags,MessageFlags.Ephemeral);calls.push('private');},
    deferUpdate:async()=>{throw new Error('公開画面を編集しない');},
    editReply:async()=>({id:'private',channelId:'channel',components:[],flags:{has:()=>true}}),
  };
  await studio.handle(i);assert.deepEqual(calls,['private','render']);assert.equal(studio.drafts.size,2);
});

test('24レイヤーの編集画面もDiscordの部品数・文字数制限を守り、Workerでカスタム画像を生成できる',async()=>{
  const d={owner:'1',channelId:'channel',expires:Date.now()+10000,text:'文字',style:defaultTextStyle(),screen:'editor',square:true,selected:0,page:0,busy:false,preview:Buffer.from('x')};
  d.style.layers=Array.from({length:24},()=>({kind:'outline',color:'#ffffff',width:1,opacity:1}));
  const payload=JSON.parse(JSON.stringify(textStudioCard('12345678-1234-1234-1234-123456789abc',d)));
  let count=0;const visit=c=>{count++;if(c.content)assert.ok(c.content.length<=4000);if(c.custom_id)assert.ok(c.custom_id.length<=100);if(c.options)assert.ok(c.options.length<=25);for(const child of c.components??[])visit(child);};
  payload.components.forEach(visit);assert.ok(count<=40);assert.equal(payload.flags,MessageFlags.IsComponentsV2);
  const worker=new MediaWorker();try{const bytes=await worker.run({kind:'textc',text:'永',style:defaultTextStyle()});assert.equal((await sharp(bytes).metadata()).format,'png');}finally{await worker.close();}
});
