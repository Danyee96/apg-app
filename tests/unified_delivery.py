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
 assert line['bilty_balance']==70000 and line['loading_balance']==8000 and line['suzuki_balance']==2000
 assert admin.call('ledger',params={'account_id':customer})['closing']==70000
 assert admin.call('ledger',params={'account_id':'SYS-LOADING-RECEIVABLE'})['closing']==loading_before+8000
 assert admin.call('ledger',params={'account_id':'SYS-SUZUKI-RECEIVABLE'})['closing']==suzuki_before+2000
 assert line['payment_status']=='partially_paid' and not line['walkin']
 old_dates=(line['bilty_received_date'],line['loading_received_date'],line['suzuki_received_date'])
 def existing(doc,b='0',l='0',s='0'):
  line=doc['lines'][0];return {'id':doc['header']['id'],'version':doc['version'],'request_key':str(uuid.uuid4()),'dated':doc['header']['dated'],'received_date':'2026-11-08','receiver':doc['header']['receiver'],'mobile':doc['header']['mobile'],'cnic':doc['header']['cnic'],'remarks':doc['header']['remarks'],'cash_account_id':cash,'items':[{'id':line['delivery_item_id'],'discount':str(line['discount']/100),'loading':str(line['loading']/100),'suzuki':str(line['suzuki']/100),'bilty_received':b,'loading_received':l,'suzuki_received':s}]}
 # Reopening/saving zero increments leaves dates and cumulative payments untouched.
 admin.call('save_unified_delivery',existing(doc),status=201);again=admin.call('unified_delivery',params={'id':saved['id']});assert len(again['receipts'])==1
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
 # Operator's separate-category collection must retain typed values for approval.
 admin.call('save_user',{'username':'unified-ops','full_name':'Unified operator','role':'operations','active':1,'permissions':['deliveries.create'],'password':'Unified-ops-2026'},status=201)
 ops=Client();ops.call('login',{'username':'unified-ops','password':'Unified-ops-2026'})
 customer_before=admin.call('ledger',params={'account_id':customer})['closing'];cash_before=admin.call('ledger',params={'account_id':cash})['closing']
 proposal=payload(shipment('UNIFIED-OPS'),'1200','100','50');pending=ops.call('save_unified_delivery',proposal,status=201);assert pending['pending_cash']
 assert admin.call('ledger',params={'account_id':customer})['closing']==customer_before+120000
 assert admin.call('ledger',params={'account_id':cash})['closing']==cash_before
 review=admin.call('cash_collection_submission',params={'id':pending['cash_id']});assert review['payload']['items'][0]['loading_received']=='100.00' and review['payload']['items'][0]['suzuki_received']=='50.00'
 admin.call('approve_cash_collection',{**review['payload'],'pending_id':review['id'],'pending_version':review['version']},status=201)
 approved=admin.call('unified_delivery',params={'id':pending['id']});assert approved['lines'][0]['payment_status']=='fully_paid' and approved['lines'][0]['walkin']
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
 # Reopening an original imported document must not post its old cash or charges again.
 historical=c.execute('SELECT id FROM deliveries WHERE cash_workflow=0 AND legacy_id IS NOT NULL LIMIT 1').fetchone()
 if historical:
  before_lines=c.execute('SELECT count(*),sum(debit),sum(credit) FROM voucher_lines').fetchone()
  before_raw=c.execute('SELECT count(*),sum(COALESCE(REC_BAMT,0)),sum(COALESCE(REC_SAMT,0)) FROM legacy_IND').fetchone()
  imported=admin.call('unified_delivery',params={'id':historical[0]});assert imported['lines']
  assert before_lines==c.execute('SELECT count(*),sum(debit),sum(credit) FROM voucher_lines').fetchone()
  assert before_raw==c.execute('SELECT count(*),sum(COALESCE(REC_BAMT,0)),sum(COALESCE(REC_SAMT,0)) FROM legacy_IND').fetchone()
 c.close()
 c=sqlite3.connect(database);assert not c.execute('SELECT voucher_id FROM voucher_lines GROUP BY voucher_id HAVING SUM(debit)<>SUM(credit)').fetchall();assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok';c.close()
 print('PASS: separate bilty/loading/Suzuki accounting; partial/full/zero initial collections; walk-in classification; cumulative later receipts; dates retained on reopen/zero; adjustment journals; retry safety; operator typed approval; ledger reconciliation.')
if __name__=='__main__':main(check)
