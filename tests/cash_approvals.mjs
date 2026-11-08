import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
try{
 const admin=await browser.newPage(),ops=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 for(const page of [admin,ops])page.on('pageerror',e=>errors.push(e.message));
 async function login(page,username,password){await page.goto(process.env.APG_TEST_URL);await page.locator('#f-username').fill(username);await page.locator('#f-password').fill(password);await page.locator('#auth-form [type="submit"]').click();await page.locator('.nav-link[data-view="navigation"]').waitFor();}
 await login(admin,'integration-review',process.env.APG_TEST_PASSWORD);
 const setup=await admin.evaluate(async()=>{
  await api('save_user',{username:'ui-cash-ops',full_name:'UI cash collector',role:'operations',active:1,permissions:['deliveries.create'],password:'UI-cash-operator-2026'});
  const station=lookups.stations.find(row=>row.status==='A').id,customer=(await api('save_customer',{name:'UI approved cash customer',group_code:'116'})).id;
  const result=await api('save_shipment',{kind:'incoming',dated:today(),station_id:station,truck:'UI-CASH-APPROVAL',items:[{account_id:customer,bilty:'UI-CASH-APPROVAL',qty:1,bilty_amount:'200',godown:'70'}]});
  const item=(await api('shipment',null,{id:result.id})).items[0];await navigate('pending-cash');await refreshSharedWorkspace();return item;
 });
 await login(ops,'ui-cash-ops','UI-cash-operator-2026');
 await ops.evaluate(item=>{selected.clear();selected.set(item.id,item);recordDelivery();},setup);
 await ops.locator('#delivery-form [name="delivery_mode"]').selectOption('walkin');
 await ops.locator('#delivery-form [name="receiver"]').fill('Cash review receiver');
 assert.ok(await ops.locator('#delivery-form [name="walkin_cash_account"] option').count()>0);
 await ops.locator('#delivery-form [name^="bilty_received_"]').fill('200');
 const savedResponse=ops.waitForResponse(r=>r.url().includes('action=save_delivery')&&r.request().method()==='POST');
 await ops.getByRole('button',{name:'Save delivery & submit cash',exact:true}).click();
 const saved=await (await savedResponse).json(),id=saved.id;assert.equal(saved.pending_cash,true);
 await ops.getByRole('heading',{name:'Pending cash collections',exact:true}).waitFor();
 assert.equal(await ops.locator('#delivery-cash-form').count(),0);
 assert.ok((await ops.locator('#main').innerText()).includes('200.00'));assert.ok((await ops.locator('#main').innerText()).includes('Walk-in delivery'));
 assert.equal((await admin.evaluate(id=>api('delivery',null,{id}),id)).cash_summary.received,0);
 assert.equal((await admin.evaluate(()=>api('delivery_cash_list',null,{search:'Cash review receiver'}))).rows.length,0);
 await ops.locator('#main [data-action="review-pending-cash"]').click();await ops.locator('#delivery-cash-form').waitFor();
 assert.equal(await ops.locator('#delivery-cash-form [type="submit"]').isDisabled(),true);
 assert.ok((await ops.locator('#cash-collect-summary').innerText()).includes('200.00'));
 await admin.locator('#main [data-action="review-pending-cash"]').first().waitFor({timeout:25000});await admin.locator('#main [data-action="review-pending-cash"]').first().click();await admin.locator('#delivery-cash-form').waitFor();
 assert.equal(await admin.locator('#delivery-cash-form [name^="bilty_received_"]').inputValue(),'200.00');
 await admin.locator('#delivery-cash-form [name^="bilty_received_"]').fill('220');
 await admin.getByRole('button',{name:'Approve cash collection',exact:true}).click();await admin.locator('#modal .summary-row').filter({hasText:'220.00'}).waitFor();
 const invoice=await admin.evaluate(id=>api('delivery_cash_invoice',null,{id}),id);assert.equal(invoice.received,22000);assert.equal(invoice.outstanding,5000);assert.equal(invoice.receipts[0].created_by,'ui-cash-ops');
 assert.equal((await ops.evaluate(()=>api('pending_cash_collections'))).rows.length,0);
 assert.equal((await admin.evaluate(()=>api('delivery_cash_list',null,{search:'Cash review receiver'}))).rows.length,1);
 await ops.locator('[data-action="close-modal"]').first().click();await ops.locator('#app-language').selectOption('ur');await ops.evaluate(()=>navigate('pending-cash'));assert.ok(await ops.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.deepEqual(errors,[]);console.log('PASS: mobile operator walk-in saves handover and submits cash in one popup, pending entry marked Walk-in delivery, submits cash without posting, can view own read-only proposal; admin automatically sees pending cash, corrects and approves; ledger amount and original collector preserved; Urdu RTL.');
}finally{await browser.close();}
