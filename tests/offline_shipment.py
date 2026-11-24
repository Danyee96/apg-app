"""Offline shipment retry safety over the real HTTP API on a disposable DB."""
import http.cookiejar, json, sqlite3, urllib.error, urllib.parse, urllib.request, uuid
from integration import main

def check(base, database, password):
 class Client:
  def __init__(self):
   self.op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
   self.token='';self.token=self.call('session')['csrf']
  def call(self,action,data=None,status=200):
   request=urllib.request.Request(base+urllib.parse.urlencode({'action':action}),data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':self.token})
   try:
    with self.op.open(request) as response:
     assert response.status==status,(action,response.status,status)
     return json.load(response)
   except urllib.error.HTTPError as error:
    result=json.load(error);assert error.code==status,(action,error.code,result,status);return result
 admin=Client();admin.call('login',{'username':'integration-review','password':password})
 admin.call('save_user',{'username':'offline-test-munshi','full_name':'Offline test','role':'operations','active':1,'permissions':['incoming.create'],'password':'Offline-test-only-2026'},status=201)
 ops=Client();ops.call('login',{'username':'offline-test-munshi','password':'Offline-test-only-2026'})
 lookups=admin.call('lookups');station=next(x['id'] for x in lookups['stations'] if x['status']=='A');customer=next(x['id'] for x in lookups['accounts'] if x['customer'] and x['status']=='A')
 db=sqlite3.connect(database)
 def payload():return {'offline_request_id':str(uuid.uuid4()),'kind':'incoming','dated':'2026-11-20','station_id':station,'truck':'OFFLINE-TEST','items':[{'account_id':customer,'bilty':'OFFLINE-1','qty':1,'bilty_amount':'200'}]}
 for client,table in [(admin,'shipments'),(ops,'incoming_submissions')]:
  body=payload();before=db.execute('SELECT COUNT(*) FROM '+table).fetchone()[0]
  first=client.call('save_shipment',body,status=201)
  retry=client.call('save_shipment',body,status=201)
  assert retry['id']==first['id'] and retry['reference']==first['reference'] and retry['replayed'] is True
  assert db.execute('SELECT COUNT(*) FROM '+table).fetchone()[0]==before+1
  client.call('save_shipment',{**body,'truck':'CHANGED'},status=409)
  assert db.execute('SELECT COUNT(*) FROM '+table).fetchone()[0]==before+1
  (ops if client is admin else admin).call('save_shipment',body,status=409)
  client.call('save_shipment',{**body,'id':first['id']},status=422 if client is admin else 403)
  client.call('save_shipment',{**body,'offline_request_id':'invalid'},status=422)
 assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
 db.close();print('Shipment retries are idempotent for admin and munshi, scoped to actor and payload.')

if __name__=='__main__':main(check)
