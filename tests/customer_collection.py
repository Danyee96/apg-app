"""Collections covering current bilties and previous customer debt on a disposable database."""
import json,urllib.request,urllib.parse,urllib.error,http.cookiejar,sqlite3,uuid,subprocess,os,pathlib,hashlib
from integration import main

def check(base,database,password):
 class Client:
  def __init__(self):
   self.op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.token='';self.token=self.call('session')['csrf']
  def call(self,action,data=None,params=None,status=200):
   req=urllib.request.Request(base+urllib.parse.urlencode({'action':action,**(params or {})}),data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':self.token})
   try:
    with self.op.open(req) as r:
     value=json.load(r);assert r.status==status,(action,r.status,status,value);return value
   except urllib.error.HTTPError as e:
    value=json.load(e);assert e.code==status,(action,e.code,status,value);return value
 admin=Client();admin.call('login',{'username':'integration-review','password':password});lookup=admin.call('lookups');station=next(row['id'] for row in lookup['stations'] if row['status']=='A');cash=lookup['cash_accounts'][0]['id']
 admin.call('save_user',{'username':'prior-collector','full_name':'Prior collector','role':'operations','active':1,'permissions':['deliveries.create'],'password':'Prior-collector-2026'},status=201)
 ops=Client();ops.call('login',{'username':'prior-collector','password':'Prior-collector-2026'})
 customer=admin.call('save_customer',{'name':'Prior collection customer','group_code':'116'})['id']
 db=sqlite3.connect(database);db.row_factory=sqlite3.Row
 def item(label,value,account=customer):
  shipment=admin.call('save_shipment',{'kind':'incoming','dated':'2026-11-06','station_id':station,'truck':'PRIOR-COLLECTION','items':[{'account_id':account,'bilty':label,'qty':1,'bilty_amount':str(value),'godown':'0'}]},status=201)
  return admin.call('shipment',params={'id':shipment['id']})['items'][0]['id']
 def entry(source,received='0',date='2026-11-08',discount='0',loading='0'):
  return {'request_key':str(uuid.uuid4()),'dated':date,'received_date':date,'receiver':'Previous collection receiver','cash_account_id':cash,'items':[{'id':source,'discount':discount,'loading':loading,'suzuki':'0','bilty_received':received,'service_received':'0'}]}
 def balance(exclude=0):return ops.call('delivery_customer_dues',{'account_ids':[customer],'exclude_delivery_id':exclude})
 other=admin.call('save_customer',{'name':'Other prior customer','group_code':'116'})['id'];untouched=admin.call('save_unified_delivery',entry(item('OTHER-PRIOR',999,other)),status=201)['id']
 old_a=admin.call('save_unified_delivery',entry(item('PRIOR-A',1200),'500','2026-11-06'),status=201)['id']
 old_b=admin.call('save_unified_delivery',entry(item('PRIOR-B',1300),'0','2026-11-07',loading='50'),status=201)['id']
 original=[tuple(row) for row in db.execute('SELECT * FROM delivery_cash_receipts WHERE delivery_id=?',(old_a,))]
 preview=balance();assert preview['customers'][0]['outstanding']==200000
 details=ops.call('delivery_customer_dues',{'account_ids':[customer],'details':True});assert [row['delivery_id'] for row in details['rows']]==[old_b,old_a]
 cash_before=admin.call('ledger',params={'account_id':cash})['closing'];service_before=admin.call('ledger',params={'account_id':'SYS-LOADING-RECEIVABLE'})['closing']
 pay=entry(item('PRIOR-CURRENT',900),'2800',discount='100');pay.update(include_previous_balances=True,previous_balance_version=preview['balance_version'])
 # If the current receipt fails after older allocations, all postings roll back.
 count_before=db.execute('SELECT count(*) FROM vouchers').fetchone()[0];bad={**pay,'request_key':str(uuid.uuid4()),'received_date':'2026-11-07'}
 ops.call('save_unified_delivery',bad,status=422);assert db.execute('SELECT count(*) FROM vouchers').fetchone()[0]==count_before and balance()['customers'][0]['outstanding']==200000 and admin.call('ledger',params={'account_id':cash})['closing']==cash_before
 saved=ops.call('save_unified_delivery',pay,status=201);assert saved['previous_collected']==200000
 assert ops.call('save_unified_delivery',pay,status=201)['replayed']
 current=admin.call('unified_delivery',params={'id':saved['id']});assert current['lines'][0]['bilty_received']==80000 and current['lines'][0]['bilty_balance']==0
 assert sum(row['amount'] for row in admin.call('delivery',params={'id':saved['id']})['previous_collections'])==200000
 assert sum(row['amount'] for row in current['previous_collections'])==200000 and len(current['previous_collections'])==2
 assert admin.call('ledger',params={'account_id':cash})['closing']==cash_before+280000
 assert admin.call('ledger',params={'account_id':customer})['closing']==0
 assert admin.call('ledger',params={'account_id':'SYS-LOADING-RECEIVABLE'})['closing']==service_before
 assert balance(saved['id'])['customers'][0]['outstanding']==0
 a=admin.call('unified_delivery',params={'id':old_a});b=admin.call('unified_delivery',params={'id':old_b});assert a['lines'][0]['bilty_balance']==b['lines'][0]['bilty_balance']==0 and b['service_outstanding']==5000
 assert len(a['receipts'])==2 and a['receipts'][0]['dated']=='2026-11-06' and a['receipts'][1]['dated']=='2026-11-08'
 assert original[0]==tuple(db.execute('SELECT * FROM delivery_cash_receipts WHERE id=?',(original[0][0],)).fetchone())
 assert all(row['created_by']=='prior-collector' for row in current['previous_collections'])
 # Two current rows for one customer consume the old debt once, not twice.
 old_c=admin.call('save_unified_delivery',entry(item('PRIOR-C',1000)),status=201)['id'];preview=balance()
 multi=entry(item('PRIOR-ROW-A',300),'800');multi['items'].append({'id':item('PRIOR-ROW-B',200),'discount':'0','loading':'0','suzuki':'0','bilty_received':'700','service_received':'0'});multi.update(include_previous_balances=True,previous_balance_version=preview['balance_version'])
 multi_saved=ops.call('save_unified_delivery',multi,status=201);assert multi_saved['previous_collected']==100000
 multi_doc=admin.call('unified_delivery',params={'id':multi_saved['id']});assert all(row['bilty_balance']==0 for row in multi_doc['lines']) and len(multi_doc['previous_collections'])==1
 assert admin.call('unified_delivery',params={'id':old_c})['lines'][0]['bilty_received']==100000
 # A previous-only collection creates a linked old-bill receipt, not a zero current receipt.
 old_d=admin.call('save_unified_delivery',entry(item('PRIOR-D',200)),status=201)['id'];preview=balance(saved['id'])
 previous_only={'id':saved['id'],'version':current['version'],'request_key':str(uuid.uuid4()),'dated':current['header']['dated'],'received_date':'2026-11-08','receiver':current['header']['receiver'],'cash_account_id':cash,'include_previous_balances':True,'previous_balance_version':preview['balance_version'],'items':[{'id':current['lines'][0]['delivery_item_id'],'discount':'100','loading':'0','suzuki':'0','bilty_received':'200','service_received':'0'}]}
 ops.call('save_unified_delivery',previous_only,status=201);updated=admin.call('unified_delivery',params={'id':saved['id']});assert len(updated['receipts'])==1 and len(updated['previous_collections'])==3 and updated['lines'][0]['bilty_received']==80000
 # Stale previous balances reject atomically and leave the new bilty pending.
 stale_preview=balance();stale=entry(item('PRIOR-STALE',100),'150');stale.update(include_previous_balances=True,previous_balance_version=stale_preview['balance_version'])
 added=admin.call('save_unified_delivery',entry(item('PRIOR-ADDED',1000)),status=201)['id']
 before_docs=db.execute('SELECT count(*) FROM deliveries').fetchone()[0];before_cash=admin.call('ledger',params={'account_id':cash})['closing']
 ops.call('save_unified_delivery',stale,status=409);assert db.execute('SELECT count(*) FROM deliveries').fetchone()[0]==before_docs and admin.call('ledger',params={'account_id':cash})['closing']==before_cash
 assert db.execute('SELECT status FROM items WHERE id=?',(stale['items'][0]['id'],)).fetchone()[0]=='pending'
 stale['previous_balance_version']=balance()['balance_version'];partial=ops.call('save_unified_delivery',stale,status=201);assert partial['previous_collected']==5000 and admin.call('unified_delivery',params={'id':added})['lines'][0]['bilty_balance']==95000
 # Overpayment becomes credit only after all selected-customer debt clears.
 latest=admin.call('unified_delivery',params={'id':saved['id']});excess={**previous_only,'version':latest['version'],'request_key':str(uuid.uuid4()),'previous_balance_version':balance(saved['id'])['balance_version'],'items':[{'id':latest['lines'][0]['delivery_item_id'],'discount':'100','loading':'0','suzuki':'0','bilty_received':'1050','service_received':'0'}]}
 over=ops.call('save_unified_delivery',excess,status=201);assert over['previous_collected']==95000
 credited=admin.call('unified_delivery',params={'id':saved['id']});assert credited['lines'][0]['bilty_balance']==-10000 and balance(saved['id'])['customers'][0]['outstanding']==0
 # No cross-customer allocation: a second customer's invoice remains unchanged.
 assert admin.call('unified_delivery',params={'id':untouched})['lines'][0]['bilty_balance']==99900
 # Display order must not change how partial payments settle older debts.
 order_customer=admin.call('save_customer',{'name':'Receipt order customer','group_code':'116'})['id']
 oldest=admin.call('save_unified_delivery',entry(item('ORDER-OLD',100,order_customer),date='2026-11-06'),status=201)['id']
 newest=admin.call('save_unified_delivery',entry(item('ORDER-NEW',100,order_customer),date='2026-11-07'),status=201)['id']
 order_preview=ops.call('delivery_customer_dues',{'account_ids':[order_customer],'details':True})
 assert [row['delivery_id'] for row in order_preview['rows']]==[newest,oldest]
 order_payment=entry(item('ORDER-CURRENT',100,order_customer),'150');order_payment.update(include_previous_balances=True,previous_balance_version=order_preview['balance_version'])
 ops.call('save_unified_delivery',order_payment,status=201)
 assert admin.call('unified_delivery',params={'id':oldest})['lines'][0]['bilty_balance']==5000
 assert admin.call('unified_delivery',params={'id':newest})['lines'][0]['bilty_balance']==10000
 assert not db.execute('SELECT voucher_id FROM voucher_lines GROUP BY voucher_id HAVING SUM(debit)<>SUM(credit)').fetchall();assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok' and not db.execute('PRAGMA foreign_key_check').fetchall();db.close()
 print('PASS: current plus previous customer collection; oldest debts first; same-customer rows counted once; previous-only payments; services untouched; preserved history; collector identity; idempotence; stale rollback; ledger reconciliation.')
if __name__=='__main__':main(check)
