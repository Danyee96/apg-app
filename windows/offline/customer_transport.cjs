'use strict';

function customerTransport(request) {
  if (typeof request !== 'function') throw new TypeError('Authenticated request function required.');
  return async operation => {
    if (operation.action !== 'incoming_customer_create' || operation.payload.mode !== 'temporary' || operation.payload.offline_request_id) return { status: 422, message: 'Only new temporary customers are supported.' };
    const response = await request('incoming_customer_create', { ...operation.payload, offline_request_id: operation.id });
    if (!response || !Number.isInteger(response.status)) return response;
    if (response.status === 201 && typeof response.body?.id === 'string' && response.body.id) return { status: 201, operationId: operation.id, committed: true, result: response.body };
    return { status: response.status, message: typeof response.body?.error === 'string' ? response.body.error : 'Unexpected server response.' };
  };
}

function incomingTransport(request, resolveCustomer) {
  const { shipmentTransport } = require('./shipment_transport.cjs');
  const customer = customerTransport(request), shipment = shipmentTransport(request), delivery = require('./delivery_transport.cjs').deliveryTransport(request);
  return async operation => {
    if (operation.action === 'incoming_customer_create') return customer(operation);
    if (operation.action === 'save_unified_delivery') return delivery(operation);
    if (operation.action !== 'save_shipment') return { status: 422, message: 'This offline operation is not supported yet.' };
    const items = operation.payload.items;
    if (!Array.isArray(items)) return { status: 422, message: 'Shipment items are missing.' };
    const mapped = [];
    for (const item of items) {
      if (typeof item.account_id === 'string' && item.account_id.startsWith('offline-customer:')) {
        const operationId = item.account_id.slice('offline-customer:'.length);
        let accountId;
        try { accountId = await resolveCustomer(operationId); }
        catch { return { status: 409, message: 'The temporary customer must sync before this shipment.' }; }
        mapped.push({ ...item, account_id: accountId });
      } else mapped.push(item);
    }
    return shipment({ ...operation, payload: { ...operation.payload, items: mapped } });
  };
}
module.exports = { customerTransport, incomingTransport };
