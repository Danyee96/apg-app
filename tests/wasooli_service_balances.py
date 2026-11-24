"""Wasooli displays and collects loading/Suzuki separately from bilty cash."""
import json,urllib.request,urllib.parse,urllib.error,http.cookiejar,uuid,datetime,sqlite3
from zoneinfo import ZoneInfo
from integration import main

def check(base,database,password):
 class Client:
  def __init__(self):self.op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.token='';self.token=self.call('session')['csrf']
  def call(self,action,data=None,status=200,**params):
   req=urllib.request.Request(base+urllib.parse.urlencode({'action':action,**params}),data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':self.token})
   try:
    with self.op.open(req) as r:result=json.load(r);assert r.status==status,(action,result);return result
   except urllib.error.HTTPError as e:
    result=json.load(e);assert e.code==status,(action,e.code,result);return result
 admin=Client();admin.call('login',{'username':'integration-review','password':password});owner=admin.call('save_user',{'username':'service-wasooli','full_name':'Service munshi','role':'operations','active':1,'permissions':['deliveries.create'],'password':'Service-wasooli-2026'},status=201)['id'];look=admin.call('lookups');station=next(x['id'] for x in look['stations'] if x['status']=='A');cash=look['cash_accounts'][0]['id'];date=datetime.datetime.now(ZoneInfo('Asia/Karachi')).date().isoformat();customer=admin.call('save_customer',{'name':'Service balance fixture','group_code':'116'})['id'];ship=admin.call('save_shipment',{'kind':'incoming','dated':date,'station_id':station,'truck':'SERVICE','items':[{'account_id':customer,'bilty':'SERVICE-1','qty':1,'bilty_amount':'500','godown':'0'}]},status=201);item=admin.call('shipment',id=ship['id'])['items'][0]['id']
 delivery=admin.call('save_unified_delivery',{'request_key':str(uuid.uuid4()),'dated':date,'received_date':date,'receiver':'Test','cash_account_id':cash,'items':[{'id':item,'discount':'0','loading':'100','suzuki':'200','bilty_received':'500','service_received':'0'}]},status=201)['id']
 found=admin.call('wasooli_customers',search='Service balance fixture');assert found['total']==1;row=found['rows'][0];assert (row['outstanding'],row['bilty_balance'],row['loading_balance'],row['suzuki_balance'])==(30000,0,10000,20000),row
 details=admin.call('wasooli_customer',account_id=customer);assert details['summary']['outstanding']==30000 and len(details['debts'])==1
 ledger=admin.call('customer_goods_ledger',id=customer);assert ledger['rows'][0]['customer_balance']==30000 and ledger['delivered'][0]['balance']==30000
 operator=next(x for x in details['operators'] if x['id']==owner)
 def pay(amount,details):return admin.call('wasooli_collect',{'request_key':str(uuid.uuid4()),'account_id':customer,'operator_id':owner,'period_token':next(x for x in details['operators'] if x['id']==owner)['period_token'],'balance_version':details['balance_version'],'amount':amount,'dated':date,'cash_account_id':cash},status=201)
 first=pay('150',details);assert first['operator_entry_id'] is None and first['amount']==15000
 details=admin.call('wasooli_customer',account_id=customer);assert (details['summary']['outstanding'],details['summary']['loading_balance'],details['summary']['suzuki_balance'])==(15000,0,15000);line=admin.call('unified_delivery',id=delivery)['lines'][0];assert (line['bilty_received'],line['loading_received'],line['suzuki_received'])==(50000,10000,5000)
 pay('150',details);assert admin.call('wasooli_customers',search='Service balance fixture')['total']==0;details=admin.call('wasooli_customer',account_id=customer);assert details['summary']['outstanding']==0 and sum(r['amount'] for r in details['history'])==80000
 # A legacy delivery only recorded a combined service receipt: do not invent a split.
 legacy=admin.call('save_customer',{'name':'Legacy service fixture','group_code':'116'})['id'];db=sqlite3.connect(database);ship=db.execute("insert into shipments(kind,reference,dated,station_id,truck) values('incoming','LEGACY-SERVICE',?,?,?)",(date,station,'OLD')).lastrowid;item=db.execute("insert into items(shipment_id,account_id,bilty,qty,bilty_amount,godown,loading,suzuki,total,status) values(?,?,?,1,50000,0,10000,20000,50000,'delivered')",(ship,legacy,'OLD-SERVICE')).lastrowid;did=db.execute("insert into deliveries(reference,dated,receiver,cash_workflow) values('OLD-SERVICE',?,'Old',0)",(date,)).lastrowid;db.execute('insert into delivery_items(delivery_id,item_id,bilty_received,service_received) values(?,?,50000,5000)',(did,item));db.commit();db.close()
 details=admin.call('wasooli_customer',account_id=legacy);assert details['summary']['legacy_balance']==25000 and details['summary']['loading_balance']==0 and details['summary']['suzuki_balance']==0;pay_result=admin.call('wasooli_collect',{'request_key':str(uuid.uuid4()),'account_id':legacy,'operator_id':owner,'period_token':next(x for x in details['operators'] if x['id']==owner)['period_token'],'balance_version':details['balance_version'],'delivery_received':'0','loading_received':'0','suzuki_received':'0','legacy_received':'250','dated':date,'cash_account_id':cash},status=201);assert pay_result['amount']==25000;assert admin.call('wasooli_customer',account_id=legacy)['summary']['outstanding']==0
 db=sqlite3.connect(database);assert not db.execute('select voucher_id from voucher_lines group by voucher_id having sum(debit)<>sum(credit)').fetchall();db.close();print('PASS: service-only balance, split allocation, legacy combined service, history and balanced accounting')
if __name__=='__main__':main(check)
