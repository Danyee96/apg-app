import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
try {
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(process.env.APG_TEST_URL);await page.locator('#f-username').fill('integration-review');await page.locator('#f-password').fill(process.env.APG_TEST_PASSWORD);await page.locator('#auth-form [type="submit"]').click();await page.locator('#main [data-view="incoming"]').first().waitFor();
 const setup=await page.evaluate(async()=>{
  const customer=(await api('save_customer',{name:'Invoice detail customer',group_code:'116'})).id;await refreshLookups();const station=lookups.stations.find(row=>row.status==='A').id,cash=lookups.cash_accounts[0].id;
  const shipment=await api('save_shipment',{kind:'incoming',dated:today(),station_id:station,truck:'DETAIL-PAID',items:Array.from({length:4},(_,n)=>({account_id:customer,bilty:'DETAIL-'+n,party_to:'Detail receiver '+n,qty:n+1,detail:'Bag Tea',bilty_amount:'100',godown:'20',advance:'5'}))});
  const items=(await api('shipment',null,{id:shipment.id})).items;
  const paid=await api('save_delivery',{delivery_mode:'walkin',dated:today(),receiver:'Paid walk-in receiver',mobile:'03000000000',cnic:'12345',remarks:'Detail invoice notes',items:items.map(row=>({id:row.id,discount:'5',loading:'10',suzuki:'5'})),walkin_cash:{request_key:crypto.randomUUID(),cash_account_id:cash,notes:'Invoice detail payment',items:items.map(row=>({id:row.id,bilty_received:'110',service_received:'15'}))}});
  const other=await api('save_shipment',{kind:'incoming',dated:today(),station_id:station,truck:'DETAIL-STANDARD',items:Array.from({length:3},(_,n)=>({account_id:customer,bilty:'STANDARD-'+n,qty:1,bilty_amount:'50',godown:'10'}))});
  const standard=await api('save_delivery',{dated:today(),receiver:'Standard detail receiver',items:(await api('shipment',null,{id:other.id})).items.map(row=>({id:row.id}))});
  await navigate('delivery-cash');return {paid,standard};
 });
 const paidRow=page.locator('#main tbody tr').filter({hasText:setup.paid.reference});
 assert.equal(await paidRow.locator('.cash-bilty-chip').count(),3);assert.equal(await paidRow.locator('[data-action="view-delivery-bilties"]').count(),1);
 assert.equal(await paidRow.getByRole('button',{name:'View details',exact:true}).count(),1);
 assert.equal(await paidRow.locator('[data-action="receive-delivery-cash"]').count(),0);
 await paidRow.locator('[data-action="view-delivery-bilties"]').click();
 await page.locator('.cash-invoice-breakdown').waitFor();
 assert.equal(await page.locator('.cash-invoice-breakdown tbody tr').count(),4);
 assert.equal(await page.locator('#modal input,#modal select').count(),0);
 const text=await page.locator('#modal').innerText();for(const label of ['Godown charges','Bilty charges','Advance','Discount','Loading','Suzuki','Detail receiver 3','Invoice detail payment','03000000000'])assert.ok(text.toLowerCase().includes(label.toLowerCase()),label);
 const first=page.locator('.cash-invoice-breakdown tbody tr').first();
 for(const [key,value] of [['bilty_amount','100.00'],['godown','20.00'],['bilty_total','120.00'],['advance','5.00'],['discount','5.00'],['loading','10.00'],['suzuki','5.00'],['due','125.00'],['received','125.00']])assert.ok((await first.locator('[data-cash-detail="'+key+'"]').innerText()).includes(value),key);
 await page.getByRole('button',{name:'Print cash statement',exact:true}).click();await page.locator('#thermal-preview-sheet').waitFor();assert.ok((await page.locator('#thermal-preview-sheet').innerText()).toLowerCase().includes('godown charges'));await page.locator('[data-action="thermal-close"]').first().click();
 await page.locator('#modal [data-action="close-modal"]').first().click();
 await paidRow.getByRole('button',{name:'View details',exact:true}).click();await page.locator('.cash-invoice-breakdown').waitFor();assert.equal(await page.locator('#delivery-cash-form').count(),0);
 await page.locator('#modal [data-action="close-modal"]').first().click();
 // The settled guard also protects the existing delivery receipt's cash entry point.
 await page.evaluate(id=>receiveDeliveryCash(id),setup.paid.id);assert.equal(await page.locator('#delivery-cash-form').count(),0);await page.locator('#modal [data-action="close-modal"]').first().click();
 const standardRow=page.locator('#main tbody tr').filter({hasText:setup.standard.reference});assert.equal(await standardRow.locator('.cash-bilty-chip').count(),3);assert.equal(await standardRow.locator('.cash-bilty-more').count(),0);
 await standardRow.getByRole('button',{name:'Receive cash',exact:true}).click();await page.locator('#delivery-cash-form').waitFor();assert.equal(await page.locator('#delivery-cash-form [name^="bilty_received_"]').count(),3);assert.ok((await page.locator('#delivery-cash-form').innerText()).includes('Godown charges'));
 await page.locator('#modal [data-action="close-modal"]').first().click();
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>APG.setLanguage('ur'));await page.locator('[data-action="view-delivery-cash"]').first().click();await page.locator('.cash-invoice-breakdown').waitFor();assert.equal(await page.locator('html').getAttribute('dir'),'rtl');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 if(process.env.APG_CASH_DETAILS_REVIEW)await page.screenshot({path:process.env.APG_CASH_DETAILS_REVIEW});
 assert.deepEqual(errors,[]);console.log('PASS: three-bilty preview and eye popup for all four; paid walk-in view-only buttons and guarded entry points; full saved charge breakdown and print; standard Receive cash; mobile Urdu RTL.');
} finally {await browser.close();}
