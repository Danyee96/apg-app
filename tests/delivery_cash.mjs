import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.APG_TEST_URL);await page.locator('#f-username').fill('integration-review');await page.locator('#f-password').fill(process.env.APG_TEST_PASSWORD);await page.locator('#auth-form [type="submit"]').click();await page.locator('#main [data-view="incoming"]').first().waitFor();
 await page.evaluate(async()=>{
  const customers=[];for(let n=0;n<2;n++)customers.push((await api('save_customer',{name:'UI cash customer '+n,group_code:'116'})).id);
  await refreshLookups();const station=lookups.stations.find(s=>s.status==='A').id;
  const saved=await api('save_shipment',{kind:'incoming',dated:today(),station_id:station,truck:'CASH-UI',items:[{account_id:customers[0],bilty:'CASH-UI-A',qty:1,bilty_amount:'200',godown:'70',advance:'20'},{account_id:customers[1],bilty:'CASH-UI-B',qty:1,bilty_amount:'100',godown:'20'}]});
  const shipment=await api('shipment',null,{id:saved.id});selected.clear();shipment.items.forEach(row=>selected.set(row.id,row));recordDelivery();
 });
 assert.equal(await page.locator('#delivery-form [name^="bilty_received_"]').count(),0);assert.equal(await page.locator('#delivery-form [name^="service_received_"]').count(),0);
 await page.locator('#delivery-form [name="delivery_mode"]').selectOption('walkin');
 await page.locator('#delivery-form [name="receiver"]').fill('UI cash receiver');
 await page.locator('#delivery-form [name^="loading_"]').first().fill('30');await page.locator('#delivery-form [name^="discount_"]').first().fill('10');
 assert.ok((await page.locator('#delivery-combined').innerText()).includes('390.00'));
 await page.locator('[data-action="walkin-pay-full"]').first().click();
 assert.equal(await page.locator('#delivery-form [name^="bilty_received_"]').first().inputValue(),'240.00');
 assert.equal(await page.locator('#delivery-form [name^="service_received_"]').first().inputValue(),'30.00');
 await page.locator('#delivery-form [name^="bilty_received_"]').last().fill('50');
 assert.ok((await page.locator('#delivery-combined').innerText()).includes('320.00'));
 assert.ok((await page.locator('#delivery-combined').innerText()).includes('70.00'));
 assert.equal(await page.locator('#delivery-cash-form').count(),0);
 await page.evaluate(()=>APG.setLanguage('ur'));
 assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.evaluate(()=>APG.setLanguage('en'));
 if(process.env.APG_WALKIN_REVIEW){
  await page.setViewportSize({width:1800,height:1100});
  await page.locator('.walkin-cash-section').scrollIntoViewIfNeeded();
  await page.screenshot({path:process.env.APG_WALKIN_REVIEW});
  await page.setViewportSize({width:390,height:844});
 }
 const savedResponse=page.waitForResponse(r=>r.url().includes('action=save_delivery')&&r.request().method()==='POST');
 await page.locator('#delivery-form [type="submit"]').click();
 const saved=await (await savedResponse).json(),deliveryId=saved.id;assert.equal(saved.cash_recorded,true);
 await page.locator('#modal [data-action="edit-delivery"]').waitFor();
 assert.equal(await page.locator('#delivery-cash-form').count(),0);
 await page.evaluate(id=>receiveDeliveryCash(id),deliveryId);
 await page.locator('#modal .summary-row').filter({hasText:'320.00'}).waitFor();
 assert.ok((await page.locator('#modal').innerText()).includes('70.00'));
 await page.locator('[data-action="print-dialog"]').last().click();await page.locator('#thermal-preview-sheet').waitFor();
 assert.ok((await page.locator('#thermal-preview-sheet').innerText()).includes('70.00'));
 for(const width of ['58','80']){await page.locator('#print-format').selectOption('thermal');await page.locator('#thermal-width').selectOption(width);await page.waitForTimeout(80);assert.ok(await page.locator('#thermal-preview-sheet .thermal-slip').evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.pdf({path:`/private/tmp/apg-cash-statement-${width}.pdf`,preferCSSPageSize:true});}
 await page.locator('#print-format').selectOption('a4');for(const orientation of ['portrait','landscape']){await page.locator('#print-orientation').selectOption(orientation);await page.pdf({path:`/private/tmp/apg-cash-statement-${orientation}.pdf`,preferCSSPageSize:true});}
 await page.locator('[data-action="thermal-close"]').first().click();await page.locator('[data-action="close-modal"]').first().click();
 await page.evaluate(()=>navigate('delivery-cash'));await page.locator('[data-action="cash-mode"][data-value="customers"]').click();await page.locator('#main tbody tr').filter({hasText:'UI cash customer 1'}).waitFor();
 assert.ok((await page.locator('#main').innerText()).includes('70.00'));assert.ok(!(await page.locator('#main tbody').innerText()).includes('UI cash customer 0'));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 // Metadata corrections after collection preserve all cash and customer allocations.
 await page.evaluate(id=>editDelivery(id),deliveryId);await page.locator('#delivery-form').waitFor();assert.equal(await page.locator('#delivery-form [name^="loading_"]').first().evaluate(el=>el.readOnly),true);
 await page.locator('#delivery-form [name="receiver"]').fill('Receiver corrected after cash');await page.locator('#delivery-form [type="submit"]').click();await page.locator('#modal').getByText('Receiver corrected after cash',{exact:true}).waitFor();
 assert.ok((await page.locator('#modal').innerText()).includes('320.00'));
 await page.locator('[data-action="close-modal"]').first().click();await page.locator('#app-language').selectOption('ur');await page.evaluate(id=>receiveDeliveryCash(id),deliveryId);await page.locator('#delivery-cash-form').waitFor();assert.equal(await page.locator('html').getAttribute('dir'),'rtl');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.deepEqual(errors,[]);console.log('PASS: mobile admin walk-in records goods and cash together in one popup without approval; full/part payment by customer; live per-bilty status; collection history; outstanding customer list; printable A4 statement; metadata edit preserves collections; Urdu RTL.');
}finally{await browser.close();}
