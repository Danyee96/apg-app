'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCipheriv, createDecipheriv, randomBytes } = require('node:crypto');
const { OfflineIdentity } = require('./offline_identity.cjs');
const key = randomBytes(32);
const provider = { isEncryptionAvailable: () => true, encryptString: value => { const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,iv), encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]); return Buffer.concat([iv,cipher.getAuthTag(),encrypted]); }, decryptString: value => { const decipher=createDecipheriv('aes-256-gcm',key,value.subarray(0,12)); decipher.setAuthTag(value.subarray(12,28)); return Buffer.concat([decipher.update(value.subarray(28)),decipher.final()]).toString('utf8'); } };
const user = { id: 5, username: 'munshi', full_name: 'Test', role: 'operations', active: 1, permissions: ['incoming.create'] };
const lookups = { accounts: [{ id:'a',name:'Customer',customer:1,status:'A',phone:'private' }], stations: [{ id:1,name:'Station',status:'A' }] };
test('offline sign-in uses encrypted snapshot and limits access lifetime', () => {
 let now=1000;const auth=new OfflineIdentity(':memory:',provider,()=>now);
 auth.provision('Munshi','secret',user,lookups,10000);
 const raw=auth.db.prepare('SELECT encrypted FROM offline_identity').get().encrypted;
 assert.equal(Buffer.from(raw).includes(Buffer.from('secret')),false);
 const result=auth.authenticate('munshi','secret');assert.equal(result.user.id,5);assert.equal(result.lookups.accounts[0].phone,undefined);
 now+=10000;assert.throws(()=>auth.authenticate('munshi','secret'),/expired/);auth.close();
});
test('incorrect passwords lock the account temporarily and cannot reveal snapshot', () => {
 let now=1000;const auth=new OfflineIdentity(':memory:',provider,()=>now);auth.provision('munshi','correct',user,lookups);
 for(let i=0;i<5;i++)assert.throws(()=>auth.authenticate('munshi','incorrect'),/failed/);
 assert.throws(()=>auth.authenticate('munshi','correct'),/locked/);
 now+=15*60*1000;assert.equal(auth.authenticate('munshi','correct').user.id,5);auth.close();
});
test('unavailable OS encryption and disabled user cannot be provisioned', () => {
 assert.throws(()=>new OfflineIdentity(':memory:',{...provider,isEncryptionAvailable:()=>false}));
 const auth=new OfflineIdentity(':memory:',provider);assert.throws(()=>auth.provision('u','p',{...user,active:0},lookups));auth.close();
});
