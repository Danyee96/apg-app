'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Outbox } = require('./outbox.cjs');
const { syncPending } = require('./sync.cjs');

test('lost response retries original operation, then later operation follows', async () => {
  const q = new Outbox(':memory:');
  const first = q.enqueue('u', 'shipment', { amount: 1 });
  const second = q.enqueue('u', 'delivery', { shipment: first });
  assert.equal((await syncPending(q, 'u', async () => { throw Error('offline'); })).stopped, 'network');
  const received = [];
  await syncPending(q, 'u', async op => { received.push(op.id); return { status: 200, operationId: op.id, committed: true }; });
  assert.deepEqual(received, [first, second]);
  assert.deepEqual(q.list('u').map(x => x.status), ['synced', 'synced']);
  q.close();
});

test('conflicts stop dependent operations and do not affect another user', async () => {
  const q = new Outbox(':memory:');
  q.enqueue('u', 'shipment', { amount: 1 });
  q.enqueue('u', 'delivery', { amount: 2 });
  q.enqueue('v', 'shipment', { amount: 3 });
  assert.equal((await syncPending(q, 'u', async () => ({ status: 409 }))).stopped, 'conflict');
  assert.equal((await syncPending(q, 'u', async () => { throw Error('must not send'); })).synced, 0);
  assert.equal((await syncPending(q, 'v', async op => ({ status: 200, committed: true, operationId: op.id }))).synced, 1);
  q.close();
});

test('unverified success and expired authentication remain queued', async () => {
  const q = new Outbox(':memory:');
  q.enqueue('u', 'payment', { amount: 1 });
  assert.equal((await syncPending(q, 'u', async () => ({ status: 200 }))).stopped, 'retry');
  assert.equal((await syncPending(q, 'u', async () => ({ status: 401 }))).stopped, 'authentication');
  assert.equal(q.list('u')[0].status, 'pending');
  q.close();
});
