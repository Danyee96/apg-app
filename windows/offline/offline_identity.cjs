'use strict';
const { randomBytes, scryptSync, timingSafeEqual, createHash } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

// The caller provides an OS-backed encryption provider (Electron safeStorage on
// Windows). This module does not enable offline login in the desktop shell yet.
class OfflineIdentity {
  constructor(path, cryptoProvider, now = () => Date.now()) {
    if (!cryptoProvider || typeof cryptoProvider.encryptString !== 'function' || typeof cryptoProvider.decryptString !== 'function' || !cryptoProvider.isEncryptionAvailable()) throw new Error('Operating system encryption is unavailable.');
    this.crypto = cryptoProvider; this.now = now; this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS offline_identity (
        key TEXT PRIMARY KEY, encrypted BLOB NOT NULL,
        failures INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0
      )`);
  }
  key(username) {
    if (typeof username !== 'string' || !username.trim() || username.length > 100) throw new Error('Invalid username.');
    return createHash('sha256').update(username.trim().toLowerCase(), 'utf8').digest('hex');
  }
  provision(username, password, user, lookups, ttlMs = 24 * 60 * 60 * 1000) {
    if (typeof password !== 'string' || !password || password.length > 128 || !user || !Number.isSafeInteger(user.id) || user.active !== 1 || !Array.isArray(user.permissions)) throw new Error('A verified active user is required.');
    if (!lookups || !Array.isArray(lookups.accounts) || !Array.isArray(lookups.stations)) throw new Error('User lookups are required.');
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > 24 * 60 * 60 * 1000) throw new Error('Invalid offline access duration.');
    const salt = randomBytes(16), verifier = scryptSync(password, salt, 32);
    // Retain only fields required for the incoming-goods preview.
    const snapshot = { version: 1, user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role, permissions: user.permissions },
      lookups: { accounts: lookups.accounts.filter(x => Number(x.customer) === 1).map(({ id, name, customer, status }) => ({ id, name, customer, status })), stations: lookups.stations.map(({ id, name, status }) => ({ id, name, status })), ...(lookups.delivery_snapshot && (user.role === 'super_admin' || user.permissions.includes('deliveries.create')) ? { delivery_snapshot: lookups.delivery_snapshot } : {}) },
      salt: salt.toString('base64'), verifier: verifier.toString('base64'), expires: this.now() + ttlMs };
    const encrypted = this.crypto.encryptString(JSON.stringify(snapshot));
    this.db.prepare('INSERT INTO offline_identity(key,encrypted,failures,locked_until) VALUES(?,?,0,0) ON CONFLICT(key) DO UPDATE SET encrypted=excluded.encrypted,failures=0,locked_until=0').run(this.key(username), encrypted);
  }
  authenticate(username, password) {
    if (typeof password !== 'string' || !password || password.length > 128) throw new Error('Offline sign-in failed.');
    const key = this.key(username), row = this.db.prepare('SELECT * FROM offline_identity WHERE key=?').get(key);
    if (!row) throw new Error('Offline sign-in failed.');
    if (row.locked_until > this.now()) throw new Error('Offline sign-in is temporarily locked.');
    let snapshot;
    try { snapshot = JSON.parse(this.crypto.decryptString(Buffer.from(row.encrypted))); }
    catch { throw new Error('Offline sign-in is unavailable. Sign in online.'); }
    if (snapshot.version !== 1 || !Number.isSafeInteger(snapshot.expires) || snapshot.expires <= this.now()) throw new Error('Offline access expired. Sign in online.');
    let expected, actual;
    try { expected = Buffer.from(snapshot.verifier, 'base64'); actual = scryptSync(password, Buffer.from(snapshot.salt, 'base64'), 32); }
    catch { throw new Error('Offline sign-in is unavailable. Sign in online.'); }
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      const failures = row.failures + 1;
      this.db.prepare('UPDATE offline_identity SET failures=?,locked_until=? WHERE key=?').run(failures >= 5 ? 0 : failures, failures >= 5 ? this.now() + 15 * 60 * 1000 : 0, key);
      throw new Error('Offline sign-in failed.');
    }
    this.db.prepare('UPDATE offline_identity SET failures=0,locked_until=0 WHERE key=?').run(key);
    return { user: snapshot.user, lookups: snapshot.lookups, expires: snapshot.expires };
  }
  remove(username) { this.db.prepare('DELETE FROM offline_identity WHERE key=?').run(this.key(username)); }
  close() { this.db.close(); }
}
module.exports = { OfflineIdentity };
