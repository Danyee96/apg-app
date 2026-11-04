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
const result=await page.evaluate(()=>{
 const item={bilty:'ORDER-TEST',qty:2,detail:'Cotton shoes',bilty_amount:20000,godown:7000,loading:0,suzuki:0,advance:0,total:27000,status:'pending'};
 const draft={...item};for(const key of ['bilty_amount','godown','loading','suzuki','advance']) draft[key]=String(item[key]/100);
 const saved=shipmentBreakdown([item],'incoming',{truck_amount:10000});
 const review=shipmentBreakdown([draft],'incoming',{truck_amount:'100'},true);
 if(saved!==review)throw Error('Review and saved calculations differ');
 const wrapper=document.createElement('div');wrapper.innerHTML=saved;
 const metric=[...wrapper.querySelectorAll('.detail-cell')].find(el=>el.textContent.includes('Bilty amounts less truck delivery'));
 if(!metric?.textContent.includes('100.00'))throw Error('Godown included in truck balance');
 const table=document.createElement('div');table.innerHTML=shipmentDetailTable([item],'incoming');
 const headings=[...table.querySelectorAll('th')].map(el=>el.textContent);
 if(headings.indexOf('Qty')>headings.indexOf('Goods type / description'))throw Error('Quantity must precede goods description');
 const cells=[...table.querySelectorAll('tbody td')].map(el=>el.textContent);
 if(cells[1]!=='2'||cells[2]!=='Cotton shoes')throw Error('Table values are misaligned');
 const snapshot=buildThermalRecord({kind:'shipment',data:{kind:'incoming',reference:'ORDER-TEST',dated:today(),truck_amount:10000,items:[item]}});
 if(snapshot.html.indexOf('Quantity')>snapshot.html.indexOf('Cotton shoes'))throw Error('Print quantity order differs');
 const print=document.createElement('div');print.innerHTML=snapshot.html;
 const balance=[...print.querySelectorAll('.slip-money-row')].find(el=>el.textContent.includes('Truck balance'));
 if(!balance?.textContent.includes('100.00'))throw Error('Print balance differs');
 const a4=buildA4Document(snapshot);if(a4.indexOf('<th>Quantity</th>')>a4.indexOf('<th>Goods</th>'))throw Error('A4 quantity order differs');
 session.profile.role='operations';session.permissions=['incoming.view'];
 const restricted=shipmentBreakdown([item],'incoming',{truck_amount:10000});
 if(restricted.includes('Bilty amounts less truck delivery'))throw Error('Restricted summary exposed');
 return true;
});assert.ok(result);
console.log('Quantity/description columns aligned; saved/review/thermal/A4 truck balance excludes godown; Operations restriction retained.');
}finally{await browser.close();}
