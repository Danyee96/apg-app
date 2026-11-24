'use strict';

// `request` is supplied by the authenticated desktop session. It must retain
// its session cookies and send the CSRF header; credentials are never queued.
// This adapter intentionally supports only new shipments, not deliveries or
// payments. Unknown operations cannot be accidentally posted as shipments.
function shipmentTransport(request) {
  if (typeof request !== 'function') throw new TypeError('Authenticated request function required.');
  return async operation => {
    if (operation.action !== 'save_shipment') return { status: 422, message: 'This offline operation is not supported yet.' };
    if (operation.payload.id || operation.payload.pending_id || operation.payload.offline_request_id) {
      return { status: 422, message: 'Only new shipments can be submitted offline.' };
    }
    const response = await request('save_shipment', { ...operation.payload, offline_request_id: operation.id });
    if (!response || !Number.isInteger(response.status)) return response;
    const body = response.body;
    if (response.status === 201 && body && Number.isInteger(body.id) && body.id > 0 && typeof body.reference === 'string' && body.reference) {
      return { status: 201, operationId: operation.id, committed: true, result: body };
    }
    // An unexpected success body is not proof that this operation committed.
    return { status: response.status, message: typeof body?.error === 'string' ? body.error : 'Unexpected server response.' };
  };
}

module.exports = { shipmentTransport };
