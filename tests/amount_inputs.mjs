import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
try {
const page=await browser.newPage({viewport:{width:390,height:844}});
await page.goto(process.env.APG_TEST_URL);
await page.locator('#f-username').fill('integration-review');
await page.locator('#f-password').fill(process.env.APG_TEST_PASSWORD);
await page.locator('#auth-form [type="submit"]').click();
await page.locator('[data-view="dashboard"]').first().waitFor();
await page.evaluate(()=>modal('Amount input check','',`<form>${field('test_money','Amount','0','number','required min="0" step="0.01"')}${field('test_decimal','Decimal','0.00','number','min="0" step="0.01"')}${field('test_existing','Existing','0100','number','min="0" step="0.01"')}${field('test_qty','Quantity','1','number','min="1" step="1"')}</form>`));
const money=page.locator('[name="test_money"]');
await money.focus();assert.equal(await money.inputValue(),'');
await money.type('100');await page.locator('[name="test_qty"]').focus();assert.equal(await money.inputValue(),'100');
await money.fill('0200');await page.locator('[name="test_qty"]').focus();assert.equal(await money.inputValue(),'200');
const decimal=page.locator('[name="test_decimal"]');await decimal.focus();assert.equal(await decimal.inputValue(),'');
await decimal.fill('00.50');await page.locator('[name="test_qty"]').focus();assert.equal(await decimal.inputValue(),'0.50');
await money.focus();await money.fill('');await page.locator('[name="test_qty"]').focus();assert.equal(await money.inputValue(),'0');
await page.locator('[name="test_existing"]').focus();assert.equal(await page.locator('[name="test_existing"]').inputValue(),'100');
assert.equal(await page.locator('[name="test_qty"]').inputValue(),'1');
console.log('Mobile amount fields: zero clears on focus, leading zeros normalize, decimals retained, blanks reset, quantity unchanged.');
}finally{await browser.close();}
