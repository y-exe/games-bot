import {createHash} from 'node:crypto';
import type {Store} from './store.js';
import {validateTextStyle,presetTextStyle,type TextStyle} from './text-style.js';
import {UserError} from '../errors.js';

export const textTemplateSchema=`
CREATE TABLE IF NOT EXISTS games_bot_text_templates(id uuid PRIMARY KEY,owner_id numeric(20,0) NOT NULL,name varchar(60) NOT NULL,style jsonb NOT NULL,fingerprint text NOT NULL,shared boolean NOT NULL DEFAULT false,created_at text NOT NULL,UNIQUE(owner_id,fingerprint));
CREATE TABLE IF NOT EXISTS games_bot_text_library(user_id numeric(20,0) NOT NULL,template_id uuid NOT NULL REFERENCES games_bot_text_templates(id) ON DELETE CASCADE,added_at text NOT NULL,PRIMARY KEY(user_id,template_id));
ALTER TABLE games_bot_text_templates ADD COLUMN IF NOT EXISTS public_name varchar(60);
ALTER TABLE games_bot_text_library ADD COLUMN IF NOT EXISTS name varchar(60);
CREATE TABLE IF NOT EXISTS games_bot_text_template_aliases(id uuid PRIMARY KEY,template_id uuid NOT NULL REFERENCES games_bot_text_templates(id) ON DELETE CASCADE);
`;
export interface TextTemplate {id:string;owner_id:string;name:string;style:TextStyle;shared:boolean}
export function templateId(value:string) {
  if(!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value))throw new UserError('テンプレートIDの形式を確認してください。');
  return value.toLowerCase();
}
function identity(input:TextStyle) {
  let style=validateTextStyle(input);
  if(style.builtin)style=validateTextStyle({...presetTextStyle(style.builtin.kind),builtin:style.builtin});
  const fingerprint=createHash('sha256').update(`text-style-v1:${JSON.stringify(style)}`).digest('hex');
  const key=fingerprint.slice(0,32),id=`${key.slice(0,8)}-${key.slice(8,12)}-${key.slice(12,16)}-${key.slice(16,20)}-${key.slice(20)}`;
  return {style,fingerprint,id};
}
export const textStyleId=(style:TextStyle)=>identity(style).id;
const resolveId=`COALESCE((SELECT a.template_id FROM games_bot_text_template_aliases a WHERE a.id=$2::uuid),$2::uuid)`;
export class TextTemplates {
  constructor(private store:Pick<Store,'transaction'>){}
  async migrate() {
    await this.store.transaction(async c=>{
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended('games-bot-text-style-ids-v2',0))");
      if((await c.query("SELECT event_id FROM games_bot_events WHERE event_id='text-style-ids:v2'")).length)return;
      const records=await c.query('SELECT * FROM games_bot_text_templates ORDER BY created_at,id');
      await c.query('UPDATE games_bot_text_library l SET name=t.name FROM games_bot_text_templates t WHERE l.template_id=t.id AND l.name IS NULL');
      for(const old of records) {
        const {style,id,fingerprint}=identity(old.style as TextStyle);
        if(old.id===id){await c.query('UPDATE games_bot_text_templates SET fingerprint=$2 WHERE id=$1',[id,fingerprint]);continue;}
        await c.query(`INSERT INTO games_bot_text_templates(id,owner_id,name,style,fingerprint,shared,public_name,created_at) VALUES($1,$2,'文字デザイン',$3::jsonb,$4,$5,$6,$7)
          ON CONFLICT(id) DO UPDATE SET shared=games_bot_text_templates.shared OR EXCLUDED.shared,public_name=COALESCE(games_bot_text_templates.public_name,EXCLUDED.public_name)`,[id,old.owner_id,JSON.stringify(style),fingerprint,old.shared,old.shared?old.name:null,old.created_at]);
        await c.query(`INSERT INTO games_bot_text_library(user_id,template_id,added_at,name)
          SELECT user_id,$2,added_at,name FROM games_bot_text_library WHERE template_id=$1
          ON CONFLICT(user_id,template_id) DO UPDATE SET
            name=CASE WHEN EXCLUDED.added_at>=games_bot_text_library.added_at THEN EXCLUDED.name ELSE games_bot_text_library.name END,
            added_at=GREATEST(EXCLUDED.added_at,games_bot_text_library.added_at)`,[old.id,id]);
        await c.query('INSERT INTO games_bot_text_template_aliases(id,template_id) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET template_id=EXCLUDED.template_id',[old.id,id]);
        await c.query('DELETE FROM games_bot_text_templates WHERE id=$1',[old.id]);
      }
      await c.query('CREATE UNIQUE INDEX IF NOT EXISTS games_bot_text_style_fingerprint_idx ON games_bot_text_templates(fingerprint)');
      await c.query("INSERT INTO games_bot_events(event_id,created_at) VALUES('text-style-ids:v2',$1)",[new Date().toISOString()]);
    });
  }
  async save(user:string,name:string,input:TextStyle) {
    name=name.replace(/[\u0000-\u001f\u007f]/g,' ').trim();if(!name||name.length>60)throw new UserError('テンプレート名は1〜60文字で指定してください。');
    const {style,id,fingerprint}=identity(input),now=new Date().toISOString();
    return this.store.transaction(async c=>{
      const [record]=await c.query(`INSERT INTO games_bot_text_templates(id,owner_id,name,style,fingerprint,created_at) VALUES($1,$2,'文字デザイン',$3::jsonb,$4,$5)
        ON CONFLICT(id) DO UPDATE SET id=EXCLUDED.id RETURNING id,owner_id,style,fingerprint,shared`,[id,user,JSON.stringify(style),fingerprint,now]);
      if(record!.fingerprint!==fingerprint)throw new UserError('スタイルIDの衝突を検出したため、保存を中止しました。');
      await c.query(`INSERT INTO games_bot_text_library(user_id,template_id,added_at,name) VALUES($1,$2,$3,$4)
        ON CONFLICT(user_id,template_id) DO UPDATE SET name=EXCLUDED.name`,[user,id,now,name]);
      return {...record,name} as unknown as TextTemplate;
    });
  }
  async list(user:string,page=0) {
    return this.store.transaction(c=>c.query<{id:string;name:string;owner_id:string;shared:boolean;total:string}>(`SELECT t.id,l.name,t.owner_id,t.shared,COUNT(*) OVER()::text AS total FROM games_bot_text_library l JOIN games_bot_text_templates t ON t.id=l.template_id WHERE l.user_id=$1 ORDER BY l.added_at DESC,t.id LIMIT 20 OFFSET $2`,[user,Math.max(0,page)*20]));
  }
  async get(user:string,id:string) {
    return this.store.transaction(async c=>{
      const [record]=await c.query(`SELECT t.id,t.owner_id,l.name,t.style,t.shared FROM games_bot_text_templates t JOIN games_bot_text_library l ON l.template_id=t.id WHERE t.id=${resolveId} AND l.user_id=$1`,[user,templateId(id)]);
      if(!record)throw new UserError('保存済みのテンプレートが見つかりません。「共有コードから追加」で読み込んでください。');
      return {...record,style:validateTextStyle(record.style)} as unknown as TextTemplate;
    });
  }
  async import(user:string,id:string) {
    return this.store.transaction(async c=>{
      const [record]=await c.query(`SELECT t.id,t.owner_id,COALESCE(l.name,t.public_name,'共有デザイン') AS name,t.style,t.shared FROM games_bot_text_templates t LEFT JOIN games_bot_text_library l ON l.template_id=t.id AND l.user_id=$1 WHERE t.id=${resolveId} AND (t.shared=true OR l.user_id IS NOT NULL)`,[user,templateId(id)]);
      if(!record)throw new UserError('共有されているテンプレートが見つかりません。');
      await c.query('INSERT INTO games_bot_text_library(user_id,template_id,added_at,name) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[user,record.id,new Date().toISOString(),record.name]);
      return {...record,style:validateTextStyle(record.style)} as unknown as TextTemplate;
    });
  }
  async share(user:string,id:string) {
    return this.store.transaction(async c=>{
      const records=await c.query(`UPDATE games_bot_text_templates t SET shared=true,public_name=COALESCE(t.public_name,l.name) FROM games_bot_text_library l WHERE t.id=${resolveId} AND l.template_id=t.id AND l.user_id=$1 RETURNING t.id`,[user,templateId(id)]);
      if(!records.length)throw new UserError('共有するには、まず自分の保存一覧に追加してください。');
    });
  }
  async remove(user:string,id:string) {
    return this.store.transaction(async c=>{
      const [record]=await c.query(`DELETE FROM games_bot_text_library WHERE user_id=$1 AND template_id=${resolveId} RETURNING template_id AS id`,[user,templateId(id)]);
      if(record)await c.query('DELETE FROM games_bot_text_templates t WHERE t.id=$1 AND shared=false AND NOT EXISTS(SELECT 1 FROM games_bot_text_library l WHERE l.template_id=t.id)',[record.id]);
    });
  }
}
