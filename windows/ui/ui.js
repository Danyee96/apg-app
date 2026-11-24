'use strict';
const $ = id => document.getElementById(id);
const message = text => { $('message').textContent = text; };
let customers = [];
let reviewedEntry = null;
let editingEntry = null;
const deliverySelection = new Map();
let statusTimer = null;
function shipmentDetails(data) {
  if (data.mode === 'temporary') return `Temporary customer: ${data.name || '—'}`;
  if (data.offline_delivery) return [`Delivery date: ${data.dated}`, `Receiver: ${data.receiver}`, `Bilties: ${data.items.length}`, ...data.items.map(item => `Bilty item ${item.id} · Loading Rs ${item.loading} · Suzuki Rs ${item.suzuki}`)].join('\n');
  const amount = value => `Rs ${value || '0'}`;
  const header = [`Date: ${data.dated || '—'}`, `Truck: ${data.truck || '—'}`, `Driver: ${data.driver || '—'}`, `Challan: ${data.challan || '—'}`, `Truck delivery: ${amount(data.truck_amount)}`, `Labour bonus: ${amount(data.labour_bonus)}`, `Munshi bonus: ${amount(data.munshi_bonus)}`];
  for (const item of data.items || []) header.push('', `Bilty ${item.bilty || '—'} · Customer ${item.account_id || '—'}`, `Quantity: ${item.qty} · Goods: ${item.goods_type || item.detail || '—'}`, `Bilty: ${amount(item.bilty_amount)} · Godown: ${amount(item.godown)}`, `Loading: ${amount(item.loading)} · Suzuki: ${amount(item.suzuki)}`, `Bilty advance: ${amount(item.advance)} · Service advance: ${amount(item.service_advance)}`);
  return header.join('\n');
}
function addBilty(values = null) {
  if ($('bilty-rows').children.length >= 100) { message('A shipment can contain at most 100 bilties.'); return; }
  const row = $('bilty-template').content.firstElementChild.cloneNode(true);
  const select = row.querySelector('[name="account_id"]');
  const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Choose a customer'; select.append(placeholder);
  const temporary = document.createElement('option'); temporary.value = '__new_temporary__'; temporary.textContent = 'Add a temporary customer'; select.append(temporary);
  for (const customer of customers) { const option = document.createElement('option'); option.value = customer.id; option.textContent = `${customer.name} (${customer.id})`; select.append(option); }
  select.addEventListener('change', () => { const show = select.value === '__new_temporary__'; row.querySelector('.new-customer').hidden = !show; row.querySelector('[name="new_customer_name"]').required = show; });
  if (values) for (const input of row.querySelectorAll('[name]')) if (values[input.name] !== undefined) input.value = String(values[input.name]);
  row.querySelector('.remove-bilty').addEventListener('click', () => { if ($('bilty-rows').children.length === 1) { message('Keep at least one bilty.'); return; } row.remove(); });
  $('bilty-rows').append(row);
}
async function refresh() {
  const rows = await window.apg.entries();
  const list = $('entries'); list.replaceChildren();
  if (!rows.length) { list.textContent = 'No queued entries for this account.'; return; }
  for (const row of rows) {
    const entry = document.createElement('div'); entry.className = 'entry';
    const title = document.createElement('strong'); title.textContent = row.action === 'save_shipment' ? 'Incoming goods' : row.action === 'incoming_customer_create' ? 'Temporary customer' : row.action === 'save_unified_delivery' ? 'Standard delivery' : row.action;
    const status = document.createElement('span'); status.textContent = row.status;
    const date = document.createElement('small'); date.textContent = new Date(row.created_at).toLocaleString();
    const view = document.createElement('button'); view.type = 'button'; view.className = 'secondary'; view.textContent = 'View details';
    view.addEventListener('click', async () => { try { const detail = await window.apg.entryDetail(row.id); reviewedEntry = detail.id; $('entry-error').textContent = detail.error ? `Needs review: ${detail.error.message}` : `Status: ${detail.status}`; $('entry-payload').textContent = shipmentDetails(detail.payload); $('retry-entry').hidden = detail.status !== 'conflict'; $('edit-entry').hidden = detail.action !== 'save_shipment' || detail.status !== 'pending' || detail.attempts !== 0 || detail.payload.items.some(item => item.account_id.startsWith('offline-customer:')); $('entry-detail').hidden = false; } catch { message('Could not load this entry. Sign in again.'); } });
    entry.append(title, status, date, view); list.append(entry);
  }
}
$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true; message('Signing in…');
  try { const user = await (button.value === 'offline' ? window.apg.loginOffline($('username').value, $('password').value) : window.apg.login($('username').value, $('password').value)); $('password').value = ''; $('account').textContent = `Signed in as ${user.name}${user.offline ? ' · Offline' : ' · Online'}`; $('sync').disabled = !!user.offline; $('reconnect-form').hidden = !user.offline; $('reconnect-username').value=$('username').value; $('login').hidden = true; $('workspace').hidden = false; const today=new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); $('delivery-date').value=today; deliverySelection.clear(); $('delivery-selected').textContent='No bilties selected.'; const refs = await window.apg.incomingLookups(); $('incoming').hidden = !refs; if (refs) { const select=$('station'); select.replaceChildren(); for (const row of refs.stations) { const option=document.createElement('option'); option.value=row.id; option.textContent=`${row.name} (${row.id})`; select.append(option); } customers=refs.customers; $('bilty-rows').replaceChildren(); addBilty(); $('dated').value = today; } await refresh(); clearInterval(statusTimer); statusTimer=setInterval(async()=>{ try { const status=await window.apg.syncStatus(); $('sync-status').textContent=`Automatic sync: ${status.state}`; if(status.state==='authentication'){ $('sync').disabled=true; $('reconnect-form').hidden=false; } await refresh(); } catch { $('sync-status').textContent='Sign in again to continue.'; clearInterval(statusTimer); } },5000); message(user.offline ? 'Offline mode: sign in online to sync saved entries.' : ''); }
  catch { $('password').value = ''; message('Sign in failed. Check your connection and credentials.'); }
  finally { button.disabled = false; }
});
$('sync').addEventListener('click', async event => {
  event.currentTarget.disabled = true; message('Syncing…');
  try { const result = await window.apg.sync(); await refresh(); message(`Synced: ${result.synced}. Status: ${result.stopped}.`); }
  catch { message('Sync could not start. Sign in again and check your connection.'); }
  finally { event.currentTarget.disabled = false; }
});
$('reconnect-form').addEventListener('submit', async event => {
  event.preventDefault(); event.submitter.disabled=true;
  try { const result=await window.apg.reconnect($('reconnect-username').value,$('reconnect-password').value); $('reconnect-password').value=''; $('reconnect-form').hidden=true; $('sync').disabled=false; if (!result.canCreateIncoming) $('incoming').hidden=true; message('Online sign-in complete. Sync will run automatically.'); }
  catch { $('reconnect-password').value=''; message('Reconnect failed. Check your connection and use the same account.'); }
  finally { event.submitter.disabled=false; }
});
$('signout').addEventListener('click', async () => { try { await window.apg.signout(); clearInterval(statusTimer); $('sync-status').textContent=''; $('workspace').hidden = true; $('login').hidden = false; $('entries').replaceChildren(); $('entry-payload').textContent = ''; $('entry-detail').hidden = true; reviewedEntry = null; editingEntry = null; $('cancel-edit').hidden = true; $('save-incoming').textContent = 'Save shipment to this computer'; message('Signed out.'); } catch { message('Wait for sync to finish before signing out.'); } });
$('close-entry').addEventListener('click', () => { $('entry-detail').hidden = true; $('entry-payload').textContent = ''; reviewedEntry = null; });
$('edit-entry').addEventListener('click', async () => { try { const detail = await window.apg.entryDetail(reviewedEntry); if (detail.status !== 'pending' || detail.attempts !== 0) throw new Error(); const data = detail.payload; $('dated').value=data.dated; $('station').value=String(data.station_id); $('truck').value=data.truck; for (const input of $('incoming-form').querySelectorAll(':scope > label [name]')) input.value = data[input.name] ?? ''; $('bilty-rows').replaceChildren(); for (const item of data.items) addBilty(item); editingEntry=detail.id; $('save-incoming').textContent='Save changes to this computer'; $('cancel-edit').hidden=false; $('entry-detail').hidden=true; $('incoming-form').scrollIntoView({behavior:'smooth'}); message('Editing an unsent entry. Sync may start before you save.'); } catch { message('This entry is no longer available for editing.'); } });
$('cancel-edit').addEventListener('click', () => { editingEntry=null; $('incoming-form').reset(); $('bilty-rows').replaceChildren(); addBilty(); $('save-incoming').textContent='Save shipment to this computer'; $('cancel-edit').hidden=true; message('Edit cancelled. The saved entry was not changed.'); });
$('retry-entry').addEventListener('click', async () => { try { if (!reviewedEntry) return; await window.apg.retryEntry(reviewedEntry); $('entry-detail').hidden = true; $('entry-payload').textContent = ''; reviewedEntry = null; await refresh(); message('Entry queued for retry. Sign in online and use Sync now.'); } catch { message('Could not queue this entry for retry.'); } });
$('add-bilty').addEventListener('click', addBilty);
$('delivery-query').addEventListener('input', async event => {
  const query=event.target.value, results=$('delivery-results');
  try { const data=await window.apg.searchDeliveryBilties(query); if (query!==$('delivery-query').value) return; results.replaceChildren(); $('delivery-snapshot-status').textContent=data ? `Snapshot downloaded: ${new Date(data.downloadedAt).toLocaleString()}` : 'No delivery snapshot available for this account. Sign in online to download one.'; if (!data) return; for (const row of data.rows) { const item=document.createElement('div'); item.className='entry'; const name=document.createElement('strong'); name.textContent=`${row.bilty} · ${row.customer || '—'}`; const info=document.createElement('span'); info.textContent=`${row.station || '—'} · ${row.dated || '—'} · Qty ${row.qty || 0}`; const select=document.createElement('button'); select.type='button'; select.className='secondary'; select.textContent=deliverySelection.has(row.id)?'Remove':'Select'; select.addEventListener('click',()=>{ if(deliverySelection.has(row.id))deliverySelection.delete(row.id);else deliverySelection.set(row.id,row.bilty); select.textContent=deliverySelection.has(row.id)?'Remove':'Select'; $('delivery-selected').textContent=deliverySelection.size?`Selected: ${Array.from(deliverySelection.values()).join(', ')}`:'No bilties selected.'; }); item.append(name,info,select); results.append(item); } } catch { results.replaceChildren(); $('delivery-snapshot-status').textContent='Sign in again to search.'; }
});
$('delivery-form').addEventListener('submit',async event=>{ event.preventDefault(); event.submitter.disabled=true; try { await window.apg.queueDelivery({dated:$('delivery-date').value,receiver:$('delivery-receiver').value,mobile:$('delivery-mobile').value,cnic:$('delivery-cnic').value,remarks:$('delivery-remarks').value,items:Array.from(deliverySelection.keys())}); deliverySelection.clear(); $('delivery-selected').textContent='No bilties selected.'; $('delivery-results').replaceChildren(); await refresh(); message('Delivery saved on this computer. Sync is still required.'); } catch(error){ message(error.message || 'Could not save this delivery.'); } finally {event.submitter.disabled=false;} });
$('incoming-form').addEventListener('submit', async event => {
  event.preventDefault(); event.submitter.disabled = true;
  try { const items = Array.from($('bilty-rows').children, row => Object.fromEntries(Array.from(row.querySelectorAll('[name]'), input => [input.name, input.value]))); const header = Object.fromEntries(Array.from($('incoming-form').querySelectorAll(':scope > label [name]'), input => [input.name, input.value])); const payload = { ...header, dated: $('dated').value, station_id: $('station').value, truck: $('truck').value, items }; if (editingEntry) await window.apg.updateUnsentIncoming(editingEntry, payload); else await window.apg.queueIncoming(payload); editingEntry=null; $('save-incoming').textContent='Save shipment to this computer'; $('cancel-edit').hidden=true; $('bilty-rows').replaceChildren(); addBilty(); await refresh(); message('Shipment saved on this computer. Sync is still required.'); }
  catch (error) { message(error.message || 'Could not save the entry.'); }
  finally { event.submitter.disabled = false; }
});
