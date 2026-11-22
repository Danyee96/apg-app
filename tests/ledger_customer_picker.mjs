import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(process.env.APG_TEST_URL);await page.locator('#f-username').fill('integration-review');await page.locator('#f-password').fill(process.env.APG_TEST_PASSWORD);await page.locator('#auth-form [type=submit]').click();await page.locator('nav [data-view="customers"]').waitFor({state:'attached'});
 const id=await page.evaluate(async()=>{const result=await api('save_customer',{name:'Picker Unique Customer',group_code:'116'});await refreshLookups();return result.id;});
 await page.evaluate(()=>chooseLedger('detail'));
 const input=page.locator('#ledger-account-search');await input.fill('Picker Unique');await page.locator('[data-ledger-account]').first().waitFor();
 assert.match(await page.locator('#ledger-account-results').innerText(),/Picker Unique Customer/);
 await input.press('ArrowDown');await input.press('Enter');assert.equal(await page.locator('#ledger-form [name="account_id"]').inputValue(),id);
 await page.locator('#ledger-form [type=submit]').click();await page.waitForFunction(expected=>state.view==='ledger'&&state.account_id===expected,id);
 await page.evaluate(()=>chooseLedger('detail'));await page.locator('#ledger-account-search').fill('nonexistent customer');await page.locator('#ledger-form [type=submit]').click();assert.match(await page.locator('#ledger-form #form-error').innerText(),/Choose a customer or account/);
 assert.deepEqual(errors,[]);console.log('Customer ledger picker searches, selects by keyboard and opens the correct account.');
}finally{await browser.close();}
