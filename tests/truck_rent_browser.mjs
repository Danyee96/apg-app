import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(process.env.APG_TEST_URL);await page.locator('#f-username').fill('integration-review');await page.locator('#f-password').fill(process.env.APG_TEST_PASSWORD);await page.locator('#auth-form [type=submit]').click();await page.locator('#nav-incoming').waitFor();
 const saved=await page.evaluate(async()=>{const station=lookups.stations.find(s=>s.status==='A').id,customer=(await api('save_customer',{name:'Truck Formula Customer',group_code:'116'})).id;return api('save_shipment',{kind:'incoming',dated:today(),station_id:station,truck:'TRUCK-FORMULA-UI',truck_amount:'300',labour_bonus:'50',munshi_bonus:'25',items:[{account_id:customer,bilty:'TRUCK-FORMULA',qty:1,bilty_amount:'1000',godown:'500',advance:'100',service_advance:'30'}]});});
 assert.equal(await page.locator('#nav-incoming [data-view="truck-rent"]').count(),0);await page.evaluate(()=>navigate('incoming'));await page.locator('#list-search').fill('TRUCK-FORMULA-UI');await page.waitForFunction(()=>listData?.total===1);assert.match(await page.locator('#main table tbody').innerText(),/Rs 1,025/);
 await page.locator('#main [data-action=shipment]').first().click();await page.locator('#modal[open]').waitFor();assert.match(await page.locator('#modal').innerText(),/Truck rent\s+Rs 1,025/);
 const calculated=await page.evaluate(()=>shipmentTruckBalance({items:[{bilty_amount:'1000',godown:'500',advance:'100',service_advance:'30'}],header:{truck_amount:'300',labour_bonus:'50',munshi_bonus:'25'}}));assert.equal(calculated,'Rs 1,025');
 assert.deepEqual(errors,[]);console.log('PASS: incoming truck rent formula, detail, draft and removed tab');
}finally{await browser.close();}
