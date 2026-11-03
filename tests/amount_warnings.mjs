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
for (const kind of ['incoming','booking']) {
 await page.evaluate((kind)=>{
  closeModal();const a=lookups.accounts.find(a=>a.customer && a.status==='A');const st=lookups.stations.find(s=>s.status==='A');
  currentForm={kind,step:1,header:{dated:today(),station_id:String(st.id),truck:'WARNING-TEST',truck_amount:'0',commission:'0'},items:Array.from({length:24},(_,n)=>({...blankItem(),account_id:a.id,bilty:'WARN-'+n,qty:'1',bilty_amount:n?'100':'37.60',advance:n?'0':'50'}))};shipmentForm();
 },kind);
 assert.ok((await page.locator('#shipment-form .note-box.warning').first().innerText()).includes('You can continue and save'));
 await page.locator('#shipment-form [type="submit"]').click();
 assert.ok((await page.locator('#shipment-form .note-box.warning').first().innerText()).includes('WARN-0'));
 await page.locator('#shipment-form [type="submit"]').click();
 await page.locator('[data-action="edit-shipment"]').waitFor();
 const snapshot=await page.evaluate(()=>recordPrintContext.data);
 assert.equal(snapshot.items.length,24);assert.equal(snapshot.items[0].advance,5000);
 // Also exercise edit and review using the same high advance.
 await page.locator('[data-action="edit-shipment"]').click();
 await page.locator('#shipment-form [type="submit"]').click();
 await page.locator('#shipment-form [type="submit"]').click();
 await page.locator('#shipment-form [type="submit"]').click();
 await page.locator('[data-action="edit-shipment"]').waitFor();
}
console.log('24-bilty incoming and booking: excess advance warns at list/review and saves through create/edit.');
}finally{await browser.close();}
