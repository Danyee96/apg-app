import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.APG_TEST_URL);await page.locator('#f-username').fill('integration-review');await page.locator('#f-password').fill(process.env.APG_TEST_PASSWORD);await page.locator('#auth-form [type=submit]').click();await page.locator('#nav-incoming').waitFor();
 await page.evaluate(()=>navigate('incoming'));await page.locator('#filter-from').waitFor();const start=await page.evaluate(()=>recentHistoryStart()),end=await page.evaluate(()=>today());assert.equal(await page.locator('#filter-from').inputValue(),start);assert.equal(await page.locator('#filter-to').inputValue(),end);
 await page.locator('#filter-from').fill('2020-01-01');await page.locator('#filter-from').dispatchEvent('change');await page.waitForFunction(()=>state.from==='2020-01-01');await page.reload();await page.locator('#filter-from').waitFor();assert.equal(await page.locator('#filter-from').inputValue(),'2020-01-01');
 await page.evaluate(()=>navigate('deliveries'));await page.locator('.u-delivery-list').waitFor();assert.equal(await page.locator('#filter-from').inputValue(),start);assert.equal(await page.locator('#filter-to').inputValue(),end);
 await page.evaluate(()=>{state.from='';state.to='';render();});await page.locator('.u-delivery-list').waitFor();await page.reload();await page.locator('.u-delivery-list').waitFor();assert.equal(await page.locator('#filter-from').inputValue(),'');
 assert.deepEqual(errors,[]);console.log('PASS: recent-year defaults and explicit full/older date ranges survive reload');
}finally{await browser.close();}
