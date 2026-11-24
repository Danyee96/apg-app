'use strict';
const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const path = require('node:path');
const { Outbox } = require('./offline/outbox.cjs');
const { ApiSession } = require('./offline/session.cjs');
const { incomingTransport } = require('./offline/customer_transport.cjs');
const { syncPending } = require('./offline/sync.cjs');
const { queueIncoming } = require('./offline/queue_incoming.cjs');
const { prepareIncoming } = require('./offline/incoming.cjs');
const { OfflineIdentity } = require('./offline/offline_identity.cjs');
const { AutoSync } = require('./offline/auto_sync.cjs');
const { reconnect } = require('./offline/reconnect.cjs');
const { downloadPendingBilties, searchPendingBilties } = require('./offline/delivery_snapshot.cjs');
const { queueDelivery } = require('./offline/queue_delivery.cjs');

// Development shell only: full offline workflows are not ready.
const api = new ApiSession('https://azadpakistangoods.com/api.php');
let queue, identity = null, principal = null, syncing = false, lookups = null, canCreateIncoming = false, canCreateDelivery = false;
const autoSync = new AutoSync(() => runSync());
function activeUser() {
  if (!principal || principal.expires && Date.now() >= principal.expires) throw new Error('Offline access expired. Sign in online.');
  return principal.id;
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.whenReady().then(() => {
    queue = new Outbox(path.join(app.getPath('userData'), 'offline-queue.sqlite'));
    queue.recoverInterrupted();
    if (safeStorage.isEncryptionAvailable()) identity = new OfflineIdentity(path.join(app.getPath('userData'), 'offline-identity.sqlite'), safeStorage);
    const win = new BrowserWindow({ width: 1100, height: 760, minWidth: 680, minHeight: 500,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, url) => { if (url !== win.webContents.getURL()) event.preventDefault(); });
    win.loadFile(path.join(__dirname, 'ui', 'index.html'));
    app.on('second-instance', () => { if (win.isMinimized()) win.restore(); win.focus(); });
  });
}

ipcMain.handle('login', async (_event, username, password) => {
  if (typeof username !== 'string' || typeof password !== 'string' || username.length > 100 || password.length > 128) throw new Error('Enter a valid username and password.');
  autoSync.stop(); principal = null; lookups = null; canCreateIncoming = false; canCreateDelivery = false;
  const result = await api.login(username, password);
  canCreateIncoming = result.profile.role === 'super_admin' || (result.profile.permissions || []).includes('incoming.create');
  canCreateDelivery = result.profile.role === 'super_admin' || (result.profile.permissions || []).includes('deliveries.create');
  if (!canCreateIncoming && !canCreateDelivery && identity) identity.remove(username);
  lookups = null;
  if (canCreateIncoming || canCreateDelivery) {
    const refs = await api.requestForUser(result.userId, 'lookups');
    if (refs.status === 200 && Array.isArray(refs.body?.stations) && Array.isArray(refs.body?.accounts)) {
      lookups = refs.body;
      if (canCreateDelivery) {
        try { lookups.delivery_snapshot = await downloadPendingBilties((action, payload, params) => api.requestForUser(result.userId, action, payload, params)); }
        catch { lookups.delivery_snapshot = null; }
      }
      if (identity) identity.provision(username, password, result.profile, lookups);
    }
  }
  principal = { id: result.userId, expires: null };
  autoSync.start();
  return { userId: result.userId, name: result.profile.full_name || result.profile.username, offline: false };
});
ipcMain.handle('login-offline', (_event, username, password) => {
  if (!identity) throw new Error('Offline sign-in is unavailable on this device.');
  autoSync.stop(); api.clear(); principal = null; lookups = null; canCreateIncoming = false; canCreateDelivery = false;
  const result = identity.authenticate(username, password);
  principal = { id: String(result.user.id), expires: result.expires };
  lookups = result.lookups;
  canCreateIncoming = result.user.role === 'super_admin' || result.user.permissions.includes('incoming.create');
  canCreateDelivery = result.user.role === 'super_admin' || result.user.permissions.includes('deliveries.create');
  return { userId: principal.id, name: result.user.full_name || result.user.username, offline: true, expires: result.expires };
});
ipcMain.handle('reconnect', async (_event, username, password) => {
  const userId = activeUser();
  if (syncing) throw new Error('Wait for sync to finish.');
  const result = await reconnect(api, userId, username, password);
  canCreateIncoming = result.profile.role === 'super_admin' || (result.profile.permissions || []).includes('incoming.create');
  canCreateDelivery = result.profile.role === 'super_admin' || (result.profile.permissions || []).includes('deliveries.create');
  if (!canCreateIncoming && !canCreateDelivery) { lookups = null; if (identity) identity.remove(username); }
  else if (identity && lookups) identity.provision(username, password, result.profile, lookups);
  principal.expires = null;
  // Keep the local principal and current form intact. The server rechecks the
  // current account permissions whenever a queued operation is submitted.
  autoSync.start();
  return { ok: true, canCreateIncoming };
});
ipcMain.handle('entries', () => queue.list(activeUser()));
ipcMain.handle('search-delivery-bilties', (_event, query) => {
  activeUser();
  if (!canCreateDelivery || !lookups?.delivery_snapshot || typeof query !== 'string' || query.length > 100) return null;
  return { downloadedAt: lookups.delivery_snapshot.downloadedAt, rows: searchPendingBilties(lookups.delivery_snapshot, query) };
});
ipcMain.handle('queue-delivery', (_event, input) => {
  const userId = activeUser();
  if (!canCreateDelivery || !lookups?.delivery_snapshot) throw new Error('A delivery snapshot and permission are required.');
  return queueDelivery(queue, userId, input, lookups.delivery_snapshot);
});
ipcMain.handle('entry-detail', (_event, id) => {
  if (typeof id !== 'string' || id.length > 100) throw new Error('Invalid entry.');
  return queue.detail(activeUser(), id);
});
ipcMain.handle('retry-entry', (_event, id) => {
  if (syncing) throw new Error('Wait for sync to finish.');
  if (typeof id !== 'string' || id.length > 100) throw new Error('Invalid entry.');
  queue.retryConflict(activeUser(), id);
  if (api.userId === principal.id) autoSync.start();
});
ipcMain.handle('incoming-lookups', () => activeUser() && canCreateIncoming && lookups ? {
  stations: lookups.stations.filter(x => x.status === 'A').map(({ id, name }) => ({ id, name })),
  customers: lookups.accounts.filter(x => x.status === 'A' && Number(x.customer) === 1).map(({ id, name }) => ({ id, name })),
} : null);
ipcMain.handle('queue-incoming', (_event, input) => {
  const userId = activeUser();
  if (!canCreateIncoming || !lookups) throw new Error('Sign in and download incoming-goods details first.');
  return queueIncoming(queue, userId, input, lookups);
});
ipcMain.handle('update-unsent-incoming', (_event, id, input) => {
  const userId = activeUser();
  if (!canCreateIncoming || !lookups || typeof id !== 'string' || id.length > 100) throw new Error('Incoming edit is unavailable.');
  if (!Array.isArray(input?.items) || input.items.some(item => typeof item.account_id !== 'string' || item.account_id.startsWith('offline-customer:') || item.account_id === '__new_temporary__')) throw new Error('Entries with new temporary customers cannot be edited here yet.');
  const payload = prepareIncoming(input, lookups);
  queue.updateUnsent(userId, id, 'save_shipment', payload);
});
async function runSync() {
  const userId = activeUser();
  if (api.userId !== userId) throw new Error('Sign in online to sync.');
  if (syncing) throw new Error('Sync is already running.');
  syncing = true;
  try { return await syncPending(queue, userId, incomingTransport((action, payload) => api.requestForUser(userId, action, payload), id => queue.resolveCustomer(userId, id))); }
  finally { syncing = false; }
}
ipcMain.handle('sync', runSync);
ipcMain.handle('sync-status', () => { activeUser(); return autoSync.snapshot(); });
ipcMain.handle('signout', () => { if (syncing) throw new Error('Wait for sync to finish.'); autoSync.stop(); api.clear(); principal = null; lookups = null; canCreateIncoming = false; canCreateDelivery = false; });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { autoSync.stop(); if (queue) queue.close(); if (identity) identity.close(); api.clear(); });
