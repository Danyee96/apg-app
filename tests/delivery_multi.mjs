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
await page.evaluate(async()=>{
 const a=lookups.accounts.find(a=>a.customer && a.status==='A');const st=lookups.stations.find(s=>s.status==='A');
 for(let n=0;n<2;n++) await api('save_shipment',{kind:'incoming',dated:today(),station_id:st.id,truck:'MULTI-'+n,items:[{account_id:a.id,bilty:'MULTI-LOOKUP',qty:n+1,bilty_amount:'100',godown:'20',detail:'Parts '+n}]});
 selected.clear();recordDelivery();
});
await page.locator('[name="receiver"]').fill('Multi receiver');
await page.locator('#delivery-bilty-number').fill('MULTI-LOOKUP');
await page.locator('[data-action="delivery-add"]').first().waitFor();
assert.equal(await page.locator('[data-action="delivery-add"]').count(),2);
await page.locator('[data-action="delivery-add"]').first().click();
await page.locator('[name^="bilty_received_"]').fill('100');
await page.locator('#delivery-bilty-number').fill('MULTI-LOOKUP');
await page.locator('[data-action="delivery-add"]:not([disabled])').waitFor();
await page.locator('[data-action="delivery-add"]:not([disabled])').click();
assert.equal(await page.locator('[data-action="delivery-remove"]').count(),2);
assert.equal(await page.locator('[name="receiver"]').inputValue(),'Multi receiver');
assert.equal(await page.locator('[name^="bilty_received_"]').first().inputValue(),'100');
await page.locator('[name^="bilty_received_"]').last().fill('120');
assert.ok((await page.locator('#delivery-combined').innerText()).includes('220.00'));
await page.locator('[data-action="delivery-remove"]').last().click();
assert.equal(await page.locator('[name^="bilty_received_"]').first().inputValue(),'100');
await page.locator('#delivery-bilty-number').fill('MULTI-LOOKUP');
await page.locator('[data-action="delivery-add"]:not([disabled])').click();
await page.locator('[name^="bilty_received_"]').last().fill('120');
const layout=await page.evaluate(()=>{
 const card=document.querySelector('.delivery-card');
 const facts=[...card.querySelectorAll('.delivery-facts dt')].map(el=>el.textContent);
 return {facts,bold:getComputedStyle(card.querySelector('.delivery-total-banner strong')).fontWeight,overflow:document.documentElement.scrollWidth>innerWidth};
});
assert.ok(layout.facts.includes('Quantity')&&layout.facts.includes('Goods type / description'));
assert.ok(Number(layout.bold)>=700);assert.equal(layout.overflow,false);
if(process.env.APG_DELIVERY_REVIEW) await page.screenshot({path:process.env.APG_DELIVERY_REVIEW,fullPage:true});
await page.locator('#delivery-form [type="submit"]').click();
await page.getByRole('button',{name:'Print receipt',exact:true}).waitFor();
const text=await page.locator('#modal').innerText();assert.ok(text.includes('220.00'));
assert.equal(await page.locator('#modal tbody tr').count(),2);
console.log('Mobile multi-bilty lookup, duplicate-number choice, retained inputs, removal/re-add, combined totals and single saved delivery passed.');
}finally{await browser.close();}
