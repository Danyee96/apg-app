"""Unified delivery accounting, service reclassification and payment history on a disposable DB."""
import json,urllib.request,urllib.parse,urllib.error,http.cookiejar,sqlite3,uuid
from integration import main

def check(base,database,password):
 class Client:
  def __init__(self):
   self.op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.token='';self.token=self.call('session')['csrf']
  def call(self,action,data=None,params=None,status=200):
   request=urllib.request.Request(base+urllib.parse.urlencode({'action':action,**(params or {})}),data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':self.token})
   try:
    with self.op.open(request,timeout=120) as response:
     raw=response.read();
     try:result=json.loads(raw)
     except Exception:raise AssertionError(raw.decode()[:3000])
     assert response.status==status,(action,response.status,status,result);return result
   except urllib.error.HTTPError as e:
    result=json.load(e);assert e.code==status,(action,e.code,status,result);return result
 admin=Client();admin.call('login',{'username':'integration-review','password':password});lookup=admin.call('lookups');station=next(row['id'] for row in lookup['stations'] if row['status']=='A');cash=lookup['cash_accounts'][0]['id'];customer=admin.call('save_customer',{'name':'Unified account customer','group_code':'116'})['id'];day='2026-11-07'
 def shipment(label):
  r=admin.call('save_shipment',{'kind':'incoming','dated':day,'station_id':station,'truck':'UNIFIED','items':[{'account_id':customer,'bilty':label,'qty':2,'bilty_amount':'1000','godown':'200'}]},status=201)
  return admin.call('shipment',params={'id':r['id']})['items'][0]['id']
 def payload(item,bilty='500',loading='20',suzuki='30'):
  return {'request_key':str(uuid.uuid4()),'dated':day,'received_date':day,'receiver':'Unified receiver','cash_account_id':cash,'items':[{'id':item,'discount':'0','loading':'100','suzuki':'50','bilty_received':bilty,'loading_received':loading,'suzuki_received':suzuki}]}
 loading_before=admin.call('ledger',params={'account_id':'SYS-LOADING-RECEIVABLE'})['closing'];suzuki_before=admin.call('ledger',params={'account_id':'SYS-SUZUKI-RECEIVABLE'})['closing']
 data=payload(shipment('UNIFIED-001'));saved=admin.call('save_unified_delivery',data,status=201);assert admin.call('save_unified_delivery',data,status=201)['replayed']
 doc=admin.call('unified_delivery',params={'id':saved['id']});line=doc['lines'][0]
 assert line['last_bilty_received']==50000 and line['last_bilty_received_date']==day
 assert line['bilty_balance']==70000 and line['loading_balance']==8000 and line['suzuki_balance']==2000
 assert admin.call('ledger',params={'account_id':customer})['closing']==70000
 assert admin.call('ledger',params={'account_id':'SYS-LOADING-RECEIVABLE'})['closing']==loading_before+8000
 assert admin.call('ledger',params={'account_id':'SYS-SUZUKI-RECEIVABLE'})['closing']==suzuki_before+2000
 assert line['payment_status']=='partially_paid' and not line['walkin']
 old_dates=(line['bilty_received_date'],line['loading_received_date'],line['suzuki_received_date'])
 def existing(doc,b='0',l='0',s='0'):
  line=doc['lines'][0];return {'id':doc['header']['id'],'version':doc['version'],'request_key':str(uuid.uuid4()),'dated':doc['header']['dated'],'received_date':'2026-11-08','receiver':doc['header']['receiver'],'mobile':doc['header']['mobile'],'cnic':doc['header']['cnic'],'remarks':doc['header']['remarks'],'cash_account_id':cash,'items':[{'id':line['delivery_item_id'],'discount':str(line['discount']/100),'loading':str(line['loading']/100),'suzuki':str(line['suzuki']/100),'bilty_received':b,'loading_received':l,'suzuki_received':s}]}
 # An explicit zero corrects the prior bilty receipt without touching service cash.
 original_customer=customer;customer=admin.call('save_customer',{'name':'Receipt correction customer','group_code':'116'})['id']
 corrected_payload=payload(shipment('UNIFIED-CORRECT-ZERO'),'500','20','30');corrected_payload['items'][0].update({'loading':'20','suzuki':'30'})
 corrected_id=admin.call('save_unified_delivery',corrected_payload,status=201)['id']
 corrected_doc=admin.call('unified_delivery',params={'id':corrected_id});before=corrected_doc['lines'][0]
 unsupported=existing(corrected_doc);unsupported['items'][0].update({'bilty_correction':True,'bilty_correction_previous':'500','bilty_correction_amount':'1500'})
 admin.call('save_unified_delivery',unsupported,status=409)
 assert admin.call('unified_delivery',params={'id':corrected_id})['lines'][0]['bilty_received']==50000
 for old,new in [(500,300),(300,700),(700,500)]:
  edit=existing(corrected_doc);edit['items'][0].update({'bilty_correction':True,'bilty_correction_previous':str(old),'bilty_correction_amount':str(new)})
  admin.call('save_unified_delivery',edit,status=201);corrected_doc=admin.call('unified_delivery',params={'id':corrected_id})
  assert corrected_doc['lines'][0]['bilty_received']==new*100 and corrected_doc['lines'][0]['last_bilty_received']==new*100
  assert corrected_doc['lines'][0]['service_received']==5000
 cash_before_correction=admin.call('ledger',params={'account_id':cash})['closing'];customer_before_correction=admin.call('ledger',params={'account_id':customer})['closing']
 zero_correction=existing(corrected_doc);zero_correction['items'][0].update({'bilty_correction':True,'bilty_correction_previous':'500','bilty_correction_amount':'0'})
 admin.call('save_unified_delivery',zero_correction,status=201)
 assert admin.call('save_unified_delivery',zero_correction,status=201)['replayed']
 corrected_doc=admin.call('unified_delivery',params={'id':corrected_id});corrected=corrected_doc['lines'][0]
 assert corrected['bilty_received']==0 and corrected['bilty_balance']==120000
 assert corrected['service_received']==before['service_received']==5000
 assert admin.call('ledger',params={'account_id':cash})['closing']==cash_before_correction-50000
 assert admin.call('ledger',params={'account_id':customer})['closing']==customer_before_correction+50000
 assert sum(item['bilty_received'] for receipt in corrected_doc['receipts'] for item in receipt['items'])==0
 assert not corrected.get('last_bilty_received')
 customer=original_customer
 # Reopening/saving zero increments leaves dates and cumulative payments untouched.
 admin.call('save_unified_delivery',existing(doc),status=201);again=admin.call('unified_delivery',params={'id':saved['id']});assert len(again['receipts'])==1 and again['lines'][0]['last_bilty_received']==50000
 assert tuple(again['lines'][0][key] for key in ['bilty_received_date','loading_received_date','suzuki_received_date'])==old_dates
 later=existing(again,'700','80','20');admin.call('save_unified_delivery',later,status=201);assert admin.call('save_unified_delivery',later,status=201)['replayed']
 settled=admin.call('unified_delivery',params={'id':saved['id']});assert settled['lines'][0]['payment_status']=='fully_paid' and len(settled['receipts'])==2
 assert admin.call('ledger',params={'account_id':customer})['closing']==0
 assert settled['receipts'][0]['dated']=='2026-11-07' and settled['receipts'][1]['dated']=='2026-11-08'
 assert settled['lines'][0]['loading_received_date']=='2026-11-08'
 assert admin.call('ledger',params={'account_id':'SYS-LOADING-RECEIVABLE'})['closing']==loading_before
 assert admin.call('ledger',params={'account_id':'SYS-SUZUKI-RECEIVABLE'})['closing']==suzuki_before
 # A permitted charge correction creates a balanced adjustment, not overwritten receipts.
 correction=existing(settled);correction['items'][0]['discount']='100';admin.call('save_unified_delivery',correction,status=201)
 revised=admin.call('unified_delivery',params={'id':saved['id']});assert len(revised['receipts'])==2 and revised['lines'][0]['bilty_balance']==-10000
 # Full initial bilty payment sets walk-in classification independently of unpaid services.
 full=admin.call('save_unified_delivery',payload(shipment('UNIFIED-FULL'),'1200','0','0'),status=201);doc=admin.call('unified_delivery',params={'id':full['id']});assert doc['header']['delivery_mode']=='walkin' and doc['lines'][0]['walkin'] and doc['lines'][0]['service_balance']==15000
 # Loading credit must never settle unpaid Suzuki or customer debt.
 over=admin.call('save_unified_delivery',payload(shipment('UNIFIED-SERVICE-CREDIT'),'1200','200','0'),status=201);overdoc=admin.call('unified_delivery',params={'id':over['id']})
 assert overdoc['lines'][0]['service_outstanding']==5000 and overdoc['lines'][0]['service_credit']==10000 and overdoc['lines'][0]['payment_status']=='partially_paid'
 assert admin.call('unified_deliveries',params={'search':'UNIFIED-SERVICE-CREDIT'})['rows'][0]['outstanding']==5000
 admin.call('save_unified_delivery',existing(overdoc,'0','0','50'),status=201);overdoc=admin.call('unified_delivery',params={'id':over['id']})
 assert overdoc['lines'][0]['payment_status']=='fully_paid' and overdoc['lines'][0]['service_credit']==10000
 # Zero initial payment creates an outstanding customer debt, excluding service charges.
 zero=admin.call('save_unified_delivery',payload(shipment('UNIFIED-ZERO'),'0','0','0'),status=201);doc=admin.call('unified_delivery',params={'id':zero['id']});assert doc['lines'][0]['payment_status']=='pending_payment' and not doc['receipts'] and doc['lines'][0]['bilty_received_date'] is None
 # Operator collections post immediately, retain category values and are visible to admin.
 operator_id=admin.call('save_user',{'username':'unified-ops','full_name':'Unified operator','role':'operations','active':1,'permissions':['deliveries.create'],'password':'Unified-ops-2026'},status=201)['id']
 ops=Client();ops.call('login',{'username':'unified-ops','password':'Unified-ops-2026'})
 # Corrections to a munshi receipt create a matching negative ledger adjustment.
 original_customer=customer;customer=admin.call('save_customer',{'name':'Munshi correction customer','group_code':'116'})['id']
 ops_payload=payload(shipment('OPS-CORRECT-ZERO'),'500','0','0');ops_delivery=ops.call('save_unified_delivery',ops_payload,status=201)
 ops_doc=admin.call('unified_delivery',params={'id':ops_delivery['id']});ops_fix=existing(ops_doc);ops_fix['items'][0].update({'bilty_correction':True,'bilty_correction_previous':'500','bilty_correction_amount':'0'})
 admin.call('save_unified_delivery',ops_fix,status=201)
 dbcheck=sqlite3.connect(database);entries=dbcheck.execute('SELECT e.kind,e.amount FROM operator_cash_entries e JOIN delivery_cash_receipts r ON r.id=e.receipt_id WHERE r.delivery_id=? ORDER BY e.id',(ops_delivery['id'],)).fetchall();dbcheck.close()
 assert entries==[('collection',50000),('expense',50000)],entries
 customer=original_customer
 # Service advance is frozen and collected once, even with no new cash entered.
 advance_shipment=admin.call('save_shipment',{'kind':'incoming','dated':day,'station_id':station,'truck':'ADVANCE','items':[{'account_id':customer,'bilty':'SERVICE-ADVANCE','qty':1,'bilty_amount':'1000','loading':'100','suzuki':'50','service_advance':'120'}]},status=201)
 arrival=admin.call('shipment',params={'id':advance_shipment['id']});advance_item=arrival['items'][0];assert advance_item['service_advance']==12000
 before_cash=admin.call('ledger',params={'account_id':cash})['closing'];before_ops=ops.call('daily_expense')
 advance_payload=payload(advance_item['id'],'0','0','0');advance_delivery=ops.call('save_unified_delivery',advance_payload,status=201)
 advance_doc=admin.call('unified_delivery',params={'id':advance_delivery['id']});advance_line=advance_doc['lines'][0]
 assert advance_line['service_advance']==12000 and advance_line['service_received']==12000 and advance_line['service_outstanding']==3000
 assert admin.call('ledger',params={'account_id':cash})['closing']==before_cash+12000
 conn=sqlite3.connect(database);ledger=conn.execute('SELECT e.amount FROM operator_cash_entries e JOIN delivery_cash_receipts r ON r.id=e.receipt_id WHERE r.delivery_id=?',(advance_delivery['id'],)).fetchall();assert ledger==[]
 after_advance=ops.call('daily_expense');assert after_advance['totals']['received']==before_ops['totals']['received']
 assert ops.call('save_unified_delivery',advance_payload,status=201)['replayed']
 ops.call('save_unified_delivery',existing(advance_doc),status=201);again_advance=admin.call('unified_delivery',params={'id':advance_delivery['id']});assert len(again_advance['receipts'])==1
 assert conn.execute('SELECT count(*) FROM operator_cash_entries e JOIN delivery_cash_receipts r ON r.id=e.receipt_id WHERE r.delivery_id=?',(advance_delivery['id'],)).fetchone()[0]==0
 ops.call('save_unified_delivery',existing(again_advance,'0','0','30'),status=201);settled_advance=admin.call('unified_delivery',params={'id':advance_delivery['id']});assert settled_advance['lines'][0]['service_received']==15000 and settled_advance['lines'][0]['service_outstanding']==0
 assert conn.execute('SELECT SUM(e.amount) FROM operator_cash_entries e JOIN delivery_cash_receipts r ON r.id=e.receipt_id WHERE r.delivery_id=?',(advance_delivery['id'],)).fetchone()[0]==3000
 assert ops.call('daily_expense')['totals']['received']==before_ops['totals']['received']+3000;conn.close()
 # A delivery receipt includes previously paid service advance in its recorded
 # total, but only newly received cash belongs in the Munshi ledger.
 cash_before_exact=admin.call('ledger',params={'account_id':cash})['closing']
 exact=admin.call('save_shipment',{'kind':'incoming','dated':day,'station_id':station,'truck':'ADVANCE-EXACT','items':[{'account_id':customer,'bilty':'ADVANCE-EXACT','qty':1,'bilty_amount':'10000','advance':'240','loading':'240','suzuki':'0','service_advance':'240'}]},status=201)
 exact_item=admin.call('shipment',params={'id':exact['id']})['items'][0]['id'];exact_payload=payload(exact_item,'7800','0','0');exact_payload['items'][0].update(loading='240',suzuki='0')
 exact_delivery=ops.call('save_unified_delivery',exact_payload,status=201);exact_doc=admin.call('unified_delivery',params={'id':exact_delivery['id']})
 assert exact_doc['receipts'][0]['amount']==804000
 exact_voucher=admin.call('voucher',params={'id':exact_doc['receipts'][0]['voucher_id']})
 assert sum(line['debit'] for line in exact_voucher['lines'] if line['account_id']==cash)==780000
 assert sum(line['debit'] for line in exact_voucher['lines'] if line['account_id']=='SYS-BILTY-CLEARING')==24000
 assert admin.call('ledger',params={'account_id':cash})['closing']==cash_before_exact+804000
 conn=sqlite3.connect(database);exact_entry=conn.execute('SELECT e.id,e.period_id,e.amount FROM operator_cash_entries e JOIN delivery_cash_receipts r ON r.id=e.receipt_id WHERE r.delivery_id=?',(exact_delivery['id'],)).fetchone();assert exact_entry[2]==780000
 # Simulate the old saved amount to verify the live ledger also corrects history.
 conn.execute('DROP TRIGGER operator_cash_immutable_update')
 conn.execute('UPDATE operator_cash_entries SET amount=804000 WHERE id=?',(exact_entry[0],))
 conn.execute("CREATE TRIGGER operator_cash_immutable_update BEFORE UPDATE ON operator_cash_entries BEGIN SELECT RAISE(ABORT,'Munshi cash entries cannot be edited.'); END")
 conn.commit();conn.close()
 corrected_ops=ops.call('daily_expense');assert corrected_ops['totals']['received']==before_ops['totals']['received']+3000+780000
 exact_row=next(row for row in corrected_ops['rows'] if row['receipt_id'] is not None and row['title']=='Delivery '+exact_doc['header']['reference']);assert exact_row['amount']==780000
 # Reducing prepaid Suzuki before saving refunds the excess once and keeps
 # the retained loading payment and the munshi's cash balance correct.
 refundable=admin.call('save_shipment',{'kind':'incoming','dated':day,'station_id':station,'truck':'REFUND','items':[{'account_id':customer,'bilty':'SERVICE-REFUND','qty':1,'bilty_amount':'1000','loading':'500','suzuki':'500','service_advance':'1000'}]},status=201)
 refund_item=admin.call('shipment',params={'id':refundable['id']})['items'][0]['id']
 refund_request=payload(refund_item,'0','0','0');refund_request['items'][0].update(loading='500',suzuki='0',service_received='500');refund_request['items'][0].pop('loading_received');refund_request['items'][0].pop('suzuki_received')
 refund_delivery=ops.call('save_unified_delivery',refund_request,status=201);refund_doc=admin.call('unified_delivery',params={'id':refund_delivery['id']});refund_line=refund_doc['lines'][0]
 assert refund_line['service_advance']==100000 and refund_line['service_refunded']==50000 and refund_line['service_received']==50000 and refund_line['service_outstanding']==0 and refund_line['service_credit']==0
 conn=sqlite3.connect(database);ledger=conn.execute('SELECT e.kind,e.amount FROM operator_cash_entries e JOIN delivery_cash_receipts r ON r.id=e.receipt_id WHERE r.delivery_id=? ORDER BY e.id',(refund_delivery['id'],)).fetchall();assert ledger==[('expense',50000)]
 assert ops.call('save_unified_delivery',refund_request,status=201)['replayed'];ops.call('save_unified_delivery',existing(refund_doc),status=201)
 assert conn.execute('SELECT COUNT(*) FROM delivery_service_refunds f JOIN delivery_items i ON i.id=f.delivery_item_id WHERE i.delivery_id=?',(refund_delivery['id'],)).fetchone()[0]==1;conn.close()
 # An existing delivery receives the same adjustment after its charges change.
 editable=admin.call('save_shipment',{'kind':'incoming','dated':day,'station_id':station,'truck':'EDIT-REFUND','items':[{'account_id':customer,'bilty':'SERVICE-EDIT-REFUND','qty':1,'bilty_amount':'1000','loading':'100','suzuki':'50','service_advance':'150'}]},status=201)
 edit_item=admin.call('shipment',params={'id':editable['id']})['items'][0]['id'];edit_delivery=ops.call('save_unified_delivery',payload(edit_item,'0','0','0'),status=201)
 edit_doc=admin.call('unified_delivery',params={'id':edit_delivery['id']});edit_request=existing(edit_doc);edit_request['items'][0]['suzuki']='0'
 admin.call('save_user',{'username':'refund-second-ops','full_name':'Second refund operator','role':'operations','active':1,'permissions':['deliveries.create'],'password':'Refund-ops-2026'},status=201)
 admin.call('save_unified_delivery',edit_request,status=422);unchanged=admin.call('unified_delivery',params={'id':edit_delivery['id']});assert unchanged['lines'][0]['suzuki']==5000 and unchanged['lines'][0]['service_refunded']==0
 edit_request['refund_operator_id']=operator_id;admin.call('save_unified_delivery',edit_request,status=201)
 edit_doc=admin.call('unified_delivery',params={'id':edit_delivery['id']});assert edit_doc['lines'][0]['service_refunded']==5000 and edit_doc['lines'][0]['service_received']==10000 and edit_doc['lines'][0]['service_credit']==0
 conn=sqlite3.connect(database);assert conn.execute('SELECT e.operator_id,e.kind,e.amount FROM operator_cash_entries e JOIN delivery_cash_receipts r ON r.id=e.receipt_id WHERE r.delivery_id=? AND e.kind=\'expense\'',(edit_delivery['id'],)).fetchone()==(operator_id,'expense',5000);conn.close()
 customer_before=admin.call('ledger',params={'account_id':customer})['closing'];cash_before=admin.call('ledger',params={'account_id':cash})['closing']
 proposal=payload(shipment('UNIFIED-OPS'),'1200','100','50');pending=ops.call('save_unified_delivery',proposal,status=201);assert not pending['pending_cash']
 assert admin.call('ledger',params={'account_id':customer})['closing']==customer_before
 assert admin.call('ledger',params={'account_id':cash})['closing']==cash_before+135000
 approved=admin.call('unified_delivery',params={'id':pending['id']});assert approved['lines'][0]['payment_status']=='fully_paid' and approved['lines'][0]['walkin'] and not approved['pending_cash']
 assert approved['lines'][0]['loading_received']==10000 and approved['lines'][0]['suzuki_received']==5000 and approved['receipts'][0]['created_by']=='unified-ops'
 assert ops.call('save_unified_delivery',proposal,status=201)['replayed']
 admin.call('save_unified_delivery',{**proposal,'request_key':str(uuid.uuid4())},status=409)
 invalid=payload(shipment('UNIFIED-INVALID'),'-1');admin.call('save_unified_delivery',invalid,status=422)
 assert admin.call('unified_deliveries',params={'search':'UNIFIED-001'})['rows'][0]['id']==saved['id']
 # A legacy combined receipt is preserved and its uncollected service balance
 # moves from the customer to the legacy service control with one adjustment.
 legacyItem=shipment('UNIFIED-LEGACY-COMPAT');legacy=admin.call('save_delivery',{'dated':day,'receiver':'Legacy compatibility','items':[{'id':legacyItem,'loading':'100','suzuki':'50'}]},status=201)
 c=sqlite3.connect(database);c.execute('UPDATE delivery_cash_invoices SET accounting_model=0 WHERE delivery_id=?',(legacy['id'],));c.commit()
 original=admin.call('delivery_cash_invoice',params={'id':legacy['id']});before_balance=admin.call('ledger',params={'account_id':customer})['closing']
 admin.call('receive_delivery_cash',{'delivery_id':legacy['id'],'version':original['version'],'request_key':str(uuid.uuid4()),'dated':'2026-11-08','cash_account_id':cash,'items':[{'id':original['lines'][0]['delivery_item_id'],'bilty_received':'500','service_received':'50'}]},status=201)
 old_receipt=c.execute('SELECT id,delivery_id,request_key,dated,cash_account_id,notes,created_by,voucher_id,request_hash FROM delivery_cash_receipts WHERE delivery_id=?',(legacy['id'],)).fetchall()
 assert admin.call('ledger',params={'account_id':customer})['closing']==before_balance+80000
 converted=admin.call('unified_delivery',params={'id':legacy['id']});assert converted['header']['legacy_services']==1 and converted['lines'][0]['legacy_service_received']==5000
 assert admin.call('ledger',params={'account_id':customer})['closing']==before_balance+70000
 journals=c.execute('SELECT count(*) FROM vouchers').fetchone()[0];admin.call('unified_delivery',params={'id':legacy['id']});assert c.execute('SELECT count(*) FROM vouchers').fetchone()[0]==journals
 assert old_receipt==c.execute('SELECT id,delivery_id,request_key,dated,cash_account_id,notes,created_by,voucher_id,request_hash FROM delivery_cash_receipts WHERE delivery_id=?',(legacy['id'],)).fetchall()
 # A new combined payment on an old combined account retains its legacy bucket.
 legacy_more=existing(converted);legacy_more['items'][0].pop('loading_received');legacy_more['items'][0].pop('suzuki_received');legacy_more['items'][0]['service_received']='25';admin.call('save_unified_delivery',legacy_more,status=201)
 legacy_after=admin.call('unified_delivery',params={'id':legacy['id']});assert legacy_after['lines'][0]['legacy_service_received']==7500 and legacy_after['lines'][0]['loading_received']==0 and legacy_after['lines'][0]['suzuki_received']==0
 # Reopening an original imported document must not post its old cash or charges again.
 historical=c.execute('SELECT id FROM deliveries WHERE cash_workflow=0 AND legacy_id IS NOT NULL LIMIT 1').fetchone()
 if historical:
  before_lines=c.execute('SELECT count(*),sum(debit),sum(credit) FROM voucher_lines').fetchone()
  before_raw=c.execute('SELECT count(*),sum(COALESCE(REC_BAMT,0)),sum(COALESCE(REC_SAMT,0)) FROM legacy_IND').fetchone()
  imported=admin.call('unified_delivery',params={'id':historical[0]});assert imported['lines']
  assert before_lines==c.execute('SELECT count(*),sum(debit),sum(credit) FROM voucher_lines').fetchone()
  assert before_raw==c.execute('SELECT count(*),sum(COALESCE(REC_BAMT,0)),sum(COALESCE(REC_SAMT,0)) FROM legacy_IND').fetchone()
 # REC S AMT is split server-side against outstanding loading then Suzuki.
 combined=payload(shipment('UNIFIED-COMBINED'),'1200','0','0');combined['items'][0].pop('loading_received');combined['items'][0].pop('suzuki_received');combined['items'][0]['service_received']='120';combined['items'][0]['service_received_date']=day
 combined_id=ops.call('save_unified_delivery',combined,status=201)['id'];combined_doc=admin.call('unified_delivery',params={'id':combined_id});assert combined_doc['lines'][0]['loading_received']==10000 and combined_doc['lines'][0]['suzuki_received']==2000
 assert combined_doc['lines'][0]['service_outstanding']==3000 and combined_doc['lines'][0]['loading_received_date']==day and combined_doc['lines'][0]['suzuki_received_date']==day
 more=existing(combined_doc);more['items'][0].pop('loading_received');more['items'][0].pop('suzuki_received');more['items'][0]['service_received']='30';ops.call('save_unified_delivery',more,status=201)
 combined_doc=admin.call('unified_delivery',params={'id':combined_id});assert combined_doc['lines'][0]['payment_status']=='fully_paid' and combined_doc['lines'][0]['loading_received']==10000 and combined_doc['lines'][0]['suzuki_received']==5000 and len(combined_doc['receipts'])==2
 zero_more=existing(combined_doc);zero_more['items'][0].pop('loading_received');zero_more['items'][0].pop('suzuki_received');zero_more['items'][0]['service_received']='0';ops.call('save_unified_delivery',zero_more,status=201)
 assert len(admin.call('unified_delivery',params={'id':combined_id})['receipts'])==2
 extra=existing(combined_doc);extra['items'][0].pop('loading_received');extra['items'][0].pop('suzuki_received');extra['items'][0]['service_received']='20';ops.call('save_unified_delivery',extra,status=201)
 credited=admin.call('unified_delivery',params={'id':combined_id});assert credited['lines'][0]['service_credit']==2000 and credited['lines'][0]['bilty_balance']==0
 mixed=existing(credited);mixed['items'][0]['service_received']='1';mixed['items'][0]['loading_received']='1';admin.call('save_unified_delivery',mixed,status=422)
 # Report filters and analytics cover the full matching set, not only one page.
 report_ids=[]
 for n,(b,l,s,date) in enumerate([('0','0','0','2026-11-07'),('500','0','0','2026-11-08'),('1200','100','50','2026-11-08')]):
  p=payload(shipment('REPORT-FLOW-'+str(n)),b,l,s);p['dated']=p['received_date']=date;report_ids.append(admin.call('save_unified_delivery',p,status=201)['id'])
 report=admin.call('unified_deliveries',params={'search':'REPORT-FLOW-','sort':'balance_high'})
 assert report['total']==3 and [r['id'] for r in report['rows']]==report_ids
 assert report['stats']['fully_paid']==report['stats']['partially_paid']==report['stats']['pending_payment']==1
 assert report['stats']['bilty_due']==360000 and report['stats']['service_due']==45000 and report['stats']['collected']==185000 and report['stats']['outstanding']==220000
 for status,expected in [('pending_payment',0),('partially_paid',1),('fully_paid',2)]:
  filtered=admin.call('unified_deliveries',params={'search':'REPORT-FLOW-','payment_status':status,'from':'2026-11-07','to':'2026-11-08'})
  assert filtered['total']==1 and filtered['rows'][0]['id']==report_ids[expected] and filtered['stats'][status]==1
 single=admin.call('unified_deliveries',params={'search':'REPORT-FLOW-','from':'2026-11-07','to':'2026-11-07'});assert single['total']==1 and single['rows'][0]['id']==report_ids[0]
 period=admin.call('unified_deliveries',params={'search':'REPORT-FLOW-','from':'2026-11-08','to':'2026-11-08','sort':'received_high'});assert period['total']==2 and period['rows'][0]['id']==report_ids[2]
 empty=admin.call('unified_deliveries',params={'search':'REPORT-FLOW-','payment_status':'fully_paid','from':'2026-11-07','to':'2026-11-07'});assert empty['total']==0 and empty['stats']['collected']==0
 admin.call('unified_deliveries',params={'from':'2026-11-08','to':'2026-11-07'},status=422)
 c.close()
 c=sqlite3.connect(database);assert not c.execute('SELECT voucher_id FROM voucher_lines GROUP BY voucher_id HAVING SUM(debit)<>SUM(credit)').fetchall();assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok';c.close()
 print('PASS: separate bilty/loading/Suzuki accounting; partial/full/zero initial collections; walk-in classification; cumulative later receipts; dates retained on reopen/zero; adjustment journals; retry safety; immediate operator cash; ledger reconciliation.')
if __name__=='__main__':main(check)
