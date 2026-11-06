"""Delivery approval transactions and access checks on a disposable database."""
import json,urllib.request,urllib.parse,urllib.error,http.cookiejar,sqlite3
from integration import main

def check(base,database,password):
 class Client:
  def __init__(self):
   self.op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.token='';self.token=self.call('session')['csrf']
  def call(self,action,data=None,params=None,status=200):
   req=urllib.request.Request(base+urllib.parse.urlencode({'action':action,**(params or {})}),data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':self.token})
   try:
    with self.op.open(req) as response:
     result=json.load(response);assert response.status==status,(action,response.status,status,result);return result
   except urllib.error.HTTPError as error:
    result=json.load(error);assert error.code==status,(action,error.code,status,result);return result
 admin=Client();admin.call('login',{'username':'integration-review','password':password})
 operators=[]
 for n in range(2):
  admin.call('save_user',{'username':f'delivery-ops-{n}','full_name':f'Delivery operator {n}','role':'operations','active':1,'permissions':['deliveries.create'],'password':'Delivery-approval-test-2026'},status=201)
  operator=Client();operator.call('login',{'username':f'delivery-ops-{n}','password':'Delivery-approval-test-2026'});operators.append(operator)
 ops,other=operators;lookup=admin.call('lookups');station=next(s['id'] for s in lookup['stations'] if s['status']=='A');account=next(a['id'] for a in lookup['accounts'] if a['customer'] and a['status']=='A')
 shipment=admin.call('save_shipment',{'kind':'incoming','dated':'2026-11-06','station_id':station,'truck':'DELIVERY-APPROVAL','items':[{'account_id':account,'bilty':f'DEL-APPROVAL-{n}','qty':2,'bilty_amount':'200','godown':'70','loading':'10'} for n in range(2)]},status=201)
 items=admin.call('shipment',params={'id':shipment['id']})['items'];db=sqlite3.connect(database);db.row_factory=sqlite3.Row
 before=db.execute('select count(*) from deliveries').fetchone()[0]
 payload={'dated':'2026-11-06','receiver':'Proposed receiver','mobile':'12345','items':[{'id':items[0]['id'],'loading':'50','suzuki':'30','discount':'10','bilty_received':'260','service_received':'80'}]}
 pending=ops.call('save_delivery',payload,status=201);assert pending['pending']
 assert db.execute('select count(*) from deliveries').fetchone()[0]==before
 row=db.execute('select status,loading,suzuki from items where id=?',(items[0]['id'],)).fetchone();assert tuple(row)==('pending',1000,0)
 assert not admin.call('deliveries',params={'search':'DEL-APPROVAL-0'})['rows']
 assert any(r['id']==pending['id'] for r in admin.call('pending_deliveries')['rows']);assert any(r['id']==pending['id'] for r in ops.call('pending_deliveries')['rows']);assert not other.call('pending_deliveries')['rows']
 assert ops.call('bilties',params={'bilty_exact':'DEL-APPROVAL-0','kind':'incoming'})['rows'][0]['delivery_submission_id']==pending['id']
 ops.call('save_delivery',payload,status=409);other.call('save_delivery',payload,status=409);admin.call('save_delivery',payload,status=409)
 ops.call('delivery_submission',params={'id':pending['id']},status=403);ops.call('discard_delivery_submission',{'id':pending['id']},status=403)
 review=admin.call('delivery_submission',params={'id':pending['id']});approval={**review['payload'],'pending_id':pending['id'],'pending_version':review['version'],'receiver':'Admin corrected receiver'}
 ops.call('save_delivery',approval,status=403)
 admin.call('save_delivery',{**approval,'items':[{**approval['items'][0],'id':items[1]['id']}]},status=422)
 db.execute('update items set remarks=? where id=?',('Concurrent correction',items[0]['id']));db.commit()
 admin.call('save_delivery',approval,status=409)
 review=admin.call('delivery_submission',params={'id':pending['id']});approval['pending_version']=review['version'];approval['items'][0]['service_received']='90'
 saved=admin.call('save_delivery',approval,status=201);admin.call('save_delivery',approval,status=409)
 assert db.execute('select count(*) from deliveries').fetchone()[0]==before+1
 assert db.execute('select status from items where id=?',(items[0]['id'],)).fetchone()[0]=='delivered'
 delivery=ops.call('delivery',params={'id':saved['id']});assert delivery['receiver']=='Admin corrected receiver';assert delivery['items'][0]['service_received']==9000;assert delivery['items'][0]['godown']==7000
 stored=db.execute('select * from delivery_submissions where id=?',(pending['id'],)).fetchone();assert stored['status']=='approved' and json.loads(stored['payload'])['receiver']=='Proposed receiver' and json.loads(stored['approved_payload'])['receiver']=='Admin corrected receiver'
 assert admin.call('deliveries',params={'search':saved['reference']})['rows'][0]['recorded_by']=='delivery-ops-0'
 assert not ops.call('pending_deliveries')['rows'];assert db.execute('select count(*) from delivery_submission_items').fetchone()[0]==0
 discarded=ops.call('save_delivery',{**payload,'items':[{**payload['items'][0],'id':items[1]['id']}]},status=201)
 admin.call('discard_delivery_submission',{'id':discarded['id']});admin.call('discard_delivery_submission',{'id':discarded['id']},status=409)
 assert db.execute('select status from items where id=?',(items[1]['id'],)).fetchone()[0]=='pending'
 ops.call('save_delivery',{**payload,'items':[{**payload['items'][0],'id':items[1]['id']}]},status=201)
 assert db.execute('pragma integrity_check').fetchone()[0]=='ok';assert not db.execute('pragma foreign_key_check').fetchall();db.close()
 print('PASS: operator delivery queued with no goods/cash mutation; own queue access; duplicate reservation prevention; super-only review/approve/discard; stale correction detection; atomic approval and retry; corrected receipt; original payload/audit; discard releases reservation.')
if __name__=='__main__':main(check)
