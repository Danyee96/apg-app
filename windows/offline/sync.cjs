'use strict';

// A transport must send the operation UUID and authenticated user's session to
// a server endpoint that applies the operation and records the UUID atomically.
// This runner deliberately has no production endpoint until that contract exists.
async function syncPending(queue, userId, send) {
  let synced = 0;
  for (;;) {
    const operation = queue.claim(userId);
    if (!operation) {
      const blocked = queue.list(userId).find(row => row.status !== 'synced');
      return { synced, stopped: blocked?.status === 'conflict' ? 'conflict' : blocked?.status === 'sending' ? 'sending' : 'empty-or-blocked' };
    }
    let response;
    try {
      response = await send({ id: operation.id, action: operation.action, payload: operation.payload, hash: operation.payload_hash });
    } catch {
      queue.finish(userId, operation.id, 'pending');
      return { synced, stopped: 'network' };
    }
    if (!response || !Number.isInteger(response.status)) {
      queue.finish(userId, operation.id, 'pending');
      return { synced, stopped: 'invalid-response' };
    }
    if (response.status >= 200 && response.status < 300 && response.operationId === operation.id && response.committed === true) {
      queue.finish(userId, operation.id, 'synced', response.result ?? null);
      synced++;
      continue;
    }
    if ([400, 403, 404, 409, 422].includes(response.status)) {
      queue.finish(userId, operation.id, 'conflict', { status: response.status, message: String(response.message ?? 'Operation needs review.') });
      return { synced, stopped: 'conflict' };
    }
    queue.finish(userId, operation.id, 'pending');
    return { synced, stopped: response.status === 401 ? 'authentication' : 'retry' };
  }
}

module.exports = { syncPending };
