"""Bilty search filters by the linked customer's area before pagination."""
import datetime,http.cookiejar,json,urllib.error,urllib.parse,urllib.request,uuid
from zoneinfo import ZoneInfo
from integration import main

def check(base,database,password):
 class Client:
  def __init__(self):self.op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.token='';self.token=self.call('session')['csrf']
  def call(self,action,data=None,expected=200,**params):
   req=urllib.request.Request(base+urllib.parse.urlencode({'action':action,**params}),data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':self.token})
   try:
    with self.op.open(req) as r:result=json.load(r);assert r.status==expected,(action,result);return result
   except urllib.error.HTTPError as e:
    result=json.load(e);assert e.code==expected,(action,e.code,result);return result
 admin=Client();admin.call('login',{'username':'integration-review','password':password});look=admin.call('lookups');station=next(x['id'] for x in look['stations'] if x['status']=='A');date=datetime.datetime.now(ZoneInfo('Asia/Karachi')).date().isoformat()
 a=admin.call('save_customer',{'name':'Area Filter Alpha','group_code':'116','area':'Filter Market A'})['id'];b=admin.call('save_customer',{'name':'Area Filter Beta','group_code':'116','area':'Filter Market B'})['id']
 for customer,bilty in [(a,'AREA-FILTER-1'),(a,'AREA-FILTER-2'),(b,'AREA-FILTER-3')]:
  shipment=admin.call('save_shipment',{'kind':'incoming','dated':date,'station_id':station,'truck':'AREA','items':[{'account_id':customer,'bilty':bilty,'qty':1,'bilty_amount':'100','godown':'0'}]},expected=201)
  if bilty=='AREA-FILTER-2':item=admin.call('shipment',id=shipment['id'])['items'][0]['id'];admin.call('save_unified_delivery',{'request_key':str(uuid.uuid4()),'dated':date,'receiver':'Filter receiver','items':[{'id':item,'discount':'0','loading':'0','suzuki':'0','bilty_received':'0','service_received':'0'}]},expected=201)
 def search(**p):return admin.call('bilties',search='AREA-FILTER',**p)
 assert search(customer_area='filter market a')['total']==2
 result=search(customer_area='Filter Market A',status='pending',station_id=station,**{'from':date,'to':date});assert result['total']==1 and result['rows'][0]['bilty']=='AREA-FILTER-1' and result['rows'][0]['customer_area']=='Filter Market A'
 assert search(customer_area='Filter Market A',status='delivered')['rows'][0]['bilty']=='AREA-FILTER-2'
 assert search(customer_area='Filter Market B')['rows'][0]['bilty']=='AREA-FILTER-3'
 assert search(customer_area='Missing market')['total']==0
 admin.call('save_user',{'username':'area-filter-viewer','full_name':'Area viewer','role':'custom','active':1,'permissions':['incoming.view'],'password':'Area-viewer-2026'},expected=201);viewer=Client();viewer.call('login',{'username':'area-filter-viewer','password':'Area-viewer-2026'});assert any(x['area']=='Filter Market A' for x in viewer.call('lookups')['areas']);assert viewer.call('bilties',search='AREA-FILTER',customer_area='Filter Market A')['total']==2
 print('PASS: customer area, status, station, date, search and view-only permissions')
if __name__=='__main__':main(check)
