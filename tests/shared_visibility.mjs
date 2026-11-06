import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
try{
 const admin=await browser.newPage(),operator=await browser.newPage(),errors=[];
 for(const page of [admin,operator])page.on('pageerror',e=>errors.push(e.message));
 async function login(page,user,password){await page.goto(process.env.APG_TEST_URL);await page.locator('#f-username').fill(user);await page.locator('#f-password').fill(password);await page.locator('#auth-form [type="submit"]').click();await page.locator('#main [data-view="incoming"]').first().waitFor();}
 await login(admin,'integration-review',process.env.APG_TEST_PASSWORD);
 const setup=await admin.evaluate(async()=>{
  await api('save_user',{username:'shared-operator',full_name:'Shared operator',role:'operations',active:1,permissions:['incoming.create','deliveries.create'],password:'Shared-test-password-2026'});
  const station=lookups.stations.find(s=>s.status==='A').id,customer=lookups.accounts.find(a=>a.customer&&a.status==='A').id;
  await navigate('pending-incoming');await refreshSharedWorkspace();
  return {station,customer,dated:today()};
 });
 await login(operator,'shared-operator','Shared-test-password-2026');
 assert.equal(await operator.evaluate(async()=>(await fetch('api.php?action=workspace_changes')).status),403);
 const payload={kind:'incoming',dated:setup.dated,station_id:setup.station,truck:'SHARED-TRUCK',truck_amount:'100',items:[{account_id:setup.customer,bilty:'SHARED-VISIBLE-BILTY',party_to:'Shared recipient',qty:2,bilty_amount:'200',godown:'70'}]};
 const pending=await operator.evaluate(p=>api('save_shipment',p),payload);
 await admin.evaluate(()=>refreshSharedWorkspace());
 await admin.locator(`[data-action="review-incoming"][data-id="${pending.id}"]`).waitFor();
 const saved=await admin.evaluate(p=>api('save_shipment',p),{...payload,pending_id:pending.id});
 await admin.evaluate(async()=>{await navigate('pending-cash');await refreshSharedWorkspace();});
 await operator.evaluate(()=>{selected.clear();recordDelivery();});
 await operator.locator('[name="receiver"]').fill('Shared visibility receiver');
 await operator.locator('#delivery-bilty-number').fill('SHARED-VISIBLE-BILTY');
 await operator.locator('[data-action="delivery-add"]').first().click();
 const card=await operator.locator('.delivery-card').innerText();
 assert.ok(card.includes('Godown charges')&&card.includes('70.00')&&card.includes('270.00'));
 assert.ok((await operator.locator('#delivery-combined').innerText()).includes('270.00'));
 assert.equal(await operator.locator('[name^="bilty_received_"]').count(),0);
 await operator.locator('#delivery-form [type="submit"]').click();
 await operator.locator('#modal [data-action="receive-delivery-cash"]').waitFor();
 const savedId=await operator.evaluate(()=>recordPrintContext.data.id);
 await operator.locator('#modal [data-action="receive-delivery-cash"]').click();await operator.locator('#delivery-cash-form').waitFor();
 await operator.locator('#delivery-cash-form [name^="bilty_received_"]').fill('270');await operator.getByRole('button',{name:'Submit cash for approval',exact:true}).click();await operator.getByRole('heading',{name:'Pending cash collections',exact:true}).waitFor();
 assert.equal((await admin.evaluate(id=>api('delivery',null,{id}),savedId)).cash_summary.received,0);
 await admin.locator('[data-action="review-pending-cash"]').first().waitFor({timeout:25000});await admin.locator('[data-action="review-pending-cash"]').first().click();await admin.locator('#delivery-cash-form').waitFor();
 await admin.getByRole('button',{name:'Approve cash collection',exact:true}).click();await admin.locator('#modal .summary-row').filter({hasText:'270.00'}).waitFor();
 await operator.evaluate(id=>showDelivery(id),savedId);const receipt=await operator.evaluate(()=>buildThermalRecord(recordPrintContext).html);assert.ok(receipt.includes('270.00'));
 await admin.locator('[data-action="close-modal"]').first().click();await admin.evaluate(()=>navigate('deliveries'));
 const deliveries=await admin.evaluate(()=>api('deliveries',null,{search:'SHARED-VISIBLE-BILTY'}));
 assert.equal(deliveries.rows.length,1);const delivery=deliveries.rows[0];
 assert.equal(delivery.recorded_by,'shared-operator');assert.equal(delivery.collected,27000);assert.equal(delivery.receiver,'Shared visibility receiver');
 assert.equal((await admin.evaluate(id=>api('delivery',null,{id}),delivery.id)).items[0].godown,7000);
 await admin.locator(`[data-action="delivery"][data-id="${delivery.id}"]`).first().waitFor({timeout:25000});
 assert.ok((await admin.locator('#main').innerText()).includes('Recorded by: shared-operator'));
 // Active filters stay intentional and can be cleared without leaving the page.
 await admin.evaluate(async()=>{state.search='NO-MATCH';await render();});
 await admin.locator('[data-action="clear-delivery-filters"]').click();
 await admin.locator(`[data-action="delivery"][data-id="${delivery.id}"]`).first().waitFor();
 // A shared change must not replace an unfinished incoming form or open receipt.
 await admin.evaluate(()=>{newShipment('incoming');document.querySelector('[name="truck"]').value='KEEP-DRAFT';});
 await operator.evaluate(()=>api('save_profile',{full_name:'Shared operator updated'}));
 await admin.evaluate(()=>refreshSharedWorkspace());assert.equal(await admin.locator('[name="truck"]').inputValue(),'KEEP-DRAFT');
 await admin.evaluate(async()=>{currentForm=null;await navigate('deliveries');await showDelivery(Number(document.querySelector('[data-action="delivery"]').dataset.id));});
 await admin.evaluate(()=>refreshSharedWorkspace());assert.ok(await admin.locator('#modal').isVisible());
 assert.deepEqual(errors,[]);
 console.log('PASS: separate Operations/Admin sessions; incoming approval and cash approval queues shared; operator handover immediate; cash held until admin approval; bilty search and actor visible; admin refresh, clear filters, complete amounts; unfinished form and open receipt preserved; monitor endpoint denied to operator.');
}finally{await browser.close();}
