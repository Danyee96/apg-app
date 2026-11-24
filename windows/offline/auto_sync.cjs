'use strict';

// The desktop supplies the authenticated session and queue runner. No timer
// may overlap another sync, and stopping invalidates already-scheduled work.
class AutoSync {
  constructor(run, { setTimer = setTimeout, clearTimer = clearTimeout, intervalMs = 30000 } = {}) {
    if (typeof run !== 'function' || !Number.isSafeInteger(intervalMs) || intervalMs < 1000) throw new TypeError('Invalid sync configuration.');
    this.run = run; this.setTimer = setTimer; this.clearTimer = clearTimer; this.intervalMs = intervalMs;
    this.timer = null; this.running = false; this.enabled = false; this.generation = 0;
    this.status = { state: 'stopped', synced: 0, lastAttempt: null };
  }
  start() {
    if (this.enabled) return;
    this.enabled = true; this.generation++; this.status = { ...this.status, state: 'waiting' }; this.schedule(0);
  }
  stop() {
    this.enabled = false; this.generation++;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null; this.status = { ...this.status, state: 'stopped' };
  }
  schedule(delay) {
    if (!this.enabled || this.timer !== null) return;
    const generation = this.generation;
    this.timer = this.setTimer(() => { this.timer = null; if (this.enabled && generation === this.generation) void this.tick(generation); }, delay);
  }
  async tick(generation = this.generation) {
    if (!this.enabled || this.running || generation !== this.generation) return;
    this.running = true; this.status = { ...this.status, state: 'syncing', lastAttempt: new Date().toISOString() };
    try {
      const result = await this.run();
      if (generation !== this.generation) return;
      this.status = { state: result.stopped, synced: result.synced, lastAttempt: this.status.lastAttempt };
      // A conflict or expired login requires user action; do not repeatedly
      // retry or silently discard the operation.
      if (result.stopped === 'conflict' || result.stopped === 'authentication') { this.enabled = false; return; }
    } catch {
      if (generation === this.generation) this.status = { ...this.status, state: 'retry' };
    } finally {
      this.running = false;
      if (this.enabled && generation === this.generation) this.schedule(this.intervalMs);
    }
  }
  snapshot() { return { ...this.status }; }
}
module.exports = { AutoSync };
