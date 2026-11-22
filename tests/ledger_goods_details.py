"""Goods metadata must not change accounting-ledger amounts or multiply rows."""
import http.cookiejar,json,sqlite3,urllib.error,urllib.parse,urllib.request,uuid,datetime
from zoneinfo import ZoneInfo
from integration import main
def check(base,database,password):
 jar=http.cookiejar.CookieJar();op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar));token=''
 def call(action,data=None,params=None,status=200):
  request=urllib.request.Request(base+urllib.parse.urlencode({'action':action,**(params or {})}),data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':token})
  with op.open(request) as response:
   body=json.load(response);assert response.status==status,(action,body);return body
 token=call('session')['csrf'];call('login',{'username':'integration-review','password':password});lookup=call('lookups');customer=call('save_customer',{'name':'Ledger goods metadata','group_code':'116'})['id'];station=next(x['id'] for x in lookup['stations'] if x['status']=='A');cash=lookup['cash_accounts'][0]['id'];date=datetime.datetime.now(ZoneInfo('Asia/Karachi')).date().isoformat()
 shipment=call('save_shipment',{'kind':'incoming','dated':date,'station_id':station,'truck':'META','items':[{'account_id':customer,'bilty':'META-1','qty':2,'bilty_amount':'100','godown':'20'},{'account_id':customer,'bilty':'META-2','qty':3,'bilty_amount':'200','godown':'30'}]},status=201)
 items=call('shipment',params={'id':shipment['id']})['items'];call('save_unified_delivery',{'request_key':str(uuid.uuid4()),'dated':date,'received_date':date,'receiver':'Ledger test','cash_account_id':cash,'items':[{'id':i['id'],'discount':'0','loading':'0','suzuki':'0','bilty_received':'10','service_received':'0'} for i in items]},status=201)
 ledger=call('ledger',params={'account_id':customer,'from':date,'to':date});assert ledger['debit']==35000 and ledger['credit']==2000 and ledger['closing']==33000
 details=[detail for row in ledger['rows'] for detail in row['goods_details']];assert {row['bilty'] for row in details}=={'META-1','META-2'};assert any(row['qty']==2 and row['godown']==2000 for row in details)
 db=sqlite3.connect(database);assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok';db.close();print('Ledger goods details preserve voucher totals and running balance.')
if __name__=='__main__':main(check)
