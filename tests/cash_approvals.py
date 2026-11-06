"""Operator cash submissions, approval and accounting isolation on a disposable database."""
import json,urllib.request,urllib.parse,urllib.error,http.cookiejar,sqlite3,uuid
from integration import main

def check(base,database,password):
 class Client:
  def __init__(self):
   self.op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.token='';self.token=self.call('session')['csrf']
  def call(self,action,data=None,params=None,status=200):
   req=urllib.request.Request(base+urllib.parse.urlencode({'action':action,**(params or {})}),data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':self.token})
   try:
    with self.op.open(req) as r:
     value=json.load(r);assert r.status==status,(action,r.status,status,value);return value
   except urllib.error.HTTPError as e:
    value=json.load(e);assert e.code==status,(action,e.code,status,value);return value
 admin=Client();admin.call('login',{'username':'integration-review','password':password});operators=[]
 for n in range(2):
  admin.call('save_user',{'username':f'cash-review-ops-{n}','full_name':f'Cash collector {n}','role':'operations','active':1,'permissions':['deliveries.create'],'password':'Cash-review-test-2026'},status=201)
  client=Client();client.call('login',{'username':f'cash-review-ops-{n}','password':'Cash-review-test-2026'});operators.append(client)
 ops,other=operators;lookup=admin.call('lookups');station=next(row['id'] for row in lookup['stations'] if row['status']=='A');customer=admin.call('save_customer',{'name':'Cash review customer','group_code':'116'})['id']
 shipment=admin.call('save_shipment',{'kind':'incoming','dated':'2026-11-06','station_id':station,'truck':'CASH-REVIEW','items':[{'account_id':customer,'bilty':'CASH-REVIEW-1','qty':1,'bilty_amount':'200','godown':'70'}]},status=201)
 item=ops.call('shipment',params={'id':shipment['id']})['items'][0]
 handed=ops.call('save_delivery',{'delivery_mode':'walkin','dated':'2026-11-06','receiver':'Cash review receiver','items':[{'id':item['id'],'loading':'10'}]},status=201);assert not handed.get('pending')
 id=handed['id'];invoice=ops.call('delivery_cash_invoice',params={'id':id});cash=invoice['cash_accounts'][0]['id'];assert invoice['due']==28000
 db=sqlite3.connect(database);db.row_factory=sqlite3.Row;before_vouchers=db.execute('select count(*) from vouchers').fetchone()[0]
 payload={'delivery_id':id,'version':invoice['version'],'request_key':str(uuid.uuid4()),'dated':'2026-11-06','cash_account_id':cash,'notes':'Operator collection','items':[{'id':invoice['lines'][0]['delivery_item_id'],'bilty_received':'200','service_received':'10'}]}
 pending=ops.call('receive_delivery_cash',payload,status=201);assert pending['pending'];assert ops.call('receive_delivery_cash',payload,status=201)['replayed']
 assert db.execute('select count(*) from vouchers').fetchone()[0]==before_vouchers;assert db.execute('select count(*) from delivery_cash_receipts').fetchone()[0]==0
 assert ops.call('delivery',params={'id':id})['cash_summary']['status']=='pending_approval';assert ops.call('delivery',params={'id':id})['cash_summary']['received']==0;assert admin.call('ledger',params={'account_id':customer})['closing']==0
 assert not other.call('pending_cash_collections')['rows'];assert any(row['id']==pending['id'] and row['delivery_mode']=='walkin' for row in admin.call('pending_cash_collections')['rows'])
 other.call('cash_collection_submission',params={'id':pending['id']},status=403)
 ops.call('approve_cash_collection',{'pending_id':pending['id']},status=403);ops.call('discard_cash_collection',{'id':pending['id']},status=403)
 other.call('receive_delivery_cash',{**payload,'request_key':str(uuid.uuid4())},status=409)
 admin.call('receive_delivery_cash',{**payload,'request_key':str(uuid.uuid4())},status=409)
 review=admin.call('cash_collection_submission',params={'id':pending['id']});approval={**review['payload'],'pending_id':review['id'],'pending_version':review['version']};approval['items'][0]['bilty_received']='220'
 admin.call('approve_cash_collection',{**approval,'pending_version':'stale'},status=409)
 admin.call('approve_cash_collection',{**approval,'items':[{'id':99999999}]},status=422)
 approved=admin.call('approve_cash_collection',approval,status=201);admin.call('approve_cash_collection',approval,status=409)
 assert not ops.call('receive_delivery_cash',payload,status=201)['pending']
 current=ops.call('delivery_cash_invoice',params={'id':id});assert current['received']==23000 and current['outstanding']==5000 and current['pending_cash'] is None
 assert admin.call('ledger',params={'account_id':customer})['closing']==5000
 receipt=db.execute('select * from delivery_cash_receipts where id=?',(approved['id'],)).fetchone();assert receipt['created_by']=='cash-review-ops-0'
 record=db.execute('select * from cash_collection_submissions where id=?',(pending['id'],)).fetchone();assert record['status']=='approved' and json.loads(record['payload'])['items'][0]['bilty_received']=='200.00' and json.loads(record['approved_payload'])['items'][0]['bilty_received']=='220'
 totals=db.execute('select sum(l.debit),sum(l.credit) from voucher_lines l join vouchers v on v.id=l.voucher_id where v.memo like ?',('%'+handed['reference']+'%',)).fetchone();assert totals[0]==totals[1]
 next_payload={**payload,'version':current['version'],'request_key':str(uuid.uuid4()),'items':[{'id':current['lines'][0]['delivery_item_id'],'bilty_received':'50','service_received':'0'}]}
 second=ops.call('receive_delivery_cash',next_payload,status=201);admin.call('discard_cash_collection',{'id':second['id']});admin.call('discard_cash_collection',{'id':second['id']},status=409)
 assert admin.call('delivery_cash_invoice',params={'id':id})['received']==23000
 ops.call('receive_delivery_cash',next_payload,status=409)
 next_payload['request_key']=str(uuid.uuid4());ops.call('receive_delivery_cash',next_payload,status=201)
 assert db.execute('pragma integrity_check').fetchone()[0]=='ok' and not db.execute('pragma foreign_key_check').fetchall();db.close()
 print('PASS: operator handover immediate; cash queues without ledger/receipt mutation; own queue and access checks; duplicate prevention; admin correction/approval; retry safety; original collector retained; balanced postings; discarded cash does not change balances and can be resubmitted.')
if __name__=='__main__':main(check)
