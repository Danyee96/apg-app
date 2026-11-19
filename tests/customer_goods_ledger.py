"""Incoming goods move into delivered receivables without being counted twice."""
import json,urllib.request,urllib.parse,http.cookiejar,uuid,datetime
from zoneinfo import ZoneInfo
from integration import main

def check(base,database,password):
 op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));token=''
 def call(action,data=None,**params):
  nonlocal token
  request=urllib.request.Request(base+urllib.parse.urlencode({'action':action,**params}),data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':token})
  with op.open(request) as response:return json.load(response)
 token=call('session')['csrf'];call('login',{'username':'integration-review','password':password});look=call('lookups');station=next(x['id'] for x in look['stations'] if x['status']=='A');today=datetime.datetime.now(ZoneInfo('Asia/Karachi')).date().isoformat()
 customer=call('save_customer',{'name':'Ledger incoming fixture','group_code':'116'})['id']
 ship=call('save_shipment',{'kind':'incoming','dated':today,'station_id':station,'truck':'LEDGER','items':[{'account_id':customer,'bilty':'LEDGER-1','qty':1,'bilty_amount':'500','godown':'100','advance':'50'}]})
 ledger=call('customer_goods_ledger',id=customer);r=ledger['rows'][0];assert (r['customer_balance'],r['incoming_balance'],r['upcoming_balance'])==(0,55000,55000);assert len(ledger['incoming'])==1
 item=call('shipment',id=ship['id'])['items'][0]['id'];call('save_unified_delivery',{'request_key':str(uuid.uuid4()),'dated':today,'received_date':today,'receiver':'Ledger receiver','cash_account_id':look['cash_accounts'][0]['id'],'items':[{'id':item,'discount':'0','loading':'0','suzuki':'0','bilty_received':'200','service_received':'0'}]})
 ledger=call('customer_goods_ledger',id=customer);r=ledger['rows'][0];assert (r['customer_balance'],r['incoming_balance'],r['upcoming_balance'])==(35000,0,35000),(r,ledger);assert len(ledger['delivered'])==1 and not ledger['incoming']
 print('PASS: incoming, advance, delivery, partial payment and no double count')
if __name__=='__main__':main(check)
