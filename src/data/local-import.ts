import type { PGlite } from '@electric-sql/pglite';
import { UserError } from '../errors.js';

const tables={
  games_bot_economy:['user_id','points','last_login','consecutive_days','gamble_date','gamble_count'],
  games_bot_allowed_channels:['channel_id'],
  games_bot_weather_cities:['city_name','city_id'],
  games_bot_events:['event_id','created_at'],
  games_bot_sessions:['session_id','payload'],
};
export async function importLocalSqlite(local:PGlite,path:string) {
  const marker='local-sqlite-import-v1';
  if((await local.query('SELECT event_id FROM games_bot_events WHERE event_id=$1',[marker])).rows.length)return;
  if(!process.versions.bun)throw new UserError('旧ローカルDBの移行はBunで起動してください。');
  const {Database}=await import('bun:sqlite');
  const legacy=new Database(path,{readonly:true,safeIntegers:true});
  try {
    await local.transaction(async tx=>{
      for(const [table,columns] of Object.entries(tables)) {
        if((await tx.query(`SELECT 1 FROM ${table} LIMIT 1`)).rows.length)throw new UserError('移行先にデータがあります。旧ローカルDBの移行先を確認してください。');
        for(const row of legacy.query(`SELECT ${columns.join(',')} FROM ${table}`).all() as Record<string,unknown>[]) {
          await tx.query(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map((_,index)=>`$${index+1}`).join(',')})`,columns.map(column=>typeof row[column]==='bigint'?String(row[column]):row[column]));
        }
      }
      await tx.query('INSERT INTO games_bot_events(event_id,created_at) VALUES($1,$2)',[marker,new Date().toISOString()]);
    });
  } finally {legacy.close();}
}
