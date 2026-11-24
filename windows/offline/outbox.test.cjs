'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Outbox } = require('./outbox.cjs');

test('queued payments survive interruption and reuse the original operation ID', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apg-outbox-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'queue.sqlite');
  let queue = new Outbox(file);
  const id = queue.enqueue('munshi', 'receive_cash', { amount: 1000 });
  assert.equal(queue.claim('another-user'), null);
  assert.equal(queue.claim('munshi').id, id);
  queue.close();
  queue = new Outbox(file);
  assert.equal(queue.recoverInterrupted(), 1);
  const retry = queue.claim('munshi');
  assert.equal(retry.id, id);
  assert.equal(retry.attempts, 2);
  assert.deepEqual(retry.payload, { amount: 1000 });
  assert.throws(() => queue.finish('another-user', id, 'synced', {}));
  queue.finish('munshi', id, 'synced', { receipt: 42 });
  assert.equal(queue.claim('munshi'), null);
  assert.equal(queue.list('munshi')[0].status, 'synced');
  queue.close();
});

test('operation IDs cannot be reused for a second transaction', () => {
  const queue = new Outbox(':memory:');
  const id = queue.enqueue('user', 'payment', { amount: 1 });
  assert.throws(() => queue.enqueue('user', 'payment', { amount: 2 }, id));
  const op = queue.claim('user');
  queue.finish('user', op.id, 'conflict', { reason: 'stale record' });
  assert.equal(queue.list('user')[0].status, 'conflict');
  assert.equal(queue.claim('user'), null);
  queue.close();
});

test('review and retry a conflict without changing the operation or exposing it to another user', () => {
  const queue = new Outbox(':memory:');
  const id = queue.enqueue('owner', 'save_shipment', { truck: 'ABC', items: [{ bilty: '123' }] });
  queue.claim('owner'); queue.finish('owner', id, 'conflict', { status: 409, message: 'Changed elsewhere' });
  assert.throws(() => queue.detail('other', id));
  assert.throws(() => queue.retryConflict('other', id));
  assert.equal(queue.detail('owner', id).error.message, 'Changed elsewhere');
  queue.retryConflict('owner', id);
  const retry = queue.claim('owner');
  assert.equal(retry.id, id); assert.equal(retry.payload.truck, 'ABC');
  assert.throws(() => queue.retryConflict('owner', id));
  queue.close();
});

test('only the owner can edit an entry that has never been sent', () => {
 const q=new Outbox(':memory:');const id=q.enqueue('owner','save_shipment',{truck:'Old'});
 assert.throws(()=>q.updateUnsent('other',id,'save_shipment',{truck:'Stolen'}));
 q.updateUnsent('owner',id,'save_shipment',{truck:'Corrected'});
 const operation=q.claim('owner');assert.equal(operation.payload.truck,'Corrected');
 q.finish('owner',id,'pending');
 assert.throws(()=>q.updateUnsent('owner',id,'save_shipment',{truck:'Unsafe'}));
 assert.equal(q.claim('owner').payload.truck,'Corrected');q.close();
});
