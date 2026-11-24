'use strict';
const { test }=require('node:test');const assert=require('node:assert/strict');
const { Outbox }=require('./outbox.cjs');const {queueDelivery}=require('./queue_delivery.cjs');
const {incomingTransport}=require('./customer_transport.cjs');const {syncPending}=require('./sync.cjs');
const snapshot={rows:[{id:1,bilty:'1',dated:'2026-11-19',offline_version:'a'.repeat(64),loading:5000,suzuki:2500,service_advance:0}]};
const input={dated:'2026-11-20',receiver:'R',items:[1]};
test('standard delivery syncs once using snapshot version and no new cash',async()=>{
 const q=new Outbox(':memory:');const id=queueDelivery(q,'u',input,snapshot);assert.throws(()=>queueDelivery(q,'u',input,snapshot),/already/);
 let sent;const transport=incomingTransport(async(action,payload)=>{sent={action,payload};return {status:201,body:{id:5,reference:'DL-5'}};},()=>{});
 assert.equal((await syncPending(q,'u',transport)).synced,1);assert.equal(sent.payload.request_key,id);assert.equal(sent.payload.items[0].loading,'50.00');assert.equal(sent.payload.items[0].bilty_received,'0');q.close();
});
test('rejects stale identifiers, duplicate rows, early date and service advances',()=>{
 const q=new Outbox(':memory:');for(const p of [{...input,items:[1,1]},{...input,items:[2]},{...input,dated:'2026-11-18'}])assert.throws(()=>queueDelivery(q,'u',p,snapshot));
 assert.throws(()=>queueDelivery(q,'u',input,{rows:[{...snapshot.rows[0],service_advance:100}]}),/advance/);assert.equal(q.list('u').length,0);q.close();
});
