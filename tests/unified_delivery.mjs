import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
try {
 const page=await browser.newPage({viewport:{width:1680,height:1050}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 async function login(p,user,password){await p.goto(process.env.APG_TEST_URL);await p.locator('#f-username').fill(user);await p.locator('#f-password').fill(password);await p.locator('#auth-form [type="submit"]').click();await p.locator('.nav-link[data-view="deliveries"]').waitFor();}
 await login(page,'integration-review',process.env.APG_TEST_PASSWORD);
 const setup=await page.evaluate(async()=>{const customer=(await api('save_customer',{name:'Unified UI customer',group_code:'116'})).id;await refreshLookups();const station=lookups.stations.find(row=>row.status==='A').id;for(let n=0;n<2;n++)await api('save_shipment',{kind:'incoming',dated:today(),station_id:station,truck:'UNIFIED-UI-'+n,items:[{account_id:customer,bilty:'U-UI-'+n,party_to:'Receiver '+n,qty:n+1,bilty_amount:'1000',godown:'200',detail:'Cotton Shoes'}]});return {customer};});
 await page.locator('.nav-link[data-view="deliveries"]').click();await page.locator('.u-delivery-list').waitFor();assert.equal(new URL(page.url()).searchParams.get('view'),'deliveries');await page.reload();await page.locator('.u-delivery-list').waitFor();await page.locator('[data-action="u-tab"][data-value="balances"]').click();await page.locator('[data-action="u-tab"][data-value="balances"].primary').waitFor();await page.reload();await page.locator('[data-action="u-tab"][data-value="balances"].primary').waitFor();await page.locator('[data-action="u-tab"][data-value="all"]').click();await page.locator('.u-delivery-list').waitFor();assert.equal(await page.locator('.u-delivery-list th').filter({hasText:/^Status$/}).count(),0);assert.ok(await page.locator('.u-delivery-list').evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.getByRole('button',{name:'Add New',exact:true}).click();await page.locator('#unified-delivery-form').waitFor();
 assert.equal(await page.locator('[name="delivery_mode"]').count(),0);assert.equal(await page.locator('#modal').evaluate(el=>el.open),false);
 await page.locator('[name="receiver"]').fill('One unified receiver');
 for(let n=0;n<2;n++){await page.locator('#u-bilty-lookup').fill('U-UI-'+n);await page.waitForFunction(n=>document.querySelectorAll('[data-u-bilty-row]').length===n+1,n);}
 assert.equal(await page.locator('[data-u-service-row]').count(),2);
 for(const width of [1680,1366]){await page.setViewportSize({width,height:1050});await page.waitForTimeout(100);assert.ok(await page.locator('.u-ledger-scroll,.u-pane').evaluateAll(elements=>elements.every(el=>el.scrollWidth<=el.clientWidth+1)));assert.ok(await page.evaluate(()=>[...document.querySelectorAll('.u-two-grids section')].every(section=>section.querySelector('thead').getBoundingClientRect().bottom<=section.querySelector('tbody tr').getBoundingClientRect().top+1)));}
 await page.setViewportSize({width:1680,height:1050});

 await page.locator('[name^="u_loading_"]:not([name^="u_loading_cash_"])').first().fill('100');
 await page.locator('[name^="u_suzuki_"]:not([name^="u_suzuki_cash_"])').first().fill('50');
 const first=page.locator('[name^="u_bilty_"]');await first.first().fill('500');await page.locator('[name^="u_loading_cash_"]').first().fill('20');await page.locator('[name^="u_suzuki_cash_"]').first().fill('30');
 const rowKey=await first.first().getAttribute('name');assert.ok(await page.locator('[data-u-date="'+rowKey+'"]').innerText());
 await first.first().fill('0');assert.equal(await page.locator('[data-u-date="'+rowKey+'"]').innerText(),'');await first.first().fill('500');
 assert.ok((await page.locator('[data-u-total="bilty_outstanding"]').innerText()).includes('1,900'));
 const align=await page.evaluate(()=>[...document.querySelectorAll('[data-u-bilty-row]')].map(row=>{const right=document.querySelector('[data-u-service-row="'+row.dataset.uBiltyRow+'"]');return Math.abs(row.getBoundingClientRect().top-right.getBoundingClientRect().top);}));assert.ok(align.every(delta=>delta<2));
 assert.ok(Number(await first.first().evaluate(el=>getComputedStyle(el).color.match(/\d+/g)[0]))>100);
 if(process.env.APG_UNIFIED_REVIEW)await page.screenshot({path:process.env.APG_UNIFIED_REVIEW});
 const response=page.waitForResponse(r=>r.url().includes('action=save_unified_delivery'));await page.locator('#unified-delivery-form [type="submit"]').click();const saved=await (await response).json();await page.locator('.u-history details').waitFor();
 assert.equal(await first.first().inputValue(),'0');assert.ok((await page.locator('[data-u-total="bilty_paid"]').innerText()).includes('500'));
 const before=await page.evaluate(id=>api('unified_delivery',null,{id}),saved.id);assert.equal(before.lines[0].loading_received,2000);assert.equal(before.lines[0].suzuki_received,3000);
 // Reopening does not invent a new receipt date or reset historical payments.
 assert.equal(await page.locator('[data-u-date]').first().innerText(),'');await page.locator('[data-action="u-full"]').click();
 assert.ok((await page.locator('[data-u-total="bilty_outstanding"]').innerText()).includes('Rs 0'));
 await page.locator('#unified-delivery-form [type="submit"]').click();await page.waitForFunction(()=>unifiedEditor?.doc?.receipts.length===2);
 const settled=await page.evaluate(()=>unifiedEditor.doc);assert.ok(settled.lines.every(row=>row.payment_status==='fully_paid'));
 assert.equal(settled.lines[0].bilty_received_date,before.lines[0].bilty_received_date);
 await page.locator('[data-action="u-print"]').click();await page.locator('#thermal-preview-sheet').waitFor();assert.ok((await page.locator('#thermal-preview-sheet').innerText()).includes('One unified receiver'));await page.locator('[data-action="thermal-close"]').first().click();
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>APG.setLanguage('ur'));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.equal(await page.locator('.u-services-grid').count(),1);assert.ok(await page.locator('.u-mobile-bilty').first().isVisible());
 await page.evaluate(()=>APG.setLanguage('en'));
 // Pending operator collections remain in the same module and retain categories.
 const ops=await browser.newPage({viewport:{width:390,height:844}});ops.on('pageerror',error=>errors.push(error.message));
 await page.evaluate(async()=>{await api('save_user',{username:'unified-ui-ops',full_name:'Unified UI operator',role:'operations',active:1,permissions:['deliveries.create'],password:'Unified-ui-ops-2026'});const customer=(await api('save_customer',{name:'Unified operator customer',group_code:'116'})).id;await api('save_shipment',{kind:'incoming',dated:today(),station_id:lookups.stations.find(row=>row.status==='A').id,truck:'U-OPS',items:[{account_id:customer,bilty:'U-OPS-1',qty:1,bilty_amount:'500',godown:'50',loading:'30',suzuki:'20'}]});});
 await login(ops,'unified-ui-ops','Unified-ui-ops-2026');await ops.locator('#main [data-view="deliveries"]').first().click();await ops.getByRole('button',{name:'Add New',exact:true}).click();await ops.locator('[name="receiver"]').fill('Operator receiver');await ops.locator('#u-bilty-lookup').fill('U-OPS-1');await ops.locator('[data-u-bilty-row]').waitFor();await ops.locator('[data-action="u-full"]').click();await ops.locator('#unified-delivery-form [type="submit"]').click();await ops.locator('[data-action="u-review"]').waitFor();const pendingId=await ops.evaluate(()=>unifiedEditor.doc.pending_cash.id),deliveryId=await ops.evaluate(()=>unifiedEditor.doc.header.id);
 await page.evaluate(async({deliveryId,pendingId})=>unifiedOpen(deliveryId,pendingId),{deliveryId,pendingId});assert.equal(Number(await page.locator('[name^="u_loading_cash_"]').inputValue()),30);await page.locator('#unified-delivery-form [type="submit"]').click();await page.waitForFunction(()=>!unifiedEditor.doc.pending_cash);
 assert.equal(await page.evaluate(()=>unifiedEditor.doc.lines[0].payment_status),'fully_paid');
 assert.deepEqual(errors,[]);console.log('PASS: one delivery workspace; row-aligned separate grids; zero/new dates; partial/full/later cash; no mode dropdown; immutable receipt history; print; Urdu/mobile; operator category-preserving approval on the same screen.');
} finally {await browser.close();}
