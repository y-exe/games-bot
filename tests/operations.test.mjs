import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Operations} from '../src/services/operations.ts';

test('再起動時は受付を止め、処理中の操作が終わってから接続を破棄できる',async()=>{
  const operations=new Operations(),events=[];
  let finish;
  const pending=operations.run(async()=>{await new Promise(resolve=>{finish=resolve;});events.push('reply');});
  await Promise.resolve();
  const drain=operations.drain(1000).then(result=>{assert.equal(result,true);events.push('destroy');});
  await operations.run(async()=>{throw new Error('終了中は新しい操作を受け付けない');});
  assert.deepEqual(events,[]);
  finish();await pending;await drain;
  assert.deepEqual(events,['reply','destroy']);
});

test('停止待ちは固まった操作で無期限に止まらず、失敗した操作も残らない',async()=>{
  const operations=new Operations();
  await assert.rejects(operations.run(async()=>{throw new Error('failed');}),/failed/);
  assert.equal(await operations.drain(10),true);
  const blocked=new Operations();let release;
  const task=blocked.run(()=>new Promise(resolve=>{release=resolve;}));
  assert.equal(await blocked.drain(10),false);release();await task;
});
