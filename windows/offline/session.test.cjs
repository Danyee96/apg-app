'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ApiSession } = require('./session.cjs');

function mockResponse(status, body, cookie = null) {
  return { status, headers: { get: key => key === 'set-cookie' ? cookie : null }, json: async () => body };
}
test('login rotates session and binds requests to server verified user', async () => {
  let calls = 0;
  const session = new ApiSession('https://example.test/api.php', { fetchImpl: async (url, options) => {
    calls++;
    if (calls === 1) return mockResponse(200, { csrf: 'initial' }, 'APGSESSION=first; Path=/');
    if (calls === 2) { assert.equal(options.headers['X-CSRF-Token'], 'initial'); return mockResponse(200, { ok: true }, 'APGSESSION=rotated; Path=/'); }
    if (calls === 3) { assert.equal(options.headers.Cookie, 'APGSESSION=rotated'); return mockResponse(200, { csrf: 'new', profile: { id: 7 } }); }
    assert.equal(options.headers.Cookie, 'APGSESSION=rotated');
    assert.equal(options.headers['X-CSRF-Token'], 'new');
    return mockResponse(200, { ok: true });
  }});
  assert.equal((await session.login('munshi', 'secret')).userId, '7');
  await assert.rejects(session.requestForUser('8', 'save_shipment', {}));
  assert.equal((await session.requestForUser('7', 'save_shipment', {})).status, 200);
  assert.equal(JSON.stringify(session).includes('secret'), false);
});
test('rejects insecure remote URLs and clears failed authentication', async () => {
  assert.throws(() => new ApiSession('http://example.test/api.php'));
  assert.throws(() => new ApiSession('https://user:password@example.test/api.php'));
  assert.throws(() => new ApiSession('https://example.test/api.php?token=secret'));
  let calls = 0;
  const session = new ApiSession('http://127.0.0.1/api.php', { allowLocalHttp: true, fetchImpl: async () => ++calls === 1 ? mockResponse(200, { csrf: 'x' }, 'APGSESSION=x') : mockResponse(401, {}) });
  await assert.rejects(session.login('user', 'bad'));
  assert.equal(session.cookie, ''); assert.equal(session.csrf, ''); assert.equal(session.userId, null);
});
