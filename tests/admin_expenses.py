"""Admin expenses post once and never change munshi custody."""
import datetime,http.cookiejar,json,sqlite3,urllib.error,urllib.parse,urllib.request,uuid
from zoneinfo import ZoneInfo
from integration import main

def check(base,database,password):
 class Client:
  def __init__(self):self.op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.token='';self.token=self.call('session')['csrf']
  def call(self,action,data=None,params=None,status=200):
   req=urllib.request.Request(base+urllib.parse.urlencode({'action':action,**(params or {})}),data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':self.token})
   try:
    with self.op.open(req) as response:
     result=json.load(response);assert response.status==status,(action,result);return result
   except urllib.error.HTTPError as error:
    result=json.load(error);assert error.code==status,(action,error.code,result,status);return result
 admin=Client();admin.call('login',{'username':'integration-review','password':password})
 admin.call('save_user',{'username':'admin-expense-ops','full_name':'Expense operator','role':'operations','active':1,'permissions':['deliveries.create'],'password':'Admin-expense-only-2026'},status=201);ops=Client();ops.call('login',{'username':'admin-expense-ops','password':'Admin-expense-only-2026'})
 data=admin.call('admin_expenses');cash=data['cash_accounts'][0]['id'];expense=data['expense_accounts'][0]['id'];today=datetime.datetime.now(ZoneInfo('Asia/Karachi')).date().isoformat()
 ops.call('admin_expenses',status=403);before=ops.call('daily_expense')['totals'];cash_before=admin.call('ledger',params={'account_id':cash})['closing'];expense_before=admin.call('ledger',params={'account_id':expense})['closing']
 entry={'request_key':str(uuid.uuid4()),'dated':today,'title':'Admin expense fixture','notes':'Office','amount':'125.50','cash_account_id':cash,'expense_account_id':expense}
 ops.call('save_admin_expense',entry,status=403);saved=admin.call('save_admin_expense',entry,status=201);assert admin.call('save_admin_expense',entry,status=201)['replayed'];admin.call('save_admin_expense',{**entry,'amount':'126'},status=409)
 assert ops.call('daily_expense')['totals']==before
 assert admin.call('ledger',params={'account_id':cash})['closing']==cash_before-12550
 assert admin.call('ledger',params={'account_id':expense})['closing']==expense_before+12550
 filtered=admin.call('admin_expenses',params={'search':'Admin expense fixture','from':today,'to':today});assert filtered['amount']==12550 and filtered['rows'][0]['id']==saved['id'] and filtered['rows'][0]['cash_account_id']==cash
 db=sqlite3.connect(database);assert db.execute('SELECT COUNT(*) FROM admin_expenses WHERE request_key=?',(entry['request_key'],)).fetchone()[0]==1;assert not db.execute('SELECT voucher_id FROM voucher_lines GROUP BY voucher_id HAVING SUM(debit)<>SUM(credit)').fetchall();assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok';db.close();print('Admin expense posts once to selected accounts without changing munshi custody.')
if __name__=='__main__':main(check)
