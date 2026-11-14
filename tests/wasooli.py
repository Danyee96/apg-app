"""Daily Wasooli allocation, custody and permissions against a disposable database."""
import json,urllib.request,urllib.parse,urllib.error,http.cookiejar,sqlite3,uuid,datetime
from zoneinfo import ZoneInfo
from integration import main

def check(base,database,password):
 class Client:
  def __init__(self):self.op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.token='';self.token=self.call('session')['csrf']
  def call(self,action,data=None,params=None,status=200):
   req=urllib.request.Request(base+urllib.parse.urlencode({'action':action,**(params or {})}),data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':self.token})
   try:
    with self.op.open(req) as r:value=json.load(r);assert r.status==status,(action,value);return value
   except urllib.error.HTTPError as e:
    value=json.load(e);assert e.code==status,(action,e.code,value);return value
 admin=Client();admin.call('login',{'username':'integration-review','password':password});look=admin.call('lookups');station=next(x['id'] for x in look['stations'] if x['status']=='A');cash=look['cash_accounts'][0]['id'];today=datetime.datetime.now(ZoneInfo('Asia/Karachi')).date().isoformat()
 munshi=admin.call('save_user',{'username':'wasooli-ops','full_name':'Wasooli Munshi','role':'operations','active':1,'permissions':['deliveries.create'],'password':'Wasooli-operator-2026'},status=201)['id'];ops=Client();ops.call('login',{'username':'wasooli-ops','password':'Wasooli-operator-2026'})
 admin.call('save_user',{'username':'wasooli-viewer','full_name':'Wasooli Viewer','role':'viewer','active':1,'permissions':[],'password':'Wasooli-viewer-2026'},status=201);viewer=Client();viewer.call('login',{'username':'wasooli-viewer','password':'Wasooli-viewer-2026'});viewer.call('wasooli_customers',status=403)
 customer=admin.call('save_customer',{'name':'Wasooli route customer','group_code':'116','area':'Test Market','mobile':'03001234567'})['id']
 def delivery(label,amount):
  s=admin.call('save_shipment',{'kind':'incoming','dated':today,'station_id':station,'truck':'WASOOLI','items':[{'account_id':customer,'bilty':label,'qty':1,'bilty_amount':str(amount),'godown':'0'}]},status=201);item=admin.call('shipment',params={'id':s['id']})['items'][0]['id'];return admin.call('save_unified_delivery',{'request_key':str(uuid.uuid4()),'dated':today,'received_date':today,'receiver':'Wasooli test','items':[{'id':item,'discount':'0','loading':'0','suzuki':'0','bilty_received':'0','service_received':'0'}]},status=201)['id']
 old=delivery('WAS-OLD',500);new=delivery('WAS-NEW',300)
 legacy=sqlite3.connect(database);legacy.row_factory=sqlite3.Row;sample=legacy.execute("SELECT d.id,i.account_id FROM deliveries d JOIN delivery_items di ON di.delivery_id=d.id JOIN items i ON i.id=di.item_id WHERE d.cash_workflow=0 AND di.bilty_received>0 AND EXISTS(SELECT 1 FROM accounts a WHERE a.id=i.account_id AND a.customer=1) LIMIT 1").fetchone();legacy.close()
 if sample:
  old_details=ops.call('wasooli_customer',params={'account_id':sample['account_id']});assert old_details['history'] and any(row['amount']>0 for row in old_details['history'])
 for q in ['Wasooli route','03001234567',customer,'Test Market']:
  rows=ops.call('wasooli_customers',params={'search':q,'area':'Test Market'})['rows'];assert len(rows)==1 and rows[0]['id']==customer and rows[0]['outstanding']==80000
 details=ops.call('wasooli_customer',params={'account_id':customer});assert details['summary']['outstanding']==80000 and len(details['debts'])==2
 pay={'request_key':str(uuid.uuid4()),'account_id':customer,'operator_id':munshi,'period_token':details['operators'][0]['period_token'],'balance_version':details['balance_version'],'amount':'650','dated':today,'cash_account_id':cash,'notes':'Market visit'}
 got=ops.call('wasooli_collect',pay,status=201);assert got['amount']==65000 and got['credit']==0;assert ops.call('wasooli_collect',pay,status=201)['replayed']
 d=ops.call('wasooli_customer',params={'account_id':customer});assert d['summary']['outstanding']==15000 and sum(x['amount'] for x in d['history'])==65000
 assert admin.call('unified_delivery',params={'id':old})['lines'][0]['bilty_balance']==0 and admin.call('unified_delivery',params={'id':new})['lines'][0]['bilty_balance']==15000
 ledger=ops.call('daily_expense');assert ledger['totals']['received']==65000 and ledger['total']==1 and ledger['rows'][0]['amount']==65000
 entry=ops.call('daily_expense_entry',params={'id':ledger['rows'][0]['id']});assert entry['wasooli']['account_id']==customer and sum(x['amount'] for x in entry['allocations'])==65000
 stale={**pay,'request_key':str(uuid.uuid4())};ops.call('wasooli_collect',stale,status=409);assert ops.call('daily_expense')['totals']['received']==65000
 details=admin.call('wasooli_customer',params={'account_id':customer});owner=next(x for x in details['operators'] if x['id']==munshi);pay2={**pay,'request_key':str(uuid.uuid4()),'amount':'200','balance_version':details['balance_version'],'period_token':owner['period_token']};admin.call('wasooli_collect',pay2,status=422);pay2['confirm_credit']=True;result=admin.call('wasooli_collect',pay2,status=201);assert result['credit']==5000
 after=ops.call('wasooli_customer',params={'account_id':customer});assert after['summary']['outstanding']==0 and after['summary']['credit']==5000;assert ops.call('daily_expense')['totals']['received']==85000
 period=ops.call('daily_expense');clear={'request_key':str(uuid.uuid4()),'period_id':period['period']['id'],'version':period['version']};admin.call('clear_operator_receivable',clear,status=201)
 stale_period={**pay2,'request_key':str(uuid.uuid4()),'amount':'10','balance_version':after['balance_version']};admin.call('wasooli_collect',stale_period,status=409);assert ops.call('daily_expense')['totals']['received']==0
 closed=admin.call('daily_expense',params={'operator_id':munshi,'period_id':period['period']['id']});assert closed['totals']['received']==85000 and closed['period']['settlement_amount']==85000
 db=sqlite3.connect(database);assert not db.execute('SELECT voucher_id FROM voucher_lines GROUP BY voucher_id HAVING SUM(debit)<>SUM(credit)').fetchall();assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok' and not db.execute('PRAGMA foreign_key_check').fetchall();db.close()
 print('PASS: wasooli route filters, oldest-first payments, one custody entry, history, credit, permissions and idempotent rollback')
if __name__=='__main__':main(check)
