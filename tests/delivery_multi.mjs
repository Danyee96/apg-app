import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
try {
const page=await browser.newPage({viewport:{width:390,height:844}});
await page.goto(process.env.APG_TEST_URL);
await page.locator('#f-username').fill('integration-review');
await page.locator('#f-password').fill(process.env.APG_TEST_PASSWORD);
await page.locator('#auth-form [type="submit"]').click();
await page.locator('.nav-link[data-view="navigation"]').first().waitFor();
await page.evaluate(async()=>{
 const a=lookups.accounts.find(a=>a.customer && a.status==='A');const st=lookups.stations.find(s=>s.status==='A');
 for(let n=0;n<2;n++) await api('save_shipment',{kind:'incoming',dated:today(),station_id:st.id,truck:'MULTI-'+n,items:[{account_id:a.id,bilty:'MULTI-LOOKUP',qty:n+1,bilty_amount:'100',godown:'20',detail:'Parts '+n,party_to:'Party receiver '+n}]});
 selected.clear();recordDelivery();
});
await page.locator('[name="receiver"]').fill('Multi receiver');
await page.locator('#delivery-bilty-number').fill('MULTI-LOOKUP');
await page.locator('[data-action="delivery-add"]').first().waitFor();
assert.equal(await page.locator('[data-action="delivery-add"]').count(),2);
assert.ok((await page.locator('#delivery-matches').innerText()).includes('Party receiver 0'));
await page.locator('[data-action="delivery-add"]').first().click();
await page.locator('[name^="loading_"]').fill('10');
await page.locator('#delivery-bilty-number').fill('MULTI-LOOKUP');
await page.locator('[data-action="delivery-add"]:not([disabled])').waitFor();
await page.locator('[data-action="delivery-add"]:not([disabled])').click();
assert.equal(await page.locator('[data-action="delivery-remove"]').count(),2);
assert.ok((await page.locator('.delivery-entry-row').first().innerText()).includes('Party receiver'));
assert.equal(await page.locator('[name="receiver"]').inputValue(),'Multi receiver');
assert.equal(await page.locator('[name^="loading_"]').first().inputValue(),'10');
await page.locator('[name^="loading_"]').last().fill('20');
assert.ok((await page.locator('#delivery-combined').innerText()).includes('270.00'));
await page.locator('[data-action="delivery-remove"]').last().click();
assert.equal(await page.locator('[name^="loading_"]').first().inputValue(),'10');
await page.locator('#delivery-bilty-number').fill('MULTI-LOOKUP');
await page.locator('[data-action="delivery-add"]:not([disabled])').click();
await page.locator('[name^="loading_"]').last().fill('20');
// A unique number fills the new row without an extra selection click.
await page.evaluate(async()=>{
 const a=lookups.accounts.find(a=>a.customer&&a.status==='A'),st=lookups.stations.find(s=>s.status==='A');
 await api('save_shipment',{kind:'incoming',dated:today(),station_id:st.id,truck:'UNIQUE',items:[{account_id:a.id,bilty:'UNIQUE-ROW',qty:4,bilty_amount:'10',godown:'2',advance:'1'}]});
});
await page.locator('[data-action="delivery-next-row"]').click();
await page.locator('#delivery-bilty-number').fill('UNIQUE-ROW');
await page.waitForFunction(()=>document.querySelectorAll('.delivery-entry-row').length===3);
assert.ok((await page.locator('[data-delivery-column="due"]').innerText()).includes('281.00'));
assert.equal(await page.locator('[name^="loading_"]').first().inputValue(),'10');
await page.locator('[data-action="delivery-remove"]').last().click();
const layout=await page.evaluate(()=>{
 const table=document.querySelector('.delivery-entry-table');
 return {headers:[...table.querySelectorAll('thead th')].map(el=>el.textContent),bold:getComputedStyle(table.querySelector('.delivery-row-total')).fontWeight,overflow:document.documentElement.scrollWidth>innerWidth,scroll:document.querySelector('.delivery-grid-scroll').scrollWidth>document.querySelector('.delivery-grid-scroll').clientWidth};
});
assert.ok(layout.headers.includes('Quantity')&&layout.headers.includes('Goods type / description'));
assert.ok(Number(layout.bold)>=700);assert.equal(layout.overflow,false);assert.equal(layout.scroll,true);
assert.ok((await page.locator('[data-delivery-column="qty"]').innerText()).includes('3'));
assert.ok((await page.locator('[data-delivery-column="bilty_amount"]').innerText()).includes('200.00'));
assert.ok((await page.locator('[data-delivery-column="godown"]').innerText()).includes('40.00'));
assert.ok((await page.locator('[data-delivery-column="loading"]').innerText()).includes('30.00'));
await page.locator('[name^="discount_"]').first().fill('5');
assert.ok((await page.locator('[data-delivery-column="due"]').innerText()).includes('265.00'));
await page.locator('[name^="discount_"]').first().fill('0');
await page.setViewportSize({width:1600,height:1000});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
await page.evaluate(()=>APG.setLanguage('ur'));
await page.waitForFunction(()=>document.documentElement.dir==='rtl');
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
await page.evaluate(()=>APG.setLanguage('en'));
await page.waitForFunction(()=>document.documentElement.dir==='ltr');
await page.setViewportSize({width:390,height:844});
if(process.env.APG_DELIVERY_REVIEW){
 await page.setViewportSize({width:1600,height:1000});
 await page.locator('.delivery-entry-section').scrollIntoViewIfNeeded();
 await page.screenshot({path:process.env.APG_DELIVERY_REVIEW.replace('.png','-desktop.png')});
 await page.setViewportSize({width:390,height:844});
 await page.locator('#delivery-combined').scrollIntoViewIfNeeded();
 await page.screenshot({path:process.env.APG_DELIVERY_REVIEW});
}
await page.locator('#delivery-form [type="submit"]').click();
await page.getByRole('button',{name:'Print receipt',exact:true}).waitFor();
const text=await page.locator('#modal').innerText();assert.ok(text.includes('270.00'));
assert.equal(await page.locator('#modal tbody tr').count(),2);
assert.ok(text.includes('Party receiver 0') && text.includes('Party receiver 1'));
console.log('Mobile multi-bilty lookup, duplicate-number choice, retained inputs, removal/re-add, combined totals and single saved delivery passed.');
}finally{await browser.close();}
