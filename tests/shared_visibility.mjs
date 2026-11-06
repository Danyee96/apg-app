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
 await admin.evaluate(async()=>{await navigate('deliveries');await refreshSharedWorkspace();});
 await operator.evaluate(()=>{selected.clear();recordDelivery();});
 await operator.locator('[name="receiver"]').fill('Shared visibility receiver');
 await operator.locator('#delivery-bilty-number').fill('SHARED-VISIBLE-BILTY');
 await operator.locator('[data-action="delivery-add"]').first().click();
 await operator.locator('[name^="bilty_received_"]').fill('270');
 await operator.locator('#delivery-form [type="submit"]').click();
 await operator.locator('[data-action="edit-delivery"], [data-action="print-dialog"]').first().waitFor();
 const deliveries=await admin.evaluate(()=>api('deliveries',null,{search:'SHARED-VISIBLE-BILTY'}));
 assert.equal(deliveries.rows.length,1);const delivery=deliveries.rows[0];
 assert.equal(delivery.recorded_by,'shared-operator');assert.equal(delivery.collected,27000);
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
 console.log('PASS: separate Operations/Admin sessions; pending entry and delivery shared; bilty search and actor visible; admin refresh, clear filters, complete amounts; unfinished form and open receipt preserved; monitor endpoint denied to operator.');
}finally{await browser.close();}
