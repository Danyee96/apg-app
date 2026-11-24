'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AutoSync } = require('./auto_sync.cjs');

test('network failures retry later and successful sync continues polling', async () => {
  const scheduled=[];let calls=0;
  const task=new AutoSync(async()=>++calls===1?{synced:0,stopped:'network'}:{synced:1,stopped:'empty-or-blocked'}, {setTimer:(fn,ms)=>{scheduled.push({fn,ms});return scheduled.length;},clearTimer:()=>{}});
  task.start();assert.equal(scheduled.shift().ms,0);task.timer=null;
  await task.tick();assert.equal(task.snapshot().state,'network');assert.equal(scheduled.at(-1).ms,30000);
  task.timer=null;await task.tick();assert.equal(task.snapshot().synced,1);task.stop();
});
test('conflict and expired authentication stop automatic retries', async () => {
  for(const stopped of ['conflict','authentication']) {
    const task=new AutoSync(async()=>({synced:0,stopped}),{setTimer:()=>1,clearTimer:()=>{}});
    task.start();task.timer=null;await task.tick();assert.equal(task.snapshot().state,stopped);assert.equal(task.enabled,false);
  }
});
test('does not overlap sync and ignores a completion after sign-out', async () => {
  let finish,calls=0;const task=new AutoSync(()=>{calls++;return new Promise(resolve=>{finish=resolve;});},{setTimer:()=>1,clearTimer:()=>{}});
  task.start();task.timer=null;const running=task.tick();await task.tick();assert.equal(calls,1);
  task.stop();finish({synced:1,stopped:'empty-or-blocked'});await running;assert.equal(task.snapshot().state,'stopped');
});
