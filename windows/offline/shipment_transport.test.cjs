'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Outbox } = require('./outbox.cjs');
const { syncPending } = require('./sync.cjs');
const { shipmentTransport } = require('./shipment_transport.cjs');

test('lost response retries the same authenticated shipment request key', async () => {
  const queue = new Outbox(':memory:');
  const id = queue.enqueue('user-1', 'save_shipment', { kind: 'incoming', items: [{ bilty: '1' }] });
  let committed = null;
  const request = async (action, payload) => {
    assert.equal(action, 'save_shipment');
    assert.equal(payload.offline_request_id, id);
    if (!committed) { committed = payload; throw Error('response lost'); }
    assert.deepEqual(payload, committed);
    return { status: 201, body: { id: 8, reference: 'IN-000008', replayed: true } };
  };
  const send = shipmentTransport(request);
  assert.equal((await syncPending(queue, 'user-1', send)).stopped, 'network');
  assert.equal((await syncPending(queue, 'user-1', send)).synced, 1);
  assert.equal(JSON.parse(queue.list('user-1')[0].result).id, 8);
  queue.close();
});

test('unsupported edits and invalid server confirmations are not marked synced', async () => {
  const queue = new Outbox(':memory:');
  queue.enqueue('u', 'save_shipment', { id: 1, kind: 'incoming' });
  assert.equal((await syncPending(queue, 'u', shipmentTransport(async () => { throw Error('must not send'); }))).stopped, 'conflict');
  queue.enqueue('v', 'save_shipment', { kind: 'incoming' });
  assert.equal((await syncPending(queue, 'v', shipmentTransport(async () => ({ status: 201, body: { ok: true } })))).stopped, 'retry');
  assert.equal(queue.list('v')[0].status, 'pending');
  queue.close();
});

test('unauthorized and unsupported actions never produce successful sync', async () => {
  const queue = new Outbox(':memory:');
  queue.enqueue('u', 'receive_cash', { amount: 100 });
  assert.equal((await syncPending(queue, 'u', shipmentTransport(async () => { throw Error('must not send'); }))).stopped, 'conflict');
  queue.enqueue('v', 'save_shipment', { kind: 'incoming' });
  assert.equal((await syncPending(queue, 'v', shipmentTransport(async () => ({ status: 401, body: { error: 'Sign in' } })))).stopped, 'authentication');
  assert.equal(queue.list('v')[0].status, 'pending');
  queue.close();
});
