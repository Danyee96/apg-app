"""Operator collections, immutable expenses and clearance cycles on a disposable database."""
import datetime
from zoneinfo import ZoneInfo
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
 admin=Client();admin.call('login',{'username':'integration-review','password':password});lookup=admin.call('lookups');cash=lookup['cash_accounts'][0]['id'];station=next(row['id'] for row in lookup['stations'] if row['status']=='A');today=datetime.datetime.now(ZoneInfo('Asia/Karachi')).date().isoformat()
 ids=[];operators=[]
 for n in range(2):
  ids.append(admin.call('save_user',{'username':f'daily-ops-{n}','full_name':f'Daily operator {n}','role':'operations','active':1,'permissions':['deliveries.create'],'password':'Daily-operator-2026'},status=201)['id']);client=Client();client.call('login',{'username':f'daily-ops-{n}','password':'Daily-operator-2026'});operators.append(client)
 ops,other=operators;customer=admin.call('save_customer',{'name':'Daily expense customer','group_code':'116'})['id'];db=sqlite3.connect(database);db.row_factory=sqlite3.Row
 # The migration records a receipt watermark; old receipts are not backfilled.
 floor=int(db.execute("SELECT value FROM meta WHERE key='operator_cash_receipt_floor'").fetchone()[0]);assert not db.execute('SELECT id FROM operator_cash_entries WHERE receipt_id<=?',(floor,)).fetchall()
 assert ops.call('daily_expense')['totals']['balance']==0
 def collect(client,label,amount=1000,loading=100,suzuki=50):
  s=admin.call('save_shipment',{'kind':'incoming','dated':today,'station_id':station,'truck':'DAILY','items':[{'account_id':customer,'bilty':label,'qty':1,'bilty_amount':str(amount),'godown':'0'}]},status=201);item=admin.call('shipment',params={'id':s['id']})['items'][0]['id'];p={'request_key':str(uuid.uuid4()),'dated':today,'received_date':today,'receiver':'Daily receiver','cash_account_id':cash,'items':[{'id':item,'discount':'0','loading':str(loading),'suzuki':str(suzuki),'bilty_received':str(amount),'service_received':str(loading+suzuki)}]};return client.call('save_unified_delivery',p,status=201),p
 receipt,p=collect(ops,'DAILY-A');assert ops.call('save_unified_delivery',p,status=201)['replayed']
 d=ops.call('daily_expense');assert d['totals']['received']==115000 and d['totals']['balance']==115000 and d['total']==1
 assert other.call('daily_expense')['totals']['received']==0
 assert admin.call('daily_expense',params={'operator_id':ids[0]})['totals']['balance']==115000
 ops.call('daily_expense',params={'operator_id':ids[1]},status=403);other.call('daily_expense_entry',params={'id':d['rows'][0]['id']},status=403)
 details=ops.call('daily_expense_entry',params={'id':d['rows'][0]['id']});assert len(details['items'])==1 and details['items'][0]['bilty']=='DAILY-A'
 before_cash=admin.call('ledger',params={'account_id':cash})['closing'];before_customer=admin.call('ledger',params={'account_id':customer})['closing']
 def expense(data,amount='200'):
  return {'request_key':str(uuid.uuid4()),'period_token':data['period_token'],'dated':'2026-11-07','amount':amount,'title':'Fuel and office run','notes':'Daily expense test','cash_account_id':cash,'expense_account_id':'5-501-OPS'}
 out=expense(d);saved=ops.call('save_daily_expense',out,status=201);assert ops.call('save_daily_expense',out,status=201)['replayed']
 d=ops.call('daily_expense');assert d['totals']['received']==115000 and d['totals']['expenses']==20000 and d['totals']['balance']==95000 and d['total']==2
 assert d['rows'][0]['running_balance']==95000 and d['rows'][1]['running_balance']==115000
 assert admin.call('ledger',params={'account_id':cash})['closing']==before_cash-20000 and admin.call('ledger',params={'account_id':customer})['closing']==before_customer
 ops.call('save_daily_expense',{**expense(d),'id':saved['id']},status=403);ops.call('save_daily_expense',{**expense(d),'operator_id':ids[1]},status=403);ops.call('save_daily_expense',{**expense(d),'kind':'collection'},status=422)
 ops.call('clear_operator_receivable',{'period_id':d['period']['id']},status=403)
 filtered=ops.call('daily_expense',params={'kind':'collection','from':today,'to':today});assert filtered['total']==1 and filtered['totals']['expenses']==20000 and filtered['totals']['balance']==95000
 stale_clear={'request_key':str(uuid.uuid4()),'period_id':d['period']['id'],'version':d['version'],'notes':'Received cash'}
 ops.call('save_daily_expense',expense(d,'50'),status=201);admin.call('clear_operator_receivable',stale_clear,status=409)
 d=admin.call('daily_expense',params={'operator_id':ids[0]});assert d['totals']['balance']==90000
 clear={**stale_clear,'version':d['version']};count=db.execute('SELECT count(*) FROM vouchers').fetchone()[0];result=admin.call('clear_operator_receivable',clear,status=201);assert result['amount']==90000 and admin.call('clear_operator_receivable',clear,status=201)['replayed'];assert db.execute('SELECT count(*) FROM vouchers').fetchone()[0]==count
 admin.call('clear_operator_receivable',{**clear,'request_key':str(uuid.uuid4())},status=409)
 fresh=ops.call('daily_expense');assert fresh['period'] is None and fresh['totals']['balance']==0 and fresh['history']['total']==1
 closed=ops.call('daily_expense',params={'period_id':result['id']});assert closed['period']['closed_at'] and closed['totals']['balance']==90000 and closed['total']==3 and closed['period']['settlement_amount']==90000
 ops.call('save_daily_expense',expense(d,'10'),status=409)
 collect(ops,'DAILY-NEW',500,0,0);new=ops.call('daily_expense');assert new['period']['id']!=closed['period']['id'] and new['totals']['balance']==50000
 # Clear markers are based on periods/entry IDs, never by date or deleting history.
 neg=ops.call('save_daily_expense',expense(new,'600'),status=201);assert neg['balance']==-10000 and neg['warning'];assert ops.call('daily_expense',params={'period_id':closed['period']['id']})['total']==3
 collect(other,'DAILY-B',300,0,0);admin_view=admin.call('daily_expense',params={'operator_id':ids[0]});assert admin_view['all_receivable']==30000
 negative_clear={'request_key':str(uuid.uuid4()),'period_id':admin_view['period']['id'],'version':admin_view['version'],'notes':'Reimbursed operator'};assert admin.call('clear_operator_receivable',negative_clear,status=201)['amount']==-10000
 # Admin's own collections do not become an operator's custody receivable.
 before=db.execute("SELECT COUNT(*) FROM operator_cash_entries WHERE kind='collection'").fetchone()[0];collect(admin,'DAILY-ADMIN',100,0,0);assert db.execute("SELECT COUNT(*) FROM operator_cash_entries WHERE kind='collection'").fetchone()[0]==before
 # Admin can record an expense for a chosen munshi, retaining the real actor.
 target=admin.call('daily_expense',params={'operator_id':ids[1]});assert target['expense_accounts'] and target['cash_accounts']
 admin_expense={**expense(target,'25'),'operator_id':ids[1]}
 added=admin.call('save_daily_expense',admin_expense,status=201);assert admin.call('save_daily_expense',admin_expense,status=201)['replayed']
 updated=other.call('daily_expense');assert updated['totals']['balance']==27500
 detail=admin.call('daily_expense_entry',params={'id':added['id']})['entry'];assert detail['actor_name']=='integration-review' and detail['operator_id']==ids[1]
 other.call('save_daily_expense',admin_expense,status=409)
 admin.call('save_daily_expense',expense(updated,'5'),status=422)
 # Manual receipts add cash without pretending to be a delivery or changing customers.
 current=other.call('daily_expense');cash_before=admin.call('ledger',params={'account_id':cash})['closing'];customer_before=admin.call('ledger',params={'account_id':customer})['closing']
 manual={**expense(current,'425'),'operator_id':ids[1],'title':'Cash from office owner'}
 r=other.call('save_daily_cash_received',manual,status=201);assert other.call('save_daily_cash_received',manual,status=201)['replayed']
 manual_detail=other.call('daily_expense_entry',params={'id':r['id']})['entry'];assert manual_detail['kind']=='collection' and manual_detail['receipt_id'] is None and manual_detail['voucher_id']
 assert other.call('daily_expense')['totals']['balance']==70000
 assert admin.call('ledger',params={'account_id':cash})['closing']==cash_before+42500
 assert admin.call('ledger',params={'account_id':customer})['closing']==customer_before
 ops.call('save_daily_cash_received',manual,status=403)
 other.call('save_daily_cash_received',{**manual,'request_key':str(uuid.uuid4()),'id':r['id']},status=403)
 other.call('save_daily_cash_received',{**manual,'request_key':str(uuid.uuid4()),'amount':'0'},status=422)
 admin.call('save_user',{'username':'daily-viewer','full_name':'Daily viewer','role':'viewer','active':1,'permissions':['deliveries.view'],'password':'Daily-viewer-2026'},status=201);viewer=Client();viewer.call('login',{'username':'daily-viewer','password':'Daily-viewer-2026'});viewer.call('daily_expense',status=403);viewer.call('save_daily_expense',out,status=403);viewer.call('save_daily_cash_received',out,status=403)
 try:db.execute('UPDATE operator_cash_entries SET amount=1 WHERE id=?',(saved['id'],));raise AssertionError('Entry must be immutable')
 except sqlite3.IntegrityError:db.rollback()
 assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok' and not db.execute('PRAGMA foreign_key_check').fetchall();assert not db.execute('SELECT voucher_id FROM voucher_lines GROUP BY voucher_id HAVING SUM(debit)<>SUM(credit)').fetchall();db.close()
 print('PASS: forward-only automatic collections; immutable own expenses; balanced expense postings; no duplicate receipts; date-filter scope; stale-clear guard; admin-only closure; retained history; fresh periods; negative balances; role isolation.')
if __name__=='__main__':main(check)
