import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.APG_TEST_URL);await page.locator('#f-username').fill('integration-review');await page.locator('#f-password').fill(process.env.APG_TEST_PASSWORD);await page.locator('#auth-form [type=submit]').click();await page.locator('#nav-customers').waitFor();
 await page.evaluate(()=>{newShipment('incoming');currentForm.step=1;shipmentForm();openBilty();});
 await page.locator('#f-bilty').fill('TEST-DRAFT');await page.locator('#bilty-customer-search').fill('Unique Browser Temporary Customer');
 await page.locator('[data-quick-customer=temporary]').click();await page.locator('[data-quick-customer-save=temporary]').click();
 await page.waitForFunction(()=>document.querySelector('#bilty-form [name=account_id]').value!=='');assert.equal(await page.locator('#f-bilty').inputValue(),'TEST-DRAFT');assert.match(await page.locator('#bilty-customer-hint').innerText(),/Temporary/);
 const id=await page.locator('#bilty-form [name=account_id]').inputValue();
 await page.locator('#bilty-customer-search').fill('Unique Browser Full Customer');await page.locator('[data-quick-customer=full]').click();await page.locator('#quick-customer-area').fill('Browser area');await page.locator('#quick-customer-phone').fill('03001112222');await page.locator('[data-quick-customer-save=full]').click();await page.waitForFunction(()=>document.querySelector('#bilty-customer-hint').textContent.includes('Customer selected'));assert.equal(await page.locator('#f-bilty').inputValue(),'TEST-DRAFT');
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{biltyDraft=null;closeModal();currentForm=null;});await page.locator('.mobile-menu').click();await page.locator('#nav-customers summary').click();await page.locator('nav [data-view="temporary-customers"]').click();await page.locator('#list-search').fill('Unique Browser Temporary Customer');await page.waitForFunction(()=>listData?.total===1);
 await page.locator('[data-action=temporary-convert]').click();await page.locator('#temporary-convert-form #f-area').fill('Test route');await page.locator('#temporary-convert-form #f-mobile').fill('03001234567');await page.locator('#temporary-convert-form [type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
 assert.equal((await page.evaluate(async id=>(await api('customer',null,{id})),id)).area,'Test route');assert.deepEqual(errors,[]);
 console.log('PASS: incoming quick customer, preserved draft and conversion UI');
}finally{await browser.close();}
