"""Customer correction moves delivered balances and accounting without losing receipts."""
import json,urllib.request,urllib.parse,urllib.error,http.cookiejar,uuid,datetime,sqlite3
from zoneinfo import ZoneInfo
from integration import main

def check(base,database,password):
 op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));token=''
 def call(action,data=None,status=200,**params):
  nonlocal token
  request=urllib.request.Request(base+urllib.parse.urlencode({'action':action,**params}),data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':token})
  try:
   with op.open(request) as r:value=json.load(r);assert r.status==status,(action,value);return value
  except urllib.error.HTTPError as e:
   value=json.load(e);assert e.code==status,(action,e.code,value);return value
 token=call('session')['csrf'];call('login',{'username':'integration-review','password':password});look=call('lookups');station=next(x['id'] for x in look['stations'] if x['status']=='A');today=datetime.datetime.now(ZoneInfo('Asia/Karachi')).date().isoformat();cash=look['cash_accounts'][0]['id']
 a=call('save_customer',{'name':'Correction old customer','group_code':'116'})['id'];b=call('save_customer',{'name':'Correction new customer','group_code':'116'})['id']
 item={'account_id':a,'bilty':'CORRECT-1','qty':1,'bilty_amount':'500','godown':'100','advance':'0'};saved=call('save_shipment',{'kind':'incoming','dated':today,'station_id':station,'truck':'CORRECT','items':[item]},status=201);shipment=call('shipment',id=saved['id']);item['id']=shipment['items'][0]['id'];d=call('save_unified_delivery',{'request_key':str(uuid.uuid4()),'dated':today,'received_date':today,'receiver':'Correction','cash_account_id':cash,'items':[{'id':item['id'],'discount':'0','loading':'0','suzuki':'0','bilty_received':'200','service_received':'0'}]},status=201)
 shipment=call('shipment',id=saved['id']);item['account_id']=b;call('save_shipment',{'id':saved['id'],'version':shipment['version'],'kind':'incoming','dated':today,'station_id':station,'truck':'CORRECT','items':[item]},status=201)
 doc=call('unified_delivery',id=d['id']);assert doc['lines'][0]['account_id']==b and doc['lines'][0]['bilty_received']==20000 and doc['lines'][0]['bilty_balance']==40000
 dues=call('delivery_customer_dues',{'account_ids':[a,b]});rows={r['account_id']:r for r in dues['customers']};assert rows[a]['outstanding']==0 and rows[b]['outstanding']==40000
 db=sqlite3.connect(database);net=lambda customer:db.execute('select coalesce(sum(debit-credit),0) from voucher_lines where account_id=?',(customer,)).fetchone()[0];assert net(a)==0 and net(b)==40000,(net(a),net(b));assert db.execute('select count(*) from voucher_lines group by voucher_id having sum(debit)!=sum(credit)').fetchall()==[];db.close()
 # One market collection spans two bilties. Reassigning one must not move the other.
 operator=call('save_user',{'username':'correction-munshi','full_name':'Correction munshi','role':'operations','active':1,'permissions':['deliveries.create'],'password':'Correction-operator-2026'},status=201)['id']
 c=call('save_customer',{'name':'Correction shared old','group_code':'116'})['id'];n=call('save_customer',{'name':'Correction shared new','group_code':'116'})['id']
 lines=[{'account_id':c,'bilty':'SHARED-1','qty':1,'bilty_amount':'500','godown':'0'},{'account_id':c,'bilty':'SHARED-2','qty':1,'bilty_amount':'300','godown':'0'}]
 batch=call('save_shipment',{'kind':'incoming','dated':today,'station_id':station,'truck':'SHARED','items':lines},status=201);record=call('shipment',id=batch['id']);ids=[x['id'] for x in record['items']]
 call('save_unified_delivery',{'request_key':str(uuid.uuid4()),'dated':today,'received_date':today,'receiver':'Shared','items':[{'id':i,'discount':'0','loading':'0','suzuki':'0','bilty_received':'0','service_received':'0'} for i in ids]},status=201)
 details=call('wasooli_customer',account_id=c);owner=next(x for x in details['operators'] if x['id']==operator);collection=call('wasooli_collect',{'request_key':str(uuid.uuid4()),'account_id':c,'operator_id':operator,'period_token':owner['period_token'],'balance_version':details['balance_version'],'amount':'650','dated':today,'cash_account_id':cash,'notes':'Shared payment'},status=201)
 record=call('shipment',id=batch['id']);lines[0]['id']=ids[0];lines[1]['id']=ids[1];lines[1]['account_id']=n;call('save_shipment',{'id':batch['id'],'version':record['version'],'kind':'incoming','dated':today,'station_id':station,'truck':'SHARED','items':lines},status=201)
 due=call('delivery_customer_dues',{'account_ids':[c,n]});balances={r['account_id']:r['outstanding'] for r in due['customers']};assert balances=={c:0,n:15000},balances
 entry=call('daily_expense_entry',id=collection['operator_entry_id']);assert entry['entry']['title']=='Daily Wasooli · Multiple customers';assert {r['account_id'] for r in entry['allocations']}=={c,n};assert sum(r['amount'] for r in entry['allocations'])==65000
 db=sqlite3.connect(database);assert db.execute('select count(*) from voucher_lines group by voucher_id having sum(debit)!=sum(credit)').fetchall()==[];db.close()
 print('PASS: customer correction, cash, balanced vouchers and shared Wasooli allocations')
if __name__=='__main__':main(check)
