import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.APG_TEST_URL);await page.locator('#f-username').fill('integration-review');await page.locator('#f-password').fill(process.env.APG_TEST_PASSWORD);await page.locator('#auth-form [type="submit"]').click();await page.locator('.nav-link[data-view="navigation"]').waitFor();
 assert.equal(await page.locator('[data-view="dashboard"]').count(),0);
 const views=await page.locator('#navigation [data-view]').evaluateAll(rows=>rows.map(row=>row.dataset.view));
 // Brand and the persistent home link intentionally both go home; each actual menu entry appears once.
 const menuViews=await page.locator('#navigation nav [data-view]').evaluateAll(rows=>rows.map(row=>row.dataset.view));assert.equal(new Set(menuViews).size,menuViews.length);
 assert.deepEqual(await page.locator('#nav-incoming [data-view]').evaluateAll(rows=>rows.map(row=>row.dataset.view)),['incoming','pending-incoming']);
 assert.deepEqual(await page.locator('#nav-delivery [data-view]').evaluateAll(rows=>rows.map(row=>row.dataset.view)),['deliveries','pending-deliveries','delivery-cash']);
 assert.equal(await page.locator('#nav-delivery').evaluate(el=>el.open),false);
 await page.locator('#nav-delivery > summary').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#nav-delivery').evaluate(el=>el.open),true);
 await page.locator('#nav-delivery [data-view="delivery-cash"]').click();await page.locator('#main h1').filter({hasText:'Delivery Cash Receiving'}).waitFor();
 assert.equal(await page.locator('#nav-delivery').evaluate(el=>el.open),true);assert.ok(await page.locator('#nav-delivery').evaluate(el=>el.classList.contains('active')));
 assert.equal(await page.locator('#navigation nav .active[data-view]').getAttribute('data-view'),'delivery-cash');
 await page.evaluate(()=>navigate('pending-incoming'));assert.equal(await page.locator('#nav-incoming').evaluate(el=>el.open),true);
 await page.setViewportSize({width:390,height:844});await page.locator('#app-language').selectOption('ur');await page.locator('.mobile-menu').click();await page.waitForTimeout(250);
 await page.locator('#nav-delivery > summary').click(); // collapse the already-open group
 assert.equal(await page.locator('#nav-delivery').evaluate(el=>el.open),false);await page.locator('#nav-delivery > summary').click();
 await page.locator('#nav-delivery [data-view="deliveries"]').click();await page.waitForTimeout(250);assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('nav-open')),false);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.locator('.mobile-menu').click();await page.waitForTimeout(250);await page.screenshot({path:'/private/tmp/apg-grouped-nav-urdu.png'});
 await page.evaluate(async()=>{await api('save_user',{username:'nav-operator',full_name:'Navigation operator',role:'operations',active:1,permissions:['incoming.create','deliveries.create'],password:'Nav-operator-test-2026'});});
 const ops=await browser.newPage();await ops.goto(process.env.APG_TEST_URL);await ops.locator('#f-username').fill('nav-operator');await ops.locator('#f-password').fill('Nav-operator-test-2026');await ops.locator('#auth-form [type="submit"]').click();await ops.locator('.nav-link[data-view="navigation"]').waitFor();
 assert.equal(await ops.locator('#nav-delivery [data-view="delivery-cash"]').count(),0);assert.equal(await ops.locator('#nav-delivery [data-view="pending-deliveries"]').count(),1);
 await ops.evaluate(()=>{session.profile.role='custom';session.permissions=[];shell();});assert.equal(await ops.locator('.nav-group').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: no Dashboard or duplicate menu entries; incoming/delivery dropdowns; keyboard toggle; active group opens; mobile Urdu RTL navigation; cash menu restricted to super admin; empty groups omitted.');
}finally{await browser.close();}
