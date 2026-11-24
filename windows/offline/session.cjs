'use strict';

// In-memory session only. Queued business operations must never contain login
// credentials; the caller must ask the user to sign in again after restart.
class ApiSession {
  constructor(baseUrl, { fetchImpl = fetch, allowLocalHttp = false } = {}) {
    const url = new URL(baseUrl);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(allowLocalHttp && local && url.protocol === 'http:'))) {
      throw new Error('The API must use HTTPS without credentials or query parameters.');
    }
    this.baseUrl = url;
    this.fetch = fetchImpl;
    this.cookie = '';
    this.csrf = '';
    this.userId = null;
  }

  async raw(action, payload, params = {}) {
    const url = new URL(this.baseUrl);
    url.searchParams.set('action', action);
    for (const [key, value] of Object.entries(params)) { if (key === 'action') throw new Error('Invalid query parameter.'); url.searchParams.set(key, String(value)); }
    const headers = { Accept: 'application/json' };
    if (this.cookie) headers.Cookie = this.cookie;
    if (payload !== undefined) { headers['Content-Type'] = 'application/json'; headers['X-CSRF-Token'] = this.csrf; }
    const response = await this.fetch(url, { method: payload === undefined ? 'GET' : 'POST', headers, redirect: 'error', ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const match = /(?:^|,\s*)APGSESSION=([^;,]*)/.exec(setCookie);
      if (match) this.cookie = `APGSESSION=${match[1]}`;
    }
    let body;
    try { body = await response.json(); } catch { body = null; }
    return { status: response.status, body };
  }

  async login(username, password) {
    this.clear();
    try {
      const initial = await this.raw('session');
      if (initial.status !== 200 || typeof initial.body?.csrf !== 'string' || !this.cookie) throw new Error('Unable to start an authenticated session.');
      this.csrf = initial.body.csrf;
      const login = await this.raw('login', { username, password });
      if (login.status !== 200 || login.body?.ok !== true) throw new Error('Sign-in failed.');
      // Login rotates the session cookie. Obtain identity from the server,
      // never from the username or a locally supplied user ID.
      const current = await this.raw('session');
      if (current.status !== 200 || !Number.isSafeInteger(current.body?.profile?.id) || typeof current.body?.csrf !== 'string') throw new Error('Unable to verify the signed-in user.');
      this.userId = String(current.body.profile.id);
      this.csrf = current.body.csrf;
      return { userId: this.userId, profile: current.body.profile };
    } catch (error) { this.clear(); throw error; }
  }

  async requestForUser(userId, action, payload, params = {}) {
    if (this.userId === null || String(userId) !== this.userId) throw new Error('Sign in as the user who created these entries.');
    const result = await this.raw(action, payload, params);
    if (result.status === 401 || result.status === 403 && result.body?.code !== 'permission_denied' && /session|csrf/i.test(result.body?.error ?? '')) this.clear();
    return result;
  }

  clear() { this.cookie = ''; this.csrf = ''; this.userId = null; }
}

module.exports = { ApiSession };
