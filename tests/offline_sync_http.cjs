'use strict';
const assert = require('node:assert/strict');
const { Outbox } = require('../windows/offline/outbox.cjs');
const { syncPending } = require('../windows/offline/sync.cjs');
const { shipmentTransport } = require('../windows/offline/shipment_transport.cjs');
const { incomingTransport } = require('../windows/offline/customer_transport.cjs');
const { ApiSession } = require('../windows/offline/session.cjs');
const { prepareIncoming } = require('../windows/offline/incoming.cjs');
const { queueIncoming } = require('../windows/offline/queue_incoming.cjs');
const { downloadPendingBilties, searchPendingBilties } = require('../windows/offline/delivery_snapshot.cjs');
const { queueDelivery } = require('../windows/offline/queue_delivery.cjs');

async function main() {
  const base = process.env.APG_TEST_BASE.replace(/\?$/, '');
  const session = new ApiSession(base, { allowLocalHttp: true });
  const userId = (await session.login('integration-review', process.env.APG_TEST_PASSWORD)).userId;
  const request = (action, payload) => session.requestForUser(userId, action, payload);
  const lookups = (await request('lookups')).body;
  const station = lookups.stations.find(x => x.status === 'A').id;
  const customer = lookups.accounts.find(x => x.status === 'A' && x.customer).id;
  const queue = new Outbox(':memory:');
  const shipment = prepareIncoming({ dated: '2026-11-20', station_id: station, truck: 'HTTP-SYNC-TEST', driver:'Driver test', truck_amount:'300', labour_bonus:'25', munshi_bonus:'15', items: [{ account_id: customer, bilty: 'HTTP-SYNC-1', qty: 1, bilty_amount: '20', goods_type:'Cotton Shoes', party_to:'Receiver', service_advance:'10', suzuki:'10' }, { account_id: customer, bilty: 'HTTP-SYNC-2', qty: 2, bilty_amount: '30' }] }, lookups);
  const id = queue.enqueue(userId, 'save_shipment', shipment);
  let first = true;
  const transport = shipmentTransport(async (action, body) => {
    const result = await request(action, body);
    if (first) { first = false; assert.equal(result.status, 201); throw Error('simulated lost response'); }
    assert.equal(body.offline_request_id, id);
    assert.equal(result.body.replayed, true);
    return result;
  });
  assert.equal((await syncPending(queue, userId, transport)).stopped, 'network');
  assert.equal((await syncPending(queue, userId, transport)).synced, 1);
  assert.equal(queue.list(userId)[0].status, 'synced');
  const linked = queueIncoming(queue, userId, { dated:'2026-11-20', station_id:station, truck:'HTTP-TEMP-LINK', items:[{ account_id:'__new_temporary__', new_customer_name:'Offline sync customer', bilty:'HTTP-TEMP-1', qty:1, bilty_amount:'20' }] }, lookups);
  const customerOperation = queue.detail(userId, linked).payload.items[0].account_id.slice('offline-customer:'.length);
  const linkedTransport = incomingTransport(request, operationId => queue.resolveCustomer(userId, operationId));
  assert.equal((await syncPending(queue, userId, linkedTransport)).synced, 2);
  assert.equal(queue.detail(userId, linked).status, 'synced');
  const realCustomer = queue.resolveCustomer(userId, customerOperation);
  const snapshot = await downloadPendingBilties((action, body, params) => session.requestForUser(userId, action, body, params));
  assert.equal(searchPendingBilties(snapshot, 'HTTP-TEMP-1')[0].account_id, realCustomer);
  const deliveryItem=searchPendingBilties(snapshot,'HTTP-SYNC-2')[0];
  const delivery=queueDelivery(queue,userId,{dated:'2026-11-20',receiver:'Offline test',items:[deliveryItem.id]},snapshot);
  let deliveryResponseLost=true;
  const deliveryTransport=incomingTransport(async(action,body)=>{const result=await request(action,body);if(action==='save_unified_delivery'&&deliveryResponseLost){deliveryResponseLost=false;assert.equal(result.status,201);throw Error('lost response');}return result;},operationId=>queue.resolveCustomer(userId,operationId));
  assert.equal((await syncPending(queue,userId,deliveryTransport)).stopped,'network');
  assert.equal((await syncPending(queue,userId,deliveryTransport)).synced,1);
  assert.equal(queue.detail(userId,delivery).result.replayed,true);
  console.log(JSON.stringify({ requestId: id, realCustomer, deliveryItem:deliveryItem.id, result: JSON.parse(queue.list(userId)[0].result) }));
  queue.close();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
