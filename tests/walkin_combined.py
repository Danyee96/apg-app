"""Atomic one-popup walk-in saves on disposable data, including retry and approval safeguards."""
import json,urllib.request,urllib.parse,urllib.error,http.cookiejar,sqlite3,uuid
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
 admin=Client();admin.call('login',{'username':'integration-review','password':password})
 lookup=admin.call('lookups');station=next(row['id'] for row in lookup['stations'] if row['status']=='A');cash=lookup['cash_accounts'][0]['id']
 customer=admin.call('save_customer',{'name':'Combined walk-in customer','group_code':'116'})['id']
 def shipment(number):
  created=admin.call('save_shipment',{'kind':'incoming','dated':'2026-11-08','station_id':station,'truck':number,'items':[{'account_id':customer,'bilty':number,'qty':1,'bilty_amount':'200','godown':'70','advance':'20'}]},status=201)
  return admin.call('shipment',params={'id':created['id']})['items'][0]['id']
 def payload(item):
  return {'delivery_mode':'walkin','dated':'2026-11-08','receiver':'One popup receiver','items':[{'id':item,'discount':'10','loading':'30','suzuki':'0'}],'walkin_cash':{'request_key':str(uuid.uuid4()),'cash_account_id':cash,'notes':'Same popup','items':[{'id':item,'bilty_received':'200','service_received':'30'}]}}
 db=sqlite3.connect(database)
 item=shipment('COMBINED-ADMIN');request=payload(item)
 before=db.execute('SELECT count(*) FROM deliveries').fetchone()[0];vouchers=db.execute('SELECT count(*) FROM vouchers').fetchone()[0]
 # An invalid account, wrong bilty allocation, or malformed cash amount must leave
 # both goods and accounting unchanged, allowing correction in the original popup.
 for change in [{'cash_account_id':customer},{'items':[{'id':-1,'bilty_received':'200'}]},{'items':[{'id':item,'bilty_received':'bad'}]}]:
  admin.call('save_delivery',{**request,'walkin_cash':{**request['walkin_cash'],**change}},status=422)
  assert db.execute('SELECT count(*) FROM deliveries').fetchone()[0]==before
  assert db.execute('SELECT count(*) FROM vouchers').fetchone()[0]==vouchers
  assert db.execute('SELECT status FROM items WHERE id=?',(item,)).fetchone()[0]=='pending'
  assert db.execute('SELECT loading FROM items WHERE id=?',(item,)).fetchone()[0]==0
 saved=admin.call('save_delivery',request,status=201);assert saved['cash_recorded'] and not saved['pending_cash']
 invoice=admin.call('delivery_cash_invoice',params={'id':saved['id']});assert (invoice['due'],invoice['received'],invoice['outstanding'])==(27000,23000,4000)
 assert len(invoice['receipts'])==1
 assert (invoice['lines'][0]['bilty_amount'],invoice['lines'][0]['godown'],invoice['lines'][0]['discount'],invoice['lines'][0]['loading'])==(20000,7000,1000,3000)
 assert admin.call('delivery_cash_list',params={'search':'COMBINED-ADMIN'})['rows'][0]['bilty_preview']==['COMBINED-ADMIN']
 assert admin.call('save_delivery',request,status=201)['replayed']
 assert db.execute('SELECT count(*) FROM deliveries').fetchone()[0]==before+1
 assert db.execute('SELECT count(*) FROM vouchers').fetchone()[0]==vouchers+2
 admin.call('save_delivery',{**request,'receiver':'Different request'},status=409)
 assert not db.execute('SELECT voucher_id FROM voucher_lines GROUP BY voucher_id HAVING sum(debit)<>sum(credit)').fetchall()
 # Operators submit the same inline collection, but cannot post financial effects.
 admin.call('save_user',{'username':'combined-ops','role':'operations','full_name':'Combined operator','active':1,'permissions':['deliveries.create'],'password':'Combined-operator-2026'},status=201)
 ops=Client();ops.call('login',{'username':'combined-ops','password':'Combined-operator-2026'})
 assert ops.call('lookups')['cash_accounts']
 opitem=shipment('COMBINED-OPERATOR');oprequest=payload(opitem)
 vouchers=db.execute('SELECT count(*) FROM vouchers').fetchone()[0]
 pending=ops.call('save_delivery',oprequest,status=201);assert pending['pending_cash'] and not pending['cash_recorded']
 assert ops.call('save_delivery',oprequest,status=201)['replayed']
 assert db.execute('SELECT count(*) FROM vouchers').fetchone()[0]==vouchers
 assert len(admin.call('delivery_cash_invoice',params={'id':pending['id']})['receipts'])==0
 assert not admin.call('delivery_cash_list',params={'search':'COMBINED-OPERATOR'})['rows']
 assert not ops.call('delivery_cash_list',params={'search':'COMBINED-OPERATOR'})['rows']
 assert admin.call('delivery_cash_list',params={'search':'COMBINED-OPERATOR'})['stats']['total']==0
 assert ops.call('delivery_customer_dues',{'account_ids':[customer],'details':True})['customers'][0]['outstanding']==4000
 review=admin.call('cash_collection_submission',params={'id':pending['cash_id']})
 ops.call('approve_cash_collection',review['payload'],status=403)
 admin.call('approve_cash_collection',{**review['payload'],'pending_id':review['id'],'pending_version':review['version']},status=201)
 invoice=admin.call('delivery_cash_invoice',params={'id':pending['id']});assert invoice['received']==23000 and invoice['receipts'][0]['created_by']=='combined-ops'
 assert admin.call('delivery_cash_list',params={'search':'COMBINED-OPERATOR'})['rows'][0]['id']==pending['id']
 assert ops.call('delivery_customer_dues',{'account_ids':[customer]})['customers'][0]['outstanding']==8000
 assert ops.call('delivery_customer_dues',{'account_ids':[customer],'exclude_delivery_id':pending['id']})['customers'][0]['outstanding']==4000
 # Standard handovers keep their separate collection flow and cannot sneak cash in.
 standard=payload(shipment('COMBINED-STANDARD'));standard['delivery_mode']='standard'
 admin.call('save_delivery',standard,status=422);standard.pop('walkin_cash')
 handed=admin.call('save_delivery',standard,status=201)
 assert admin.call('delivery_cash_invoice',params={'id':handed['id']})['received']==0
 # A zero-cash walk-in is still traceable as an unpaid customer balance.
 zero=payload(shipment('COMBINED-ZERO'));zero['walkin_cash']['items'][0].update(bilty_received='0',service_received='0')
 zero['walkin_cash']['cash_account_id']='';result=admin.call('save_delivery',zero,status=201)
 invoice=admin.call('delivery_cash_invoice',params={'id':result['id']});assert invoice['received']==0 and invoice['outstanding']==27000 and len(invoice['receipts'])==1
 # Read-only debt lookup validates account scope, pagination, and role permission.
 admin.call('delivery_customer_dues',{'account_ids':[]},status=422)
 admin.call('delivery_customer_dues',{'account_ids':[cash]},status=422)
 admin.call('delivery_customer_dues',{'account_ids':[customer],'exclude_delivery_id':-1},status=422)
 admin.call('delivery_customer_dues',status=405)
 admin.call('save_user',{'username':'dues-view-only','role':'custom','full_name':'View only','active':1,'permissions':['deliveries.view'],'password':'Dues-view-only-2026'},status=201)
 viewer=Client();viewer.call('login',{'username':'dues-view-only','password':'Dues-view-only-2026'})
 viewer.call('delivery_customer_dues',{'account_ids':[customer]},status=403)
 pagedCustomer=admin.call('save_customer',{'name':'Paginated previous debt','group_code':'116'})['id']
 source=admin.call('save_shipment',{'kind':'incoming','dated':'2026-11-08','station_id':station,'truck':'DUES-PAGES','items':[{'account_id':pagedCustomer,'bilty':'DEBT-PAGE-'+str(n),'qty':1,'bilty_amount':'1'} for n in range(55)]},status=201)
 pageItems=admin.call('shipment',params={'id':source['id']})['items']
 admin.call('save_delivery',{'dated':'2026-11-08','receiver':'Paged previous debt','items':[{'id':row['id']} for row in pageItems]},status=201)
 auditCount=db.execute('SELECT count(*) FROM audit').fetchone()[0]
 first=admin.call('delivery_customer_dues',{'account_ids':[pagedCustomer,pagedCustomer],'details':True})
 last=admin.call('delivery_customer_dues',{'account_ids':[pagedCustomer],'details':True,'page':999})
 assert first['total']==55 and len(first['rows'])==50 and first['customers'][0]['outstanding']==5500
 assert last['page']==1 and len(last['rows'])==5
 assert db.execute('SELECT count(*) FROM audit').fetchone()[0]==auditCount
 db.close();print('PASS: combined admin save; full rollback on bad account/allocation/amount; duplicate retry protection; per-customer cash and balances; operator pending-only then approval; standard collection unchanged; zero-cash walk-in.')
if __name__=='__main__':main(check)
