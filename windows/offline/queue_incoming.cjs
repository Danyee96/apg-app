'use strict';
const { randomUUID } = require('node:crypto');
const { prepareIncoming } = require('./incoming.cjs');

// New temporary customers and their shipment are committed to the local queue
// together; a failed validation or interrupted write cannot orphan the batch.
function queueIncoming(queue, userId, input, lookups) {
  if (!input || !Array.isArray(input.items)) throw new Error('Add at least one bilty.');
  const customers = [], syntheticAccounts = [], items = input.items.map(item => {
    if (item.account_id !== '__new_temporary__') return item;
    const name = String(item.new_customer_name ?? '').trim();
    if (!name || Array.from(name).length > 100) throw new Error('Enter a temporary customer name of up to 100 characters.');
    const id = randomUUID(), localId = `offline-customer:${id}`;
    customers.push({ id, action: 'incoming_customer_create', payload: { mode: 'temporary', name } });
    syntheticAccounts.push({ id: localId, customer: 1, status: 'A' });
    return { ...item, account_id: localId };
  });
  const shipment = prepareIncoming({ ...input, items }, { ...lookups, accounts: [...lookups.accounts, ...syntheticAccounts] });
  const shipmentId = randomUUID();
  queue.enqueueBatch(userId, [...customers, { id: shipmentId, action: 'save_shipment', payload: shipment }]);
  return shipmentId;
}
module.exports = { queueIncoming };
