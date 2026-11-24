'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { prepareIncoming } = require('./incoming.cjs');
const refs = { stations: [{ id: 1, status: 'A' }], accounts: [{ id: 'customer', customer: 1, status: 'A' }] };
const valid = { dated: '2026-11-20', station_id: 1, truck: 'TRUCK', items: [{ account_id: 'customer', bilty: '123', qty: 1, bilty_amount: '200' }] };
test('prepare an incoming shipment with safe default amounts', () => {
 const prepared = prepareIncoming(valid, refs);
 assert.equal(prepared.kind, 'incoming'); assert.equal(prepared.items[0].godown, '0'); assert.equal(prepared.items[0].bilty_amount, '200');
});
test('prepare multiple bilties together without changing their amounts', () => {
 const prepared = prepareIncoming({...valid,items:[valid.items[0],{...valid.items[0],bilty:'124',qty:3,bilty_amount:'99.50'}]}, refs);
 assert.equal(prepared.items.length,2); assert.equal(prepared.items[1].qty,3); assert.equal(prepared.items[1].bilty_amount,'99.50');
});
test('reject invalid references, duplicates, dates and money', () => {
 for (const data of [{...valid,dated:'2026-02-30'},{...valid,station_id:2},{...valid,labour_bonus:'-2'},{...valid,driver:'x'.repeat(101)},{...valid,items:[valid.items[0],valid.items[0]]},{...valid,items:[{...valid.items[0],account_id:'unknown'}]},{...valid,items:[{...valid.items[0],bilty_amount:'-1'}]}]) assert.throws(() => prepareIncoming(data, refs));
});
