"""Daily labour uses delivery loading charges and Suzuki cash actually received."""
import json,urllib.request,urllib.parse,urllib.error,http.cookiejar,uuid,datetime,sqlite3
from zoneinfo import ZoneInfo
from integration import main

def check(base,database,password):
 class Client:
  def __init__(self):
   self.op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.token='';self.token=self.call('session')['csrf']
  def call(self,action,data=None,params=None,status=200):
   req=urllib.request.Request(base+urllib.parse.urlencode({'action':action,**(params or {})}),data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':self.token})
   try:
    with self.op.open(req) as response:
     result=json.load(response);assert response.status==status,(response.status,result);return result
   except urllib.error.HTTPError as err:
    result=json.load(err);assert err.code==status,(err.code,result,status);return result
 admin=Client();admin.call('login',{'username':'integration-review','password':password});lookup=admin.call('lookups');station=next(x['id'] for x in lookup['stations'] if x['status']=='A');cash=lookup['cash_accounts'][0]['id'];customer=admin.call('save_customer',{'name':'Labour test customer','group_code':'116'})['id'];date='2035-01-02'
 def arrival(label,qty,bonus):
  shipment=admin.call('save_shipment',{'kind':'incoming','dated':date,'station_id':station,'truck':label,'labour_bonus':bonus,'munshi_bonus':'900','items':[{'account_id':customer,'bilty':label,'qty':qty,'bilty_amount':'1000'}]},status=201)
  return admin.call('shipment',params={'id':shipment['id']})
 first=arrival('LABOUR-ONE',514,'100');second=arrival('LABOUR-TWO',100,'200')
 for index,record in enumerate((first,second)):
  admin.call('save_unified_delivery',{'request_key':str(uuid.uuid4()),'dated':date,'received_date':date,'receiver':'Labour test','cash_account_id':cash,'items':[{'id':record['items'][0]['id'],'loading':['100','50'][index],'suzuki':['200','100'][index],'discount':'0','bilty_received':'0','service_received':['150','0'][index]}]},status=201)
 result=admin.call('daily_labour_expense',params={'dated':date})
 assert result['quantity']==614 and result['shah_g']==61400 and result['labour_bonus']==30000
 assert result['loading']==15000 and result['suzuki']==5000 and result['half_suzuki']==2500 and result['total']==108900
 assert len(result['incoming'])==2 and len(result['deliveries'])==2
 admin.call('save_user',{'username':'labour-ops','full_name':'Labour operator','role':'operations','active':1,'permissions':['incoming.create'],'password':'Labour-operator-2026'},status=201)
 ops=Client();ops.call('login',{'username':'labour-ops','password':'Labour-operator-2026'});assert ops.call('daily_labour_expense',params={'dated':date})['total']==108900
 pending=ops.call('save_shipment',{'kind':'incoming','dated':date,'station_id':station,'truck':'PENDING-LABOUR','labour_bonus':'1000','items':[{'account_id':customer,'bilty':'LABOUR-PENDING','qty':100,'bilty_amount':'1'}]},status=201);assert pending['pending'] and ops.call('daily_labour_expense',params={'dated':date})['total']==108900
 today=datetime.datetime.now(ZoneInfo('Asia/Karachi')).date().isoformat();before=admin.call('daily_labour_expense',params={'dated':today});ledger=ops.call('daily_expense')
 payment={'request_key':str(uuid.uuid4()),'period_token':ledger['period_token'],'dated':today,'amount':'150','expense_type':'labour_advance','labour_name':'Ali Khan','cash_account_id':cash,'expense_account_id':'5-501-OPS','notes':'Morning advance'}
 ops.call('save_daily_expense',{**payment,'labour_name':''},status=422)
 saved=ops.call('save_daily_expense',payment,status=201);assert ops.call('save_daily_expense',payment,status=201)['replayed']
 after=admin.call('daily_labour_expense',params={'dated':today});assert after['gross']==before['gross'] and after['advances_total']==before['advances_total']+15000 and after['total']==before['total']-15000
 assert any(row['id']==saved['id'] and row['labour_name']=='Ali Khan' and row['amount']==15000 for row in after['advances'])
 d=ops.call('daily_expense');assert d['totals']['expenses']==15000 and any(row['id']==saved['id'] and 'Ali Khan' in row['title'] for row in d['rows'])
 db=sqlite3.connect(database);assert db.execute('SELECT COUNT(*) FROM labour_advances WHERE entry_id=?',(saved['id'],)).fetchone()[0]==1;assert db.execute('SELECT COUNT(*) FROM vouchers v JOIN operator_cash_entries e ON e.voucher_id=v.id WHERE e.id=?',(saved['id'],)).fetchone()[0]==1;db.close()
 admin.call('clear_operator_receivable',{'request_key':str(uuid.uuid4()),'period_id':d['period']['id'],'version':d['version']},status=201)
 assert admin.call('daily_labour_expense',params={'dated':today})['advances_total']==after['advances_total']
 admin.call('save_user',{'username':'labour-viewer','full_name':'Labour viewer','role':'viewer','active':1,'permissions':['deliveries.view'],'password':'Labour-viewer-2026'},status=201)
 viewer=Client();viewer.call('login',{'username':'labour-viewer','password':'Labour-viewer-2026'});viewer.call('daily_labour_expense',params={'dated':date},status=403)
 admin.call('daily_labour_expense',params={'dated':'not-a-date'},status=422)
 empty=admin.call('daily_labour_expense',params={'dated':'2035-01-03'});assert empty['total']==0 and not empty['incoming'] and not empty['deliveries']
 admin.call('save_shipment',{'kind':'incoming','dated':today,'station_id':station,'truck':'CLEAR-LABOUR','labour_bonus':'500','items':[{'account_id':customer,'bilty':'CLEAR-LABOUR','qty':1,'bilty_amount':'1'}]},status=201)
 summary=admin.call('labour_clearance_summary');assert summary['outstanding']>0
 request={'request_key':str(uuid.uuid4()),'version':summary['version'],'cash_account_id':cash}
 ops.call('save_labour_clearance',request,status=403)
 paid=admin.call('save_labour_clearance',request,status=201);assert paid['amount']==summary['outstanding']
 assert admin.call('save_labour_clearance',request,status=201)['replayed']
 after_clear=admin.call('labour_clearance_summary');assert after_clear['outstanding']==0 and len(after_clear['history'])==1
 db=sqlite3.connect(database);assert db.execute('SELECT COUNT(*) FROM labour_clearances c JOIN vouchers v ON v.id=c.voucher_id WHERE c.id=?',(paid['id'],)).fetchone()[0]==1;db.close()
 admin.call('save_labour_clearance',{'request_key':str(uuid.uuid4()),'version':summary['version'],'cash_account_id':cash},status=409)
 print('PASS: daily loading, half Suzuki, labour bonus, SHAH G quantity, role access and pending exclusion.')
if __name__=='__main__':main(check)
