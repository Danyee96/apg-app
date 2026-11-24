'use strict';
const { randomUUID } = require('node:crypto');

function queueDelivery(queue, userId, input, snapshot) {
  if (!snapshot || !Array.isArray(snapshot.rows) || !input || !Array.isArray(input.items) || !input.items.length || input.items.length > 1000) throw new Error('Choose pending bilties from the downloaded snapshot.');
  const date = String(input.dated || ''), parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date) throw new Error('Choose a valid delivery date.');
  const field = (value, name, max, required = false) => { const v=String(value ?? '').trim(); if (required && !v || Array.from(v).length > max) throw new Error(`Enter a valid ${name}.`); return v; };
  const receiver = field(input.receiver,'receiver name',100,true), seen = new Set();
  const byId = new Map(snapshot.rows.map(row=>[row.id,row]));
  const money = value => { if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid downloaded charge.'); return `${Math.floor(value/100)}.${String(value%100).padStart(2,'0')}`; };
  const items = input.items.map(value=>{
    const id=Number(value), row=byId.get(id);
    if (!Number.isSafeInteger(id) || !row || seen.has(id) || !/^[0-9a-f]{64}$/.test(row.offline_version || '')) throw new Error('Choose each valid downloaded bilty once.');
    if (date < row.dated) throw new Error('Delivery date cannot be earlier than arrival date.');
    // This preview does not yet support advance allocations or cash posting.
    if (Number(row.service_advance || 0) > 0) throw new Error('Bilties with service advance must be delivered online.');
    seen.add(id);
    return {id,offline_version:row.offline_version,discount:'0',loading:money(row.loading || 0),suzuki:money(row.suzuki || 0),bilty_received:'0',service_received:'0'};
  });
  const payload={ offline_delivery:true, dated:date, receiver, mobile:field(input.mobile,'mobile',30), cnic:field(input.cnic,'CNIC',30), remarks:field(input.remarks,'remarks',500), items };
  const id=randomUUID();
  queue.db.exec('BEGIN IMMEDIATE');
  try {
    const previous=queue.db.prepare("SELECT payload FROM outbox WHERE user_id=? AND action='save_unified_delivery' AND status IN ('pending','sending','synced','conflict')").all(userId);
    for (const row of previous) if (JSON.parse(row.payload).items.some(item=>seen.has(Number(item.id)))) throw new Error('A selected bilty is already in a saved delivery on this device.');
    queue.enqueue(userId,'save_unified_delivery',payload,id);
    queue.db.exec('COMMIT'); return id;
  } catch (error) { queue.db.exec('ROLLBACK'); throw error; }
}
module.exports = { queueDelivery };
