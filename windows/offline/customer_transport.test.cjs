'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Outbox } = require('./outbox.cjs');
const { syncPending } = require('./sync.cjs');
const { incomingTransport } = require('./customer_transport.cjs');

test('syncs customer first and maps its server ID into shipment', async () => {
 const q=new Outbox(':memory:');
 const customer=q.enqueue('u','incoming_customer_create',{mode:'temporary',name:'Test'});
 const shipment=q.enqueue('u','save_shipment',{kind:'incoming',items:[{account_id:`offline-customer:${customer}`,bilty:'1'}]});
 const sent=[];
 const transport=incomingTransport(async (action,payload)=>{sent.push({action,payload});return action==='incoming_customer_create'?{status:201,body:{id:'1-116-999'}}:{status:201,body:{id:12,reference:'IN-12'}};},id=>q.resolveCustomer('u',id));
 assert.equal((await syncPending(q,'u',transport)).synced,2);
 assert.deepEqual(sent.map(x=>x.action),['incoming_customer_create','save_shipment']);
 assert.equal(sent[1].payload.items[0].account_id,'1-116-999');
 assert.equal(sent[1].payload.offline_request_id,shipment);
 assert.throws(()=>q.resolveCustomer('other',customer));
 q.close();
});
test('does not send shipment if its customer is unavailable or belongs to another user', async () => {
 const q=new Outbox(':memory:');
 const customer=q.enqueue('other','incoming_customer_create',{mode:'temporary',name:'Test'});
 q.enqueue('u','save_shipment',{kind:'incoming',items:[{account_id:`offline-customer:${customer}`} ]});
 let sent=0;const transport=incomingTransport(async()=>{sent++;},id=>q.resolveCustomer('u',id));
 assert.equal((await syncPending(q,'u',transport)).stopped,'conflict');assert.equal(sent,0);q.close();
});
