"""Offline temporary customer retry safety on an isolated database."""
import http.cookiejar,json,sqlite3,urllib.error,urllib.parse,urllib.request,uuid
from integration import main

def check(base,database,password):
 class Client:
  def __init__(self):
   self.op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.token='';self.token=self.call('session')['csrf']
  def call(self,action,data=None,status=200):
   request=urllib.request.Request(base+urllib.parse.urlencode({'action':action}),data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':self.token})
   try:
    with self.op.open(request) as response:
     assert response.status==status;return json.load(response)
   except urllib.error.HTTPError as error:
    result=json.load(error);assert error.code==status,(action,error.code,result,status);return result
 admin=Client();admin.call('login',{'username':'integration-review','password':password})
 admin.call('save_user',{'username':'offline-customer-ops','full_name':'Offline operator','role':'operations','active':1,'permissions':['incoming.create'],'password':'Offline-customer-test-2026'},status=201)
 ops=Client();ops.call('login',{'username':'offline-customer-ops','password':'Offline-customer-test-2026'})
 db=sqlite3.connect(database)
 for client in (admin,ops):
  key=str(uuid.uuid4());payload={'offline_request_id':key,'mode':'temporary','name':'Offline duplicate allowed'}
  first=client.call('incoming_customer_create',payload,status=201);again=client.call('incoming_customer_create',payload,status=201)
  assert first['id']==again['id'] and again['replayed'] is True
  client.call('incoming_customer_create',{**payload,'name':'Changed'},status=409)
  (ops if client is admin else admin).call('incoming_customer_create',payload,status=409)
  assert db.execute('SELECT COUNT(*) FROM offline_customer_requests WHERE request_key=?',(key,)).fetchone()[0]==1
  assert db.execute('SELECT temporary FROM accounts WHERE id=?',(first['id'],)).fetchone()[0]==1
 assert db.execute("SELECT COUNT(*) FROM accounts WHERE name='Offline duplicate allowed'").fetchone()[0]==2
 admin.call('incoming_customer_create',{'offline_request_id':'bad','name':'Test','mode':'temporary'},status=422)
 admin.call('incoming_customer_create',{'offline_request_id':str(uuid.uuid4()),'name':'Test','mode':'full'},status=422)
 assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok';db.close()
 print('Offline customer requests are idempotent, actor-scoped, and allow distinct temporary customers with the same name.')
if __name__=='__main__':main(check)
