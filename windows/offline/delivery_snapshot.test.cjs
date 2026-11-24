'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { downloadPendingBilties, searchPendingBilties } = require('./delivery_snapshot.cjs');

test('downloads every page, excludes reserved bilties and supports search', async () => {
 const request=async (action,_body,params)=>action==='workspace_changes'?{status:200,body:{revision:4}}:{status:200,body:params.page===0?{page:0,page_size:2,total:3,rows:[{id:1,bilty:'100',customer:'Alpha'},{id:2,bilty:'200',delivery_submission_id:9}]}:{page:1,page_size:2,total:3,rows:[{id:3,bilty:'300',party_to:'Beta'}]}};
 const snapshot=await downloadPendingBilties(request);
 assert.equal(snapshot.rows.length,2);assert.equal(searchPendingBilties(snapshot,'beta')[0].id,3);assert.deepEqual(searchPendingBilties(snapshot,''),[]);
});
test('rejects changed, incomplete, duplicate and oversized snapshots', async () => {
 let revisions=0;
 await assert.rejects(downloadPendingBilties(async action=>action==='workspace_changes'?{status:200,body:{revision:++revisions}}:{status:200,body:{page:0,page_size:30,total:1,rows:[{id:1}]}}),/changed/);
 await assert.rejects(downloadPendingBilties(async action=>action==='workspace_changes'?{status:200,body:{revision:1}}:{status:200,body:{page:0,page_size:30,total:2,rows:[{id:1}]} }),/incomplete/);
 await assert.rejects(downloadPendingBilties(async action=>action==='workspace_changes'?{status:200,body:{revision:1}}:{status:200,body:{page:0,page_size:30,total:2,rows:[{id:1},{id:1}]} }),/duplicate/);
 await assert.rejects(downloadPendingBilties(async action=>action==='workspace_changes'?{status:200,body:{revision:1}}:{status:200,body:{page:0,page_size:30,total:10001,rows:[]} }),/incomplete/);
});
