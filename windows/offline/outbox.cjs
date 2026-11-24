'use strict';

// Local sync queue. This module does not apply transactions or connect to the
// server; integration requires server-side atomic idempotency and permissions.
const { DatabaseSync } = require('node:sqlite');
const { createHash, randomUUID } = require('node:crypto');

const STATES = new Set(['pending', 'sending', 'synced', 'conflict']);

class Outbox {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, action TEXT NOT NULL,
        payload TEXT NOT NULL, payload_hash TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending','sending','synced','conflict')),
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, result TEXT, error TEXT
      );
      CREATE INDEX IF NOT EXISTS outbox_user_status ON outbox(user_id,status,created_at,id);`);
  }

  enqueue(userId, action, payload, id = randomUUID()) {
    if (typeof userId !== 'string' || !userId || typeof action !== 'string' || !action ||
        typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new TypeError('A user, action, and valid operation UUID are required.');
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new TypeError('Payload must be an object.');
    const body = JSON.stringify(payload);
    const hash = createHash('sha256').update(body).digest('hex');
    const now = new Date().toISOString();
    this.db.prepare(`INSERT INTO outbox(id,user_id,action,payload,payload_hash,status,created_at,updated_at)
      VALUES(?,?,?,?,?,'pending',?,?)`).run(id, userId, action, body, hash, now, now);
    return id;
  }

  enqueueBatch(userId, operations) {
    if (!Array.isArray(operations) || operations.length === 0 || operations.length > 101) throw new Error('Invalid operation batch.');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const ids = operations.map(operation => this.enqueue(userId, operation.action, operation.payload, operation.id));
      this.db.exec('COMMIT');
      return ids;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  // Only replay the signed-in user's operations. A network failure must not
  // cause a new ID to be issued for an existing operation.
  claim(userId) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      // Preserve insertion order even when several entries share a timestamp.
      // An unresolved conflict stops later operations, which may depend on it.
      const row = this.db.prepare("SELECT * FROM outbox WHERE user_id=? AND status!='synced' ORDER BY rowid LIMIT 1").get(userId);
      if (row && row.status !== 'pending') {
        this.db.exec('COMMIT');
        return null;
      }
      if (row) this.db.prepare("UPDATE outbox SET status='sending',attempts=attempts+1,updated_at=? WHERE id=?").run(new Date().toISOString(), row.id);
      this.db.exec('COMMIT');
      return row ? { ...row, status: 'sending', attempts: row.attempts + 1, payload: JSON.parse(row.payload) } : null;
    } catch (err) { this.db.exec('ROLLBACK'); throw err; }
  }

  finish(userId, id, status, data = null) {
    if (!STATES.has(status) || !['pending', 'synced', 'conflict'].includes(status)) throw new TypeError('Invalid completion state.');
    const result = status === 'synced' ? JSON.stringify(data) : null;
    const error = status === 'conflict' ? JSON.stringify(data) : null;
    const changed = this.db.prepare("UPDATE outbox SET status=?,result=?,error=?,updated_at=? WHERE id=? AND user_id=? AND status='sending'")
      .run(status, result, error, new Date().toISOString(), id, userId);
    if (changed.changes !== 1) throw new Error('Operation is not being sent by this user.');
  }

  // Run on app startup when no previous sender can still be running.
  recoverInterrupted() {
    return this.db.prepare("UPDATE outbox SET status='pending',updated_at=? WHERE status='sending'").run(new Date().toISOString()).changes;
  }

  list(userId) {
    return this.db.prepare('SELECT id,action,status,created_at,updated_at,attempts,result,error FROM outbox WHERE user_id=? ORDER BY rowid').all(userId);
  }

  detail(userId, id) {
    const row = this.db.prepare('SELECT id,action,payload,status,created_at,updated_at,attempts,result,error FROM outbox WHERE user_id=? AND id=?').get(userId, id);
    if (!row) throw new Error('Queued entry not found.');
    return { ...row, payload: JSON.parse(row.payload), result: row.result ? JSON.parse(row.result) : null, error: row.error ? JSON.parse(row.error) : null };
  }

  resolveCustomer(userId, operationId) {
    const row = this.db.prepare("SELECT result FROM outbox WHERE user_id=? AND id=? AND action='incoming_customer_create' AND status='synced'").get(userId, operationId);
    if (!row || !row.result) throw new Error('The temporary customer has not synced.');
    const result = JSON.parse(row.result);
    if (typeof result.id !== 'string' || !result.id) throw new Error('The server did not return a customer ID.');
    return result.id;
  }

  retryConflict(userId, id) {
    // Preserve the exact operation and UUID: a previous response may have
    // been lost after the server committed it. Never create a replacement.
    const changed = this.db.prepare("UPDATE outbox SET status='pending',error=NULL,updated_at=? WHERE user_id=? AND id=? AND status='conflict'")
      .run(new Date().toISOString(), userId, id);
    if (changed.changes !== 1) throw new Error('Only your conflicting entries can be retried.');
  }

  updateUnsent(userId, id, action, payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new TypeError('Payload must be an object.');
    const body = JSON.stringify(payload), hash = createHash('sha256').update(body).digest('hex');
    // Never change a request that may have reached the server. Even a lost
    // response could mean it already committed under this UUID.
    const changed = this.db.prepare("UPDATE outbox SET payload=?,payload_hash=?,updated_at=? WHERE user_id=? AND id=? AND action=? AND status='pending' AND attempts=0")
      .run(body, hash, new Date().toISOString(), userId, id, action);
    if (changed.changes !== 1) throw new Error('Only entries not yet sent can be edited.');
  }

  close() { this.db.close(); }
}

module.exports = { Outbox };
