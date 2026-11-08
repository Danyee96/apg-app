import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
try {
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.APG_TEST_URL);await page.locator('#f-username').fill('integration-review');await page.locator('#f-password').fill(process.env.APG_TEST_PASSWORD);await page.locator('#auth-form [type="submit"]').click();await page.locator('#main [data-view="incoming"]').first().waitFor();
 const setup=await page.evaluate(async()=>{
  const customer=(await api('save_customer',{name:'Previous balance customer',group_code:'116'})).id;await refreshLookups();const station=lookups.stations.find(row=>row.status==='A').id,cash=lookups.cash_accounts[0].id;
  const priorShipment=await api('save_shipment',{kind:'incoming',dated:today(),station_id:station,truck:'PRIOR',items:[{account_id:customer,bilty:'OLD-UNPAID-1',qty:1,bilty_amount:'2500',godown:'500'}]});
  const old=await api('save_delivery',{dated:today(),receiver:'Old unpaid receiver',items:(await api('shipment',null,{id:priorShipment.id})).items.map(row=>({id:row.id}))});
  const invoice=await api('delivery_cash_invoice',null,{id:old.id});await api('receive_delivery_cash',{delivery_id:old.id,version:invoice.version,request_key:crypto.randomUUID(),dated:today(),cash_account_id:cash,items:invoice.lines.map(row=>({id:row.delivery_item_id,bilty_received:'1000',service_received:'0'}))});
  const incoming=await api('save_shipment',{kind:'incoming',dated:today(),station_id:station,truck:'CURRENT',items:[{account_id:customer,bilty:'CURRENT-A',qty:1,bilty_amount:'2000',godown:'500'},{account_id:customer,bilty:'CURRENT-B',qty:1,bilty_amount:'2000',godown:'500'}]});
  const otherCustomer=(await api('save_customer',{name:'Other balance customer',group_code:'116'})).id;
  const otherShipment=await api('save_shipment',{kind:'incoming',dated:today(),station_id:station,truck:'OTHER-BALANCE',items:[{account_id:otherCustomer,bilty:'OTHER-OLD',qty:1,bilty_amount:'500'},{account_id:otherCustomer,bilty:'OTHER-NEW',qty:1,bilty_amount:'500'}]});
  const otherItems=(await api('shipment',null,{id:otherShipment.id})).items;
  await api('save_delivery',{delivery_mode:'walkin',dated:today(),receiver:'Other previous receiver',items:[{id:otherItems[0].id}],walkin_cash:{request_key:crypto.randomUUID(),cash_account_id:'',items:[{id:otherItems[0].id,bilty_received:'0',service_received:'0'}]}});
  selected.clear();(await api('shipment',null,{id:incoming.id})).items.forEach(row=>selected.set(row.id,row));selected.set(otherItems[1].id,otherItems[1]);recordDelivery();return {customer,otherCustomer,otherItem:otherItems[1].id,old:old.id,cash};
 });
 await page.locator('#delivery-form [name="receiver"]').fill('Keep my delivery details');
 await page.waitForFunction(()=>document.querySelector('#delivery-prior-balances [data-combined-customer-due]')?.textContent.includes('8,000.00'));
 assert.equal(await page.locator('#delivery-prior-balances [data-customer-dues]').count(),2);
 assert.ok((await page.locator('[data-customer-dues="'+setup.customer+'"]').innerText()).includes('7,000.00'));
 assert.ok((await page.locator('[data-customer-dues="'+setup.otherCustomer+'"]').innerText()).includes('1,000.00'));
 await page.locator('[data-action="delivery-remove"][data-id="'+setup.otherItem+'"]').click();
 await page.waitForFunction(()=>document.querySelector('#delivery-prior-balances [data-combined-customer-due]')?.textContent.includes('7,000.00'));
 assert.equal(await page.locator('#delivery-prior-balances [data-customer-dues]').count(),1,'Previous balance counted once across two bilties');
 await page.locator('#delivery-form [name^="loading_"]').first().fill('100');
 assert.ok((await page.locator('#delivery-prior-balances [data-combined-customer-due]').innerText()).includes('7,100.00'));
 await page.locator('#delivery-form [name^="loading_"]').first().fill('0');
 await page.locator('#delivery-form [name="delivery_mode"]').selectOption('walkin');
 await page.waitForFunction(()=>document.querySelector('#delivery-prior-balances [data-combined-customer-due]')?.textContent.includes('7,000.00'));
 await page.locator('#delivery-form [name^="walkin_received_"]').first().fill('1000');
 assert.ok((await page.locator('[data-combined-customer-remaining]').innerText()).includes('6,000.00'));
 await page.locator('#delivery-prior-balances [data-action="previous-bilty-details"]').click();
 await page.locator('#customer-balance-dialog tbody tr').waitFor();
 const prior=await page.locator('#customer-balance-dialog').innerText();assert.ok(prior.includes('OLD-UNPAID-1'));assert.ok(prior.includes('2,000.00'));assert.ok(!prior.includes('CURRENT-A'));
 await page.locator('[data-action="close-customer-dues"]').click();
 assert.equal(await page.locator('#delivery-form [name="receiver"]').inputValue(),'Keep my delivery details');
 assert.equal(await page.locator('#delivery-form [name^="walkin_received_"]').first().inputValue(),'1000');
 await page.locator('#delivery-form [name^="walkin_received_"]').first().fill('0');
 const response=page.waitForResponse(r=>r.url().includes('action=save_delivery')&&r.request().method()==='POST');await page.locator('#delivery-form [type="submit"]').click();const saved=await (await response).json();await page.locator('#modal [data-action="edit-delivery"]').waitFor();
 const checked=await page.evaluate(async({setup,id})=>{
  const dues=await api('delivery_customer_dues',{account_ids:[setup.customer,setup.customer],exclude_delivery_id:id,details:true});
  const ledger=await api('ledger',null,{account_id:setup.customer});return {dues,closing:ledger.closing};
 },{setup,id:saved.id});
 assert.equal(checked.dues.customers[0].outstanding,200000);assert.equal(checked.dues.total,1);assert.equal(checked.closing,700000,'Previous debt must not be posted twice');
 await page.evaluate(id=>receiveDeliveryCash(id),saved.id);await page.locator('#delivery-cash-form').waitFor();
 await page.waitForFunction(()=>document.querySelector('#cash-prior-balances [data-combined-customer-due]')?.textContent.includes('7,000.00'));
 // The current delivery must not be included a second time in prior balances.
 assert.ok(!(await page.locator('#cash-prior-balances').innerText()).includes('12,000.00'));
 await page.locator('#delivery-cash-form [name^="bilty_received_"]').first().fill('500');
 assert.ok((await page.locator('#cash-prior-balances [data-combined-customer-remaining]').innerText()).includes('6,500.00'));
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>APG.setLanguage('ur'));await page.locator('#cash-prior-balances [data-action="previous-bilty-details"]').click();await page.locator('#customer-balance-dialog tbody tr').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('[data-action="close-customer-dues"]').click();assert.equal(await page.locator('#delivery-cash-form [name^="bilty_received_"]').first().inputValue(),'500');
 assert.equal(await page.locator('#cash-prior-balances [data-combined-customer-due]').evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap');
 if(process.env.APG_BALANCE_REVIEW){await page.locator('#cash-prior-balances').scrollIntoViewIfNeeded();await page.screenshot({path:process.env.APG_BALANCE_REVIEW});}
 assert.deepEqual(errors,[]);console.log('PASS: previous Rs 2,000 plus current Rs 5,000 = Rs 7,000; same-customer bilties counted once; live charges/payment totals; old-bilty detail popup preserves both forms; current invoice excluded; no duplicate debt posting; mobile Urdu RTL.');
} finally {await browser.close();}
