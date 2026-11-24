'use strict';

function prepareIncoming(input, lookups) {
  if (!input || typeof input !== 'object' || !lookups) throw new Error('Incoming details and downloaded customers are required.');
  const dated = String(input.dated || '');
  const date = new Date(`${dated}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dated) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dated) throw new Error('Choose a valid date.');
  const station = Number(input.station_id);
  if (!Number.isSafeInteger(station) || !lookups.stations.some(x => Number(x.id) === station && x.status === 'A')) throw new Error('Choose an active station.');
  const truck = String(input.truck || '').trim();
  if (!truck || truck.length > 30) throw new Error('Enter a truck number.');
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) throw new Error('Add between 1 and 100 bilties.');
  const seen = new Set();
  const money = (value, label) => { const s = String(value ?? '0').trim() || '0'; if (!/^\d{1,10}(\.\d{1,2})?$/.test(s)) throw new Error(`Enter a valid ${label}.`); return s; };
  const text = (value, label, max) => { const s = String(value ?? '').trim(); if (Array.from(s).length > max) throw new Error(`${label} is too long.`); return s; };
  const items = input.items.map(item => {
    const account = String(item.account_id || '');
    if (!lookups.accounts.some(x => String(x.id) === account && Number(x.customer) === 1 && x.status === 'A')) throw new Error('Choose an active customer.');
    const bilty = String(item.bilty || '').trim();
    if (!bilty || bilty.length > 40 || seen.has(bilty)) throw new Error('Enter a different bilty number for each row.');
    seen.add(bilty);
    const qty = Number(item.qty);
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > 999999) throw new Error('Quantity must be a whole number greater than zero.');
    return { account_id: account, bilty, qty, party_from: text(item.party_from, 'Party from', 100), party_to: text(item.party_to, 'Party to', 100), city: text(item.city, 'City', 80), contact: text(item.contact, 'Contact', 40), goods_type: text(item.goods_type, 'Goods type', 100), detail: text(item.detail, 'Description', 250), remarks: text(item.remarks, 'Bilty remarks', 250), bilty_amount: money(item.bilty_amount, 'bilty amount'), godown: money(item.godown, 'godown charge'), loading: money(item.loading, 'loading charge'), suzuki: money(item.suzuki, 'Suzuki charge'), advance: money(item.advance, 'advance'), service_advance: money(item.service_advance, 'service advance') };
  });
  return { kind: 'incoming', dated, station_id: station, truck, driver: text(input.driver, 'Driver name', 100), driver_mobile: text(input.driver_mobile, 'Driver mobile', 30), driver_cnic: text(input.driver_cnic, 'Driver CNIC', 30), challan: text(input.challan, 'Challan', 40), truck_amount: money(input.truck_amount, 'truck delivery amount'), labour_bonus: money(input.labour_bonus, 'labour bonus'), munshi_bonus: money(input.munshi_bonus, 'munshi bonus'), remarks: text(input.remarks, 'Shipment remarks', 500), items };
}
module.exports = { prepareIncoming };
