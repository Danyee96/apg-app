"""Immediate operator cash collections and accounting isolation on a disposable database."""
import json,urllib.request,urllib.parse,urllib.error,http.cookiejar,sqlite3,uuid,subprocess,os,pathlib,hashlib
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
 db=sqlite3.connect(database);db.row_factory=sqlite3.Row;cash_before=admin.call('ledger',params={'account_id':cash})['closing']
 payload={'delivery_id':id,'version':invoice['version'],'request_key':str(uuid.uuid4()),'dated':'2026-11-06','cash_account_id':cash,'notes':'Operator collection','items':[{'id':invoice['lines'][0]['delivery_item_id'],'bilty_received':'200','loading_received':'10','suzuki_received':'0'}]}
 receipt=ops.call('receive_delivery_cash',payload,status=201);assert not receipt.get('pending');assert ops.call('receive_delivery_cash',payload,status=201)['replayed']
 assert db.execute('select count(*) from cash_collection_submissions where delivery_id=?',(id,)).fetchone()[0]==0
 current=admin.call('delivery_cash_invoice',params={'id':id});assert current['received']==21000 and current['outstanding']==7000 and current['pending_cash'] is None
 assert admin.call('ledger',params={'account_id':customer})['closing']==7000 and admin.call('ledger',params={'account_id':cash})['closing']==cash_before+21000
 assert db.execute('select created_by from delivery_cash_receipts where id=?',(receipt['id'],)).fetchone()[0]=='cash-review-ops-0'
 ops.call('receive_delivery_cash',{**payload,'request_key':str(uuid.uuid4())},status=409)
 final={**payload,'version':current['version'],'request_key':str(uuid.uuid4()),'items':[{'id':current['lines'][0]['delivery_item_id'],'bilty_received':'70','loading_received':'0','suzuki_received':'0'}]}
 other.call('receive_delivery_cash',final,status=201);assert admin.call('delivery_cash_invoice',params={'id':id})['outstanding']==0
 assert admin.call('ledger',params={'account_id':customer})['closing']==0
 admin.call('save_user',{'username':'cash-viewer','full_name':'Cash viewer','role':'viewer','active':1,'permissions':['deliveries.view'],'password':'Cash-viewer-2026'},status=201)
 viewer=Client();viewer.call('login',{'username':'cash-viewer','password':'Cash-viewer-2026'});viewer.call('receive_delivery_cash',final,status=403)
 ops.call('approve_cash_collection',{'pending_id':1},status=403)
 # Transition an old queued proposal once without losing its payload or collector.
 current=admin.call('delivery_cash_invoice',params={'id':id});old={**payload,'version':current['version'],'request_key':str(uuid.uuid4()),'notes':'Preserved legacy queue','items':[{'id':current['lines'][0]['delivery_item_id'],'bilty_received':'0','loading_received':'0','suzuki_received':'5'}]}
 raw=json.dumps(old,separators=(',',':'));digest=hashlib.sha256(raw.encode()).hexdigest();actor=db.execute("SELECT id FROM users WHERE username='cash-review-ops-0'").fetchone()[0]
 db.execute("INSERT INTO cash_collection_submissions(delivery_id,submitted_by,submitted_name,payload,request_key,request_hash) VALUES(?,?,?,?,?,?)",(id,actor,'cash-review-ops-0',raw,old['request_key'],digest));queued=db.execute('SELECT last_insert_rowid()').fetchone()[0];db.commit()
 code='require "bootstrap.php"; require "access.php"; require "delivery_cash.php"; require "delivery_unified.php"; echo json_encode(settle_pending_delivery_cash());'
 transition=json.loads(subprocess.run(['php','-r',code],cwd=pathlib.Path(__file__).resolve().parents[1],env=dict(os.environ,APG_STORAGE=str(pathlib.Path(database).parent)),capture_output=True,text=True,check=True).stdout)
 assert transition['posted']>=1 and not transition['errors']
 history=db.execute('SELECT * FROM cash_collection_submissions WHERE id=?',(queued,)).fetchone();assert history['status']=='approved' and history['payload']==raw and history['approved_by'] is None
 assert db.execute('SELECT created_by FROM delivery_cash_receipts WHERE id=?',(history['receipt_id'],)).fetchone()[0]=='cash-review-ops-0'
 assert ops.call('receive_delivery_cash',old,status=201)['replayed']
 count=db.execute('SELECT count(*) FROM delivery_cash_receipts WHERE delivery_id=?',(id,)).fetchone()[0]
 again=json.loads(subprocess.run(['php','-r',code],cwd=pathlib.Path(__file__).resolve().parents[1],env=dict(os.environ,APG_STORAGE=str(pathlib.Path(database).parent)),capture_output=True,text=True,check=True).stdout);assert again['posted']==0 and db.execute('SELECT count(*) FROM delivery_cash_receipts WHERE delivery_id=?',(id,)).fetchone()[0]==count
 assert db.execute('pragma integrity_check').fetchone()[0]=='ok' and not db.execute('pragma foreign_key_check').fetchall()
 assert not db.execute('SELECT voucher_id FROM voucher_lines GROUP BY voucher_id HAVING SUM(debit)<>SUM(credit)').fetchall();db.close()
 print('PASS: operator cash posts immediately; admin visibility; no approval rows; separate service/customer balances; duplicate and stale protection; permission checks; original collector; balanced postings.')
if __name__=='__main__':main(check)
