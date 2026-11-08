import assert from 'node:assert/strict';
import fs from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.APG_TEST_URL);await page.locator('#f-username').fill('integration-review');await page.locator('#f-password').fill(process.env.APG_TEST_PASSWORD);await page.locator('#auth-form [type="submit"]').click();await page.locator('.nav-link[data-view="deliveries"]').waitFor();
 const raw=await page.evaluate(async id=>{const d=await api('delivery',null,{id});recordPrintContext={kind:'delivery',variant:'sheet',data:d};openThermalPreview('dialog');return d;},Number(process.env.APG_PRINT_DELIVERY_ID));
 await page.locator('#print-preview[open]').waitFor();await page.locator('#print-format').selectOption('a4');
 assert.equal(await page.locator('#print-orientation').inputValue(),'landscape');
 const source=raw.print_items??raw.items,n=value=>Number(value||0).toLocaleString('en-PK'),money=value=>n(Number(value||0)/100);
 for(const variant of ['sheet','challan','receipt','cash']){
  await page.locator('#thermal-values').selectOption(variant);await page.locator('#print-orientation').selectOption('landscape');
  const doc=page.locator('.thermal-preview-stage .legacy-delivery-document');assert.equal(await doc.getAttribute('data-legacy-report'),variant==='cash'?'R157':variant==='receipt'?'R150':'R153');
  const rows=doc.locator('table tbody tr');assert.equal(await rows.count(),source.length);
  const columns=await page.evaluate(v=>legacyDeliveryColumns(v),variant);
  for(let i=0;i<source.length;i++){const cells=await rows.nth(i).locator('td').allTextContents();for(let k=0;k<columns.length;k++){const key=columns[k][1],line=source[i];const expected=key==='bilty_total'?money(Number(line.bilty_amount||0)+Number(line.godown||0)):['bilty_amount','godown','loading','suzuki','discount','bilty_received','service_received','previous_balance','total_receivable'].includes(key)?money(line[key]):key==='qty'?n(line[key]):String(line[key]||'—');assert.equal(cells[k+1],expected,variant+' '+key);}}
  const overflow=await doc.evaluate(root=>[...root.querySelectorAll('*')].filter(el=>el.clientWidth>0&&el.scrollWidth>el.clientWidth+2).map(el=>el.className));assert.deepEqual(overflow,[],variant+' overflows');
 }
 // The same customer's older balance appears on each row but totals only once.
 const balanceFixture=await page.evaluate(async()=>{const customer=(await api('save_customer',{name:'Printed balance customer',group_code:'116'})).id;await refreshLookups();const station=lookups.stations.find(row=>row.status==='A').id;async function item(bilty,value){const s=await api('save_shipment',{kind:'incoming',dated:today(),station_id:station,truck:'PRINT-BALANCE',items:[{account_id:customer,bilty,qty:1,bilty_amount:String(value),godown:'0'}]});return (await api('shipment',null,{id:s.id})).items[0].id;}const prior=await item('PRINT-PRIOR',2000);await api('save_unified_delivery',{request_key:crypto.randomUUID(),dated:today(),receiver:'Prior receiver',items:[{id:prior}]});const a=await item('PRINT-NOW-A',900),b=await item('PRINT-NOW-B',500);const saved=await api('save_unified_delivery',{request_key:crypto.randomUUID(),dated:today(),receiver:'Print receiver',items:[{id:a},{id:b}]});const d=await api('delivery',null,{id:saved.id});recordPrintContext={kind:'delivery',variant:'sheet',data:d};thermalSnapshot=buildThermalRecord(recordPrintContext);updateThermalPage();return d;});
 assert.deepEqual(balanceFixture.items.map(row=>row.previous_balance),[200000,200000]);assert.deepEqual(balanceFixture.items.map(row=>row.total_receivable),[290000,250000]);
 const balanceDoc=page.locator('.thermal-preview-stage .legacy-delivery-document');const heads=await balanceDoc.locator('thead th').allTextContents(),previousCol=heads.indexOf('Previous Balance'),totalCol=heads.indexOf('Total Receivable');
 assert.equal(await balanceDoc.locator('tbody tr').first().locator('td').nth(previousCol).innerText(),'2,000');assert.equal(await balanceDoc.locator('tbody tr').first().locator('td').nth(totalCol).innerText(),'2,900');
 const footer=await balanceDoc.locator('tfoot tr').innerText();assert.ok(footer.includes('2,000')&&footer.includes('3,400'));assert.ok(await page.evaluate(()=>deliveryPrintBalanceTotals(recordPrintContext.data.items).previous_balance===200000));
 await page.locator('#thermal-values').selectOption('sheet');await page.screenshot({path:'/private/tmp/apg-legacy-delivery-sheet.png'});
 await page.emulateMedia({media:'print'});await page.pdf({path:'/private/tmp/apg-legacy-delivery-sheet.pdf',preferCSSPageSize:true,printBackground:true});await page.emulateMedia({media:'screen'});
 const pdf=fs.readFileSync('/private/tmp/apg-legacy-delivery-sheet.pdf').toString('latin1');assert.match(pdf,/MediaBox\s*\[0 0 841\.?\d* 594\.?\d*\]/);
 await page.locator('#print-orientation').selectOption('portrait');assert.equal(await page.locator('.thermal-preview-stage .legacy-delivery-table').count(),2);
 // Long reports retain every row and paginate rather than clipping.
 await page.evaluate(()=>{const data=structuredClone(recordPrintContext.data),rows=data.print_items??data.items;data.print_items=Array.from({length:160},(_,i)=>({...rows[i%rows.length],bilty:'PAGE-'+i}));thermalSnapshot=buildThermalRecord({kind:'delivery',variant:'sheet',data});updateThermalPage();});assert.equal(await page.locator('.thermal-preview-stage .legacy-delivery-table').first().locator('tbody tr').count(),160);
 await page.emulateMedia({media:'print'});await page.pdf({path:'/private/tmp/apg-legacy-delivery-long.pdf',preferCSSPageSize:true,printBackground:true});await page.emulateMedia({media:'screen'});
 assert.ok((fs.readFileSync('/private/tmp/apg-legacy-delivery-long.pdf').toString('latin1').match(/\/Type \/Page\b/g)||[]).length>1);
 // Thermal versions keep their source fields and fit both widths.
 await page.evaluate(()=>{thermalSnapshot=buildThermalRecord({...recordPrintContext,variant:'sheet'});});await page.locator('#print-format').selectOption('thermal');
 for(const variant of ['sheet','challan','receipt','cash'])for(const width of ['80','58']){await page.locator('#thermal-values').selectOption(variant);await page.locator('#thermal-width').selectOption(width);const overflow=await page.locator('#thermal-preview-sheet .thermal-slip').evaluate(root=>[...root.querySelectorAll('*')].filter(el=>el.clientWidth>0&&el.scrollWidth>el.clientWidth+2).map(el=>el.className));assert.deepEqual(overflow,[],variant+' '+width+' overflow');assert.ok((await page.locator('#thermal-preview-sheet').textContent()).includes('Previous Balance'));assert.ok((await page.locator('#thermal-preview-sheet').textContent()).includes('Total Receivable'));}
 assert.deepEqual(errors,[]);console.log('PASS: original delivery field values and order; R153 sheet/challan; R150 receipt; R157 cash summary; landscape/portrait A4; long-report pagination; 58/80mm thermal layouts.');
}finally{await browser.close();}
