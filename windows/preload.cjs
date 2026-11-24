'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('apg', Object.freeze({
  login: (username, password) => ipcRenderer.invoke('login', username, password),
  loginOffline: (username, password) => ipcRenderer.invoke('login-offline', username, password),
  reconnect: (username, password) => ipcRenderer.invoke('reconnect', username, password),
  entries: () => ipcRenderer.invoke('entries'),
  entryDetail: id => ipcRenderer.invoke('entry-detail', id),
  retryEntry: id => ipcRenderer.invoke('retry-entry', id),
  incomingLookups: () => ipcRenderer.invoke('incoming-lookups'),
  searchDeliveryBilties: query => ipcRenderer.invoke('search-delivery-bilties', query),
  queueDelivery: input => ipcRenderer.invoke('queue-delivery', input),
  queueIncoming: input => ipcRenderer.invoke('queue-incoming', input),
  updateUnsentIncoming: (id, input) => ipcRenderer.invoke('update-unsent-incoming', id, input),
  sync: () => ipcRenderer.invoke('sync'),
  syncStatus: () => ipcRenderer.invoke('sync-status'),
  signout: () => ipcRenderer.invoke('signout'),
}));
