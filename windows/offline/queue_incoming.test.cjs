'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Outbox } = require('./outbox.cjs');
const { queueIncoming } = require('./queue_incoming.cjs');
const { incomingTransport } = require('./customer_transport.cjs');
const { syncPending } = require('./sync.cjs');
const refs = { stations:[{id:1,status:'A'}], accounts:[] };
const input = { dated:'2026-11-20',station_id:1,truck:'A',items:[{account_id:'__new_temporary__',new_customer_name:'New customer',bilty:'1',qty:1,bilty_amount:'20'}] };
test('queues new temporary customer and shipment atomically and links them on sync', async () => {
 const q=new Outbox(':memory:');const shipment=queueIncoming(q,'user',input,refs);const rows=q.list('user');
 assert.equal(rows.length,2);assert.equal(rows[1].id,shipment);
 assert.equal(q.detail('user',shipment).payload.items[0].account_id,`offline-customer:${rows[0].id}`);
 const request=async action=>action==='incoming_customer_create'?{status:201,body:{id:'1-116-999'}}:{status:201,body:{id:1,reference:'IN-1'}};
 assert.equal((await syncPending(q,'user',incomingTransport(request,id=>q.resolveCustomer('user',id)))).synced,2);q.close();
});
test('failed validation and failed batch leave no orphan customers', () => {
 const q=new Outbox(':memory:');
 assert.throws(()=>queueIncoming(q,'user',{...input,items:[{...input.items[0],qty:0}]},refs));assert.equal(q.list('user').length,0);
 const duplicate='b3a20f98-716e-42fa-9f7c-67c3b8171b8a';
 assert.throws(()=>q.enqueueBatch('user',[{id:duplicate,action:'a',payload:{}},{id:duplicate,action:'a',payload:{}}]));assert.equal(q.list('user').length,0);q.close();
});
test('same temporary name on two bilties creates distinct customers', () => {
 const q=new Outbox(':memory:');const id=queueIncoming(q,'user',{...input,items:[input.items[0],{...input.items[0],bilty:'2'}]},refs);
 const rows=q.list('user');assert.equal(rows.length,3);const items=q.detail('user',id).payload.items;assert.notEqual(items[0].account_id,items[1].account_id);q.close();
});
