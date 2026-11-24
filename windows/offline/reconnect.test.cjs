'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { reconnect } = require('./reconnect.cjs');

test('reconnect accepts only the user who owns the offline queue', async () => {
 let cleared=0;const session={login:async()=>({userId:'7'}),clear:()=>{cleared++;}};
 assert.equal((await reconnect(session,'7','user','password')).userId,'7');
 await assert.rejects(reconnect(session,'8','user','password'),/same account/);
 assert.equal(cleared,1);
});
test('failed authentication clears the online session', async () => {
 let cleared=0;const session={login:async()=>{throw new Error('invalid');},clear:()=>{cleared++;}};
 await assert.rejects(reconnect(session,'7','user','bad'));assert.equal(cleared,1);
});
