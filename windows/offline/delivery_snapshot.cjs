'use strict';

// This is a read-only snapshot. A later delivery submission must still check
// server versions and availability in its own transaction.
async function downloadPendingBilties(request, { maxItems = 10000 } = {}) {
  const before = await request('workspace_changes');
  if (before.status !== 200 || !Number.isSafeInteger(before.body?.revision)) throw new Error('Cannot verify snapshot revision.');
  const rows = [];
  let total = null, page = 0, pageSize = null, fetched = 0;
  const seen = new Set();
  do {
    const result = await request('bilties', undefined, { kind: 'incoming', status: 'pending', page });
    const data = result.body;
    if (result.status !== 200 || !Array.isArray(data?.rows) || !Number.isSafeInteger(data.total) || !Number.isSafeInteger(data.page_size) || data.page_size < 1 || data.page !== page || data.total > maxItems || total !== null && total !== data.total || pageSize !== null && pageSize !== data.page_size) throw new Error('Pending bilty snapshot is incomplete.');
    total = data.total;
    pageSize = data.page_size; fetched += data.rows.length;
    for (const item of data.rows) { if (!Number.isSafeInteger(item.id) || seen.has(item.id)) throw new Error('Pending bilty snapshot contains duplicate or invalid entries.'); seen.add(item.id); }
    rows.push(...data.rows.filter(item => !item.delivery_submission_id).map(item => ({ id:item.id, bilty:item.bilty, account_id:item.account_id, customer:item.customer, party_to:item.party_to, station:item.station, dated:item.dated, qty:item.qty, detail:item.detail, bilty_amount:item.bilty_amount, godown:item.godown, loading:item.loading, suzuki:item.suzuki, advance:item.advance, service_advance:item.service_advance, total:item.total, offline_version:item.offline_version })));
    page++;
    if (data.rows.length === 0 && page * data.page_size < total) throw new Error('Pending bilty snapshot is incomplete.');
  } while (page * pageSize < total);
  if (fetched !== total) throw new Error('Pending bilty snapshot is incomplete.');
  const after = await request('workspace_changes');
  if (after.status !== 200 || after.body?.revision !== before.body.revision) throw new Error('Workspace changed during download. Try again.');
  return { revision: before.body.revision, downloadedAt: new Date().toISOString(), rows };
}

function searchPendingBilties(snapshot, query) {
  const term = String(query || '').trim().toLocaleLowerCase();
  if (!term || !snapshot || !Array.isArray(snapshot.rows)) return [];
  return snapshot.rows.filter(item => [item.bilty,item.customer,item.party_to].some(value => String(value || '').toLocaleLowerCase().includes(term))).slice(0, 30);
}
module.exports = { downloadPendingBilties, searchPendingBilties };
