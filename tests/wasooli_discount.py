"""Wasooli discount reduces bilty debt without inflating cash or duplicating journals."""
import datetime,http.cookiejar,json,sqlite3,urllib.error,urllib.parse,urllib.request,uuid
from zoneinfo import ZoneInfo
from integration import main

def check(base,database,password):
 class Client:
  def __init__(self):self.op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.token='';self.token=self.call('session')['csrf']
  def call(self,action,data=None,params=None,status=200):
   req=urllib.request.Request(base+urllib.parse.urlencode({'action':action,**(params or {})}),data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':self.token})
   try:
    with self.op.open(req) as response:
     result=json.load(response);assert response.status==status,(action,result);return result
   except urllib.error.HTTPError as error:
    result=json.load(error);assert error.code==status,(action,error.code,result,status);return result
 admin=Client();admin.call('login',{'username':'integration-review','password':password});look=admin.call('lookups');station=next(x['id'] for x in look['stations'] if x['status']=='A');cash=look['cash_accounts'][0]['id'];today=datetime.datetime.now(ZoneInfo('Asia/Karachi')).date().isoformat()
 owner=admin.call('save_user',{'username':'discount-munshi','full_name':'Discount test','role':'operations','active':1,'permissions':['deliveries.create'],'password':'Discount-only-test-2026'},status=201)['id'];ops=Client();ops.call('login',{'username':'discount-munshi','password':'Discount-only-test-2026'})
 customer=admin.call('save_customer',{'name':'Discount wasooli test','group_code':'116'})['id']
 shipment=admin.call('save_shipment',{'kind':'incoming','dated':today,'station_id':station,'truck':'DISCOUNT','items':[{'account_id':customer,'bilty':'DISCOUNT-1','qty':1,'bilty_amount':'1000','godown':'100','loading':'50'}]},status=201)
 item=admin.call('shipment',params={'id':shipment['id']})['items'][0]['id']
 delivery=admin.call('save_unified_delivery',{'request_key':str(uuid.uuid4()),'dated':today,'receiver':'Test','items':[{'id':item,'discount':'0','loading':'50','suzuki':'0','bilty_received':'0','service_received':'0'}]},status=201)['id']
 details=ops.call('wasooli_customer',params={'account_id':customer});pay={'request_key':str(uuid.uuid4()),'account_id':customer,'operator_id':owner,'period_token':details['operators'][0]['period_token'],'balance_version':details['balance_version'],'amount':'600','discount':'100','dated':today,'cash_account_id':cash}
 result=ops.call('wasooli_collect',pay,status=201);assert result['amount']==60000 and result['discount']==10000 and result['credit']==0;assert ops.call('wasooli_collect',pay,status=201)['replayed']
 after=ops.call('wasooli_customer',params={'account_id':customer});assert after['summary']['bilty_balance']==40000 and after['summary']['loading_balance']==5000;assert after['discount_history'][0]['amount']==10000
 assert ops.call('daily_expense')['totals']['received']==60000
 db=sqlite3.connect(database);assert db.execute('SELECT COUNT(*) FROM wasooli_discounts').fetchone()[0]==1;assert not db.execute('SELECT voucher_id FROM voucher_lines GROUP BY voucher_id HAVING SUM(debit)<>SUM(credit)').fetchall()
 bad={**pay,'request_key':str(uuid.uuid4()),'discount':'500','balance_version':after['balance_version'],'period_token':after['operators'][0]['period_token']};ops.call('wasooli_collect',bad,status=422)
 assert ops.call('wasooli_customer',params={'account_id':customer})['summary']['bilty_balance']==40000
 assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok';db.close();print('Wasooli discount reduces eligible bilty debt, records journal once and leaves cash collection separate.')
if __name__=='__main__':main(check)
