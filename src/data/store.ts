import {UserError} from '../errors.js';
import { mkdirSync, existsSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { join } from 'node:path';
import { Pool, types, type PoolClient } from 'pg';
import { settings } from '../config.js';
import {loginReward,loginDay,jstDate} from './login.js';
import {transferFee} from './money.js';
import {rankingLimit,type RankingEntry,type RankingUserRecord} from './rankings.js';
import {dailyWealthTax,wealthTaxAllowance} from './wealth-tax.js';
export {jstDate} from './login.js';

type RecordRow = Record<string, unknown>;
types.setTypeParser(1082,value=>value);
interface Connection { query<T extends RecordRow = RecordRow>(sql: string, params?: unknown[]): Promise<T[]> }
export interface Account { id: string; points: bigint; lastLogin: string | null; consecutive: number; gambleDate: string | null; gambleCount: number; newAccount:boolean }
const schema = `
CREATE TABLE IF NOT EXISTS games_bot_economy (user_id numeric(20,0) PRIMARY KEY, points numeric NOT NULL DEFAULT 0, last_login date, consecutive_days smallint NOT NULL DEFAULT 0, gamble_date date, gamble_count smallint NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS games_bot_economy_points_idx ON games_bot_economy(points DESC);
CREATE TABLE IF NOT EXISTS games_bot_allowed_channels(channel_id bigint PRIMARY KEY);
CREATE TABLE IF NOT EXISTS games_bot_weather_cities(city_name text PRIMARY KEY, city_id text NOT NULL);
CREATE TABLE IF NOT EXISTS games_bot_events(event_id text PRIMARY KEY, created_at text NOT NULL);
CREATE TABLE IF NOT EXISTS games_bot_sessions(session_id text PRIMARY KEY, payload text NOT NULL);
CREATE TABLE IF NOT EXISTS games_bot_user_profiles(user_id numeric(20,0) PRIMARY KEY, display_name text NOT NULL, username text NOT NULL, fetched_at text NOT NULL);
`;
function dateString(value: unknown): string | null { return value instanceof Date ? value.toISOString().slice(0,10) : value ? String(value).slice(0,10) : null; }
// vps側の運用要件: PostgreSQLは全TCP接続でTLSを強制(hostssl)し、自己署名証明書を使う。
// pg v8は素の`sslmode=require`をverify-full扱いして自己署名で失敗するため、
// 本番のTCP接続では`?sslmode=require&uselibpqcompat=true`が必須。
// DATABASE_URLに欠けていればここで補い、原因不明のエラーID化を防ぐ。
export function normalizeDatabaseUrl(url: string, production = settings.production): string {
  if (!url || !production) return url;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return url; }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') return url;
  if (!parsed.hostname || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1') return url;
  const params = parsed.searchParams;
  if (!params.has('sslmode')) params.set('sslmode', 'require');
  if (!params.has('uselibpqcompat')) params.set('uselibpqcompat', 'true');
  return parsed.toString();
}
export class Store {
  private local?: PGlite;
  private pool?: Pool;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private url = settings.databaseUrl, private dir = settings.dataDir) {}
  async initialize() {
    if (this.url) { this.pool = new Pool({ connectionString: normalizeDatabaseUrl(this.url), max: 4 }); await this.pool.query(schema); await this.pool.query(`DO $$ BEGIN
        PERFORM pg_advisory_xact_lock(hashtextextended('games-bot-points-schema',0));
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='games_bot_economy' AND column_name='points' AND data_type='bigint') THEN
          ALTER TABLE games_bot_economy ALTER COLUMN points TYPE numeric USING points::numeric;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='games_bot_economy'::regclass AND conname='games_bot_points_whole') THEN
          ALTER TABLE games_bot_economy ADD CONSTRAINT games_bot_points_whole CHECK(points=trunc(points) AND points NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric));
        END IF;
      END $$;`); }
    else {
      if(settings.production)throw new UserError('本番起動にはDATABASE_URLが必要です。');
      mkdirSync(this.dir, { recursive: true });
      const {PGlite}=await import('@electric-sql/pglite');
      this.local=await PGlite.create(join(this.dir,'pglite'),{parsers:{1700:value=>value,20:value=>value,1082:value=>value}});
      await this.local.exec(schema);
      await this.local.exec(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='games_bot_economy'::regclass AND conname='games_bot_points_whole') THEN
          ALTER TABLE games_bot_economy ADD CONSTRAINT games_bot_points_whole CHECK(points=trunc(points) AND points NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric));
        END IF;
      END $$;`);
      if(existsSync(join(this.dir,'bot.sqlite'))) {
        const {importLocalSqlite}=await import('./local-import.js');
        await importLocalSqlite(this.local,join(this.dir,'bot.sqlite'));
      }
    }
  }
  private connection(client?: PoolClient): Connection {
    return { query: async <T extends RecordRow>(sql: string, params: unknown[] = []) => {
      if (client) return (await client.query(sql, params)).rows as T[];
      throw new UserError('データベースを初期化してください。');
    } };
  }
  async transaction<T>(work: (c: Connection) => Promise<T>): Promise<T> {
    if (this.pool) {
      const client = await this.pool.connect();
      try { await client.query('BEGIN'); const result = await work(this.connection(client)); await client.query('COMMIT'); return result; }
      catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    }
    const operation = this.tail.then(async () => {
      if(!this.local)throw new UserError('データベースを初期化してください。');
      return this.local.transaction(tx=>work({query:async <R extends RecordRow>(sql:string,params:unknown[]=[]) => (await tx.query<R>(sql,params)).rows}));
    });
    this.tail = operation.catch(()=>{}); return operation;
  }
  async accounts<T>(ids: string[], work: (accounts: Map<string, Account>, c: Connection) => Promise<T> | T): Promise<T> {
    return this.transaction(async c => {
      const accounts = new Map<string,Account>();
      for(const id of [...new Set(ids)].sort()) {
        if (!/^\d{1,20}$/.test(id)) throw new UserError('ユーザーIDが無効です。');
        const inserted=await c.query('INSERT INTO games_bot_economy(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING RETURNING user_id', [id]);
        const [r] = await c.query('SELECT * FROM games_bot_economy WHERE user_id=$1 FOR UPDATE', [id]);
        accounts.set(id, { id, points: BigInt(String(r!.points)), lastLogin: dateString(r!.last_login), consecutive: Number(r!.consecutive_days), gambleDate: dateString(r!.gamble_date), gambleCount: Number(r!.gamble_count),newAccount:inserted.length>0 });
      }
      const result = await work(accounts,c);
      for(const a of accounts.values()) {
        await c.query('UPDATE games_bot_economy SET points=$2,last_login=$3,consecutive_days=$4,gamble_date=$5,gamble_count=$6 WHERE user_id=$1', [a.id,a.points.toString(),a.lastLogin,a.consecutive,a.gambleDate,a.gambleCount]);
      }
      return result;
    });
  }
  async account(id:string):Promise<Account|undefined> {
    return this.transaction(async c=>{
      const [r]=await c.query('SELECT * FROM games_bot_economy WHERE user_id=$1',[id]);
      return r?{id,points:BigInt(String(r.points)),lastLogin:dateString(r.last_login),consecutive:Number(r.consecutive_days),gambleDate:dateString(r.gamble_date),gambleCount:Number(r.gamble_count),newAccount:false}:undefined;
    });
  }
  async balance(id: string) { return (await this.account(id))?.points??0n; }
  async once(c: Connection, key: string) { return (await c.query('INSERT INTO games_bot_events(event_id,created_at) VALUES($1,$2) ON CONFLICT(event_id) DO NOTHING RETURNING event_id', [key,new Date().toISOString()])).length > 0; }
  async reward(key: string, deltas: Record<string,bigint>) {
    return this.accounts(Object.keys(deltas), async (a,c) => {
      if(!await this.once(c,key))return false;
      for(const [id, delta] of Object.entries(deltas)) a.get(id)!.points += delta;
      return true;
    });
  }
  async transfer(key: string, sender: string, target: string, amount: bigint) {
    if(sender===target||amount<=0n)throw new UserError('送金先と金額を確認してください。');
    return this.accounts([sender,target], async(a,c)=>{
      const fee=transferFee(amount);
      if(!await this.once(c,key))throw new UserError('この送金はすでに処理されています。');
      if(a.get(sender)!.points < amount+fee)throw new UserError(`残高不足です。手数料込みで ${amount+fee}pt 必要です。`);
      a.get(sender)!.points-=amount+fee; a.get(target)!.points+=amount;
      return { fee,balance:a.get(sender)!.points };
    });
  }
  private pointOrder(desc:boolean) {
    const order=desc?'DESC':'ASC';
    return `points ${order},user_id`;
  }
  async ranking(botId: string, limit = 10) {
    return this.transaction(c => c.query<{user_id:string;points:string}>(`SELECT user_id,points FROM games_bot_economy WHERE user_id<>$1 ORDER BY ${this.pointOrder(true)} LIMIT $2`, [botId,limit]));
  }
  async rankingExport(botId:string) {
    return this.transaction(c=>c.query<RankingEntry>(`SELECT user_id,points FROM games_bot_economy WHERE user_id<>$1 ORDER BY ${this.pointOrder(true)} LIMIT $2`,[botId,rankingLimit]));
  }
  async rankingUsers(ids:string[]) {
    if(!ids.length)return [];
    return this.transaction(c=>c.query<RankingUserRecord>('SELECT user_id,display_name,username,fetched_at FROM games_bot_user_profiles WHERE user_id IN (SELECT jsonb_array_elements_text($1::jsonb)::numeric)',[JSON.stringify([...new Set(ids)])]));
  }
  async saveRankingUsers(users:RankingUserRecord[]) {
    if(!users.length)return;
    await this.transaction(c=>c.query(`INSERT INTO games_bot_user_profiles(user_id,display_name,username,fetched_at)
      SELECT user_id,display_name,username,fetched_at FROM jsonb_to_recordset($1::jsonb) AS profiles(user_id numeric,display_name text,username text,fetched_at text)
      ON CONFLICT(user_id) DO UPDATE SET display_name=EXCLUDED.display_name,username=EXCLUDED.username,fetched_at=EXCLUDED.fetched_at
      WHERE EXCLUDED.fetched_at>=games_bot_user_profiles.fetched_at`,[JSON.stringify(users)]));
  }
  async rank(id:string,botId:string) {
    return this.transaction(c=>this.rankIn(c,id,botId));
  }
  private async rankIn(c:Connection,id:string,botId:string) {
    const [r]=await c.query(`SELECT ordinal FROM (SELECT user_id,ROW_NUMBER() OVER (ORDER BY ${this.pointOrder(true)}) AS ordinal FROM games_bot_economy WHERE user_id<>$1) ranked WHERE user_id=$2`,[botId,id]);
    return r?Number(r.ordinal):-1;
  }
  async poorRanking(botId:string) {
    return this.transaction(c=>c.query<{user_id:string;points:string}>(`SELECT user_id,points FROM games_bot_economy WHERE user_id<>$1 AND points<0 ORDER BY ${this.pointOrder(false)} LIMIT 10`,[botId]));
  }
  async poorRank(id:string,botId:string) {
    return this.transaction(async c=>{
      const [r]=await c.query(`SELECT ordinal FROM (SELECT user_id,ROW_NUMBER() OVER (ORDER BY ${this.pointOrder(false)}) AS ordinal FROM games_bot_economy WHERE user_id<>$1 AND points<0) ranked WHERE user_id=$2`,[botId,id]);
      return r?Number(r.ordinal):-1;
    });
  }
  async wealthTax(botId:string,now=new Date()) {
    const ids=await this.transaction(async c=>(await c.query(`SELECT user_id FROM games_bot_economy WHERE user_id<>$1 AND points>$2`,[botId,wealthTaxAllowance.toString()])).map(r=>String(r.user_id)));
    return this.accounts(ids,async(a,c)=>{
      if(!await this.once(c,`tax:${jstDate(now)}`))return 0;
      let count=0;for(const user of a.values()) {const tax=dailyWealthTax(user.points);if(tax){user.points-=tax;count++;}}return count;
    });
  }
  async login(id: string, botId: string, now = new Date()) {
    return this.accounts([id], async(a,c)=>{
      const user=a.get(id)!; const today=jstDate(now);
      const rank=user.newAccount?-1:await this.rankIn(c,id,botId);
      if(user.lastLogin===today)return { received:false, points:0n, days:user.consecutive, balance:user.points,rank };
      user.consecutive=loginDay(user.lastLogin,user.consecutive,now);
      const points=loginReward(user.consecutive,rank);
      user.lastLogin=today; user.points+=points;
      return {received:true,points,days:user.consecutive,balance:user.points,rank};
    });
  }
  async allowedChannels() { return this.transaction(async c => new Set((await c.query('SELECT channel_id FROM games_bot_allowed_channels')).map(r=>String(r.channel_id)))); }
  async toggleChannel(id: string) {
    return this.transaction(async c=>{
      if(this.pool)await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`allowed-channel:${id}`]);
      if((await c.query('DELETE FROM games_bot_allowed_channels WHERE channel_id=$1 RETURNING channel_id',[id])).length)return false;
      await c.query('INSERT INTO games_bot_allowed_channels(channel_id) VALUES($1)',[id]); return true;
    });
  }
  async saveSession(id: string, payload: unknown) { await this.transaction(c=>c.query('INSERT INTO games_bot_sessions(session_id,payload) VALUES($1,$2) ON CONFLICT(session_id) DO UPDATE SET payload=$2',[id,JSON.stringify(payload)])); }
  async deleteSession(id: string) { await this.transaction(c=>c.query('DELETE FROM games_bot_sessions WHERE session_id=$1',[id])); }
  async sessions() { return this.transaction(c=>c.query<{session_id:string;payload:string}>('SELECT * FROM games_bot_sessions')); }
  async close() { await this.tail; await this.local?.close(); await this.pool?.end(); }
}
