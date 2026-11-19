"""Temporary customers with unpaid deliveries require admin conversion."""
import json,urllib.request,urllib.parse,urllib.error,http.cookiejar,uuid,datetime,sqlite3
from zoneinfo import ZoneInfo
from integration import main

def check(base,database,password):
 class Client:
  def __init__(self):self.op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.token='';self.token=self.call('session')['csrf']
  def call(self,action,data=None,status=200,**params):
   req=urllib.request.Request(base+urllib.parse.urlencode({'action':action,**params}),data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':self.token})
   try:
    with self.op.open(req) as r: result=json.load(r);assert r.status==status,(action,result);return result
   except urllib.error.HTTPError as e:
    result=json.load(e);assert e.code==status,(action,e.code,result);return result
 admin=Client();admin.call('login',{'username':'integration-review','password':password});look=admin.call('lookups');station=next(s['id'] for s in look['stations'] if s['status']=='A');cash=look['cash_accounts'][0]['id'];date=datetime.datetime.now(ZoneInfo('Asia/Karachi')).date().isoformat()
 def fixture(name,bilty):
  account=admin.call('incoming_customer_create',{'name':name,'mode':'temporary'},status=201)['id'];shipment=admin.call('save_shipment',{'kind':'incoming','dated':date,'station_id':station,'truck':'TEMP','items':[{'account_id':account,'bilty':bilty,'qty':1,'bilty_amount':'200','godown':'0'}]},status=201);return account,admin.call('shipment',id=shipment['id'])['items'][0]['id']
 def payload(item,received):return {'request_key':str(uuid.uuid4()),'dated':date,'received_date':date,'receiver':'Test','mobile':'03001234567','cash_account_id':cash,'items':[{'id':item,'discount':'0','loading':'0','suzuki':'0','bilty_received':received,'service_received':'0'}]}
 db=sqlite3.connect(database)
 paid,item=fixture('Temp full','TEMP-FULL');admin.call('save_unified_delivery',payload(item,'200'),status=201);assert db.execute('select temporary from accounts where id=?',(paid,)).fetchone()[0]==1
 unpaid,item=fixture('Temp partial','TEMP-PART');p=payload(item,'100');admin.call('save_unified_delivery',p,status=422);assert db.execute('select temporary from accounts where id=?',(unpaid,)).fetchone()[0]==1;assert not db.execute('select 1 from delivery_items where item_id=?',(item,)).fetchone()
 p['temporary_customers']={unpaid:{'area':'Test area','mobile':''}};saved=admin.call('save_unified_delivery',p,status=201);assert db.execute('select temporary,area,mobile from accounts where id=?',(unpaid,)).fetchone()==(0,'Test area','03001234567');assert admin.call('save_unified_delivery',p,status=201)['replayed'];assert admin.call('unified_delivery',id=saved['id'])['lines'][0]['bilty_balance']==10000
 admin.call('save_user',{'username':'temp-delivery-ops','full_name':'Temp operator','role':'operations','active':1,'permissions':['deliveries.create'],'password':'Temp-delivery-2026'},status=201);ops=Client();ops.call('login',{'username':'temp-delivery-ops','password':'Temp-delivery-2026'});unpaid,item=fixture('Temp operator unpaid','TEMP-OPS');ops.call('save_unified_delivery',payload(item,'0'),status=403);assert db.execute('select temporary from accounts where id=?',(unpaid,)).fetchone()[0]==1
 paid,item=fixture('Temp operator paid','TEMP-OPS-PAID');ops.call('save_unified_delivery',payload(item,'200'),status=201);assert db.execute('select temporary from accounts where id=?',(paid,)).fetchone()[0]==1
 db.close();print('PASS: fully paid, unpaid conversion, atomic rollback, replay and operator restriction')
if __name__=='__main__':main(check)
