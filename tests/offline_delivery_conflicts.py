"""Offline delivery snapshots are checked atomically before creating a handover."""
import http.cookiejar,json,sqlite3,urllib.error,urllib.parse,urllib.request,uuid
from integration import main

def check(base,database,password):
 class Client:
  def __init__(self):self.op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.token='';self.token=self.call('session')['csrf']
  def call(self,action,data=None,params=None,status=200):
   request=urllib.request.Request(base+urllib.parse.urlencode({'action':action,**(params or {})}),data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':self.token})
   try:
    with self.op.open(request) as response:
     body=json.load(response);assert response.status==status,(action,response.status,status,body);return body
   except urllib.error.HTTPError as error:
    body=json.load(error);assert error.code==status,(action,error.code,status,body);return body
 admin=Client();admin.call('login',{'username':'integration-review','password':password});lookup=admin.call('lookups')
 station=next(x['id'] for x in lookup['stations'] if x['status']=='A');customer=admin.call('save_customer',{'name':'Offline delivery test','group_code':'116'})['id'];dated='2026-11-20'
 def make_item(bilty):
  shipment=admin.call('save_shipment',{'kind':'incoming','dated':dated,'station_id':station,'truck':'OFFLINE-DELIVERY','items':[{'account_id':customer,'bilty':bilty,'qty':1,'bilty_amount':'200'}]},status=201)
  item=admin.call('shipment',params={'id':shipment['id']})['items'][0]
  row=admin.call('bilties',params={'kind':'incoming','bilty_exact':bilty})['rows'][0]
  assert item['id']==row['id'];return shipment,item,row
 def payload(row):return {'offline_delivery':True,'request_key':str(uuid.uuid4()),'dated':dated,'receiver':'Offline receiver','items':[{'id':row['id'],'offline_version':row['offline_version'],'discount':'0','loading':'0','suzuki':'0','bilty_received':'0','service_received':'0'}]}
 db=sqlite3.connect(database)
 shipment,item,row=make_item('OFFLINE-DELIVERY-1');request=payload(row)
 saved=admin.call('save_unified_delivery',request,status=201);replay=admin.call('save_unified_delivery',request,status=201)
 assert saved['id']==replay['id'] and replay['replayed'] is True
 another=payload(row);admin.call('save_unified_delivery',another,status=409)
 assert db.execute('SELECT COUNT(*) FROM delivery_items WHERE item_id=?',(item['id'],)).fetchone()[0]==1
 shipment,item,row=make_item('OFFLINE-DELIVERY-2');changed=payload(row)
 update={'id':shipment['id'],'version':admin.call('shipment',params={'id':shipment['id']})['version'],'kind':'incoming','dated':dated,'station_id':station,'truck':'OFFLINE-DELIVERY','items':[{'id':item['id'],'account_id':customer,'bilty':item['bilty'],'qty':1,'bilty_amount':'300'}]}
 admin.call('save_shipment',update,status=201);admin.call('save_unified_delivery',changed,status=409)
 assert db.execute('SELECT COUNT(*) FROM delivery_items WHERE item_id=?',(item['id'],)).fetchone()[0]==0
 assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok';db.close();print('Offline delivery snapshot detects changed and already delivered bilties; retries are idempotent.')
if __name__=='__main__':main(check)
