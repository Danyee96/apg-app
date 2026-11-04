"""Operations submissions, financial redaction and super-admin approval on a disposable DB."""
import urllib.request,urllib.parse,urllib.error,http.cookiejar,json,sqlite3
from integration import main

def check(base,database,password):
 class Client:
  def __init__(self):self.op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.token='';self.token=self.call('session')['csrf']
  def call(self,action,data=None,params=None,status=200):
   req=urllib.request.Request(base+urllib.parse.urlencode({'action':action,**(params or {})}),data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':self.token})
   try:
    with self.op.open(req) as r:
     assert r.status==status,(action,r.status,status)
     return json.load(r)
   except urllib.error.HTTPError as e:
    body=json.load(e);assert e.code==status,(action,e.code,body,status);return body
 admin=Client();admin.call('login',{'username':'integration-review','password':password})
 permissions=['booking.view','incoming.create','incoming.edit','deliveries.create','archive.view','reports.view','backups.create']
 ids=[];operators=[]
 for n in range(2):
  uid=admin.call('save_user',{'username':'approval-ops-'+str(n),'full_name':'Approval Operator','role':'operations','active':1,'permissions':permissions,'password':'Approval-test-only-2026'},status=201)['id'];ids.append(uid)
  client=Client();client.call('login',{'username':'approval-ops-'+str(n),'password':'Approval-test-only-2026'});operators.append(client)
 ops,other=operators
 lookup=ops.call('lookups');account=next(a['id'] for a in lookup['accounts'] if a['status']=='A' and a['customer']);station=next(s['id'] for s in lookup['stations'] if s['status']=='A')
 db=sqlite3.connect(database);db.row_factory=sqlite3.Row
 booking=admin.call('save_shipment',{'kind':'booking','dated':'2026-11-03','station_id':station,'truck':'BOOKING-UNCHANGED','items':[{'account_id':account,'bilty':'BOOKING-UNCHANGED','qty':1,'bilty_amount':'50'}]},status=201)
 assert ops.call('shipment',params={'id':booking['id']})['items'][0]['total']==5000
 count=db.execute('SELECT count(*) FROM shipments').fetchone()[0];items=db.execute('SELECT count(*) FROM items').fetchone()[0]
 payload={'kind':'incoming','dated':'2026-11-03','station_id':station,'truck':'APPROVAL-TEST','truck_amount':'100','labour_bonus':'150.25','munshi_bonus':'75.50','items':[{'account_id':account,'bilty':'PENDING-TEST','qty':2,'bilty_amount':'200','godown':'70','advance':'300','detail':'Submitted goods'}]}
 ops.call('save_shipment',{**payload,'labour_bonus':'-0.01'},status=422)
 result=ops.call('save_shipment',payload,status=201);assert result['pending'] is True
 pending_id=result['id'];assert db.execute('SELECT count(*) FROM shipments').fetchone()[0]==count and db.execute('SELECT count(*) FROM items').fetchone()[0]==items
 assert any(r['id']==pending_id for r in ops.call('pending_incoming')['rows'])
 assert not other.call('pending_incoming')['rows']
 assert not admin.call('bilties',params={'kind':'incoming','bilty_exact':'PENDING-TEST'})['rows']
 ops.call('incoming_submission',params={'id':pending_id},status=403)
 ops.call('save_shipment',{**payload,'pending_id':pending_id},status=403)
 ops.call('imported_tables',status=403);ops.call('financial_report',status=403);ops.call('backup',{},status=403)
 draft=admin.call('incoming_submission',params={'id':pending_id});assert draft['payload']['items'][0]['godown']=='70'
 invalid={**draft['payload'],'pending_id':pending_id,'truck':''};admin.call('save_shipment',invalid,status=422)
 assert db.execute('SELECT status FROM incoming_submissions WHERE id=?',(pending_id,)).fetchone()[0]=='pending'
 approval={**draft['payload'],'pending_id':pending_id,'truck':'ADMIN-CORRECTED','labour_bonus':'175.75','items':[{**draft['payload']['items'][0],'godown':'80','qty':3}]}
 saved=admin.call('save_shipment',approval,status=201);admin.call('save_shipment',approval,status=409)
 assert db.execute('SELECT count(*) FROM shipments').fetchone()[0]==count+1
 row=db.execute('SELECT * FROM incoming_submissions WHERE id=?',(pending_id,)).fetchone();assert row['status']=='approved' and row['shipment_id']==saved['id'] and row['approved_by'] is not None
 assert json.loads(row['payload'])['items'][0]['godown']=='70'
 approved=admin.call('shipment',params={'id':saved['id']});assert approved['labour_bonus']==17575 and approved['munshi_bonus']==7550;assert approved['truck']=='ADMIN-CORRECTED' and approved['items'][0]['godown']==8000 and approved['items'][0]['qty']==3
 restricted=ops.call('shipment',params={'id':saved['id']});assert restricted['items'][0]['godown'] is None and restricted['items'][0]['total'] is None and restricted['items'][0]['stored_total'] is None
 listed=ops.call('shipments',params={'kind':'incoming','search':'ADMIN-CORRECTED'});assert listed['rows'][0]['total'] is None
 bilty=ops.call('bilties',params={'kind':'incoming','bilty_exact':'PENDING-TEST'})['rows'][0];assert bilty['godown'] is None and bilty['total'] is None
 ops.call('save_shipment',{**approval,'id':saved['id'],'pending_id':None},status=403)
 assert not ops.call('pending_incoming')['rows'] and not admin.call('pending_incoming')['rows']
 # Discard removes only pending work and races safely with approval.
 discarded=ops.call('save_shipment',payload,status=201)['id']
 ops.call('discard_incoming',{'id':discarded},status=403)
 before_discard=db.execute('SELECT count(*) FROM shipments').fetchone()[0]
 admin.call('discard_incoming',{'id':discarded})
 admin.call('discard_incoming',{'id':discarded},status=409)
 admin.call('save_shipment',{**payload,'pending_id':discarded},status=409)
 admin.call('discard_incoming',{'id':pending_id},status=409)
 assert not ops.call('pending_incoming')['rows']
 assert db.execute('SELECT status FROM incoming_submissions WHERE id=?',(discarded,)).fetchone()[0]=='discarded'
 assert db.execute('SELECT count(*) FROM shipments').fetchone()[0]==before_discard
 assert db.execute("SELECT count(*) FROM audit WHERE action='discarded' AND entity='incoming_submission' AND entity_id=?",(str(discarded),)).fetchone()[0]==1
 assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
 db.close();print('Operations submissions isolated; own queue visibility; super-only review/approval; edited approval; retry protection; source retention; server charge redaction passed.')
if __name__=='__main__':main(check)
