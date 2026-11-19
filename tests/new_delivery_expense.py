"""Expenses entered with a new delivery post once and roll back on errors."""
import json,urllib.request,urllib.parse,urllib.error,http.cookiejar,uuid,datetime,sqlite3
from zoneinfo import ZoneInfo
from integration import main

def check(base,database,password):
 class Client:
  def __init__(self):self.op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.token='';self.token=self.call('session')['csrf']
  def call(self,action,data=None,status=200,**params):
   req=urllib.request.Request(base+urllib.parse.urlencode({'action':action,**params}),data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':self.token})
   try:
    with self.op.open(req) as r:result=json.load(r);assert r.status==status,(action,result);return result
   except urllib.error.HTTPError as e:
    result=json.load(e);assert e.code==status,(action,e.code,result);return result
 admin=Client();admin.call('login',{'username':'integration-review','password':password});operator=admin.call('save_user',{'username':'expense-new-munshi','full_name':'Expense munshi','role':'operations','active':1,'permissions':['deliveries.create'],'password':'Expense-new-2026'},status=201)['id'];look=admin.call('lookups');assert look['expense_accounts'];cash=look['cash_accounts'][0]['id'];expense=look['expense_accounts'][0]['id'];station=next(x['id'] for x in look['stations'] if x['status']=='A');date=datetime.datetime.now(ZoneInfo('Asia/Karachi')).date().isoformat();customer=admin.call('save_customer',{'name':'New delivery expense test','group_code':'116'})['id']
 def make_item(label):
  shipment=admin.call('save_shipment',{'kind':'incoming','dated':date,'station_id':station,'truck':'EXPENSE','items':[{'account_id':customer,'bilty':label,'qty':1,'bilty_amount':'500','godown':'0'}]},status=201);return admin.call('shipment',id=shipment['id'])['items'][0]['id']
 def payload(item):return {'request_key':str(uuid.uuid4()),'dated':date,'received_date':date,'receiver':'Test','cash_account_id':cash,'delivery_expense':'75','expense_operator_id':operator,'expense_account_id':expense,'items':[{'id':item,'discount':'0','loading':'0','suzuki':'0','bilty_received':'0','service_received':'0'}]}
 item=make_item('EXP-NEW-1');p=payload(item);saved=admin.call('save_unified_delivery',p,status=201);assert saved['expense_id'];assert admin.call('save_unified_delivery',p,status=201)['replayed'];doc=admin.call('unified_delivery',id=saved['id']);assert len(doc['delivery_expenses'])==1 and doc['delivery_expenses'][0]['amount']==7500
 db=sqlite3.connect(database);assert db.execute('select count(*) from delivery_expenses where delivery_id=?',(saved['id'],)).fetchone()[0]==1;assert db.execute('select count(*) from voucher_lines group by voucher_id having sum(debit)<>sum(credit)').fetchall()==[]
 item=make_item('EXP-NEW-2');bad=payload(item);bad['expense_account_id']='not-an-account';admin.call('save_unified_delivery',bad,status=422);assert not db.execute('select 1 from delivery_items where item_id=?',(item,)).fetchone()
 ops=Client();ops.call('login',{'username':'expense-new-munshi','password':'Expense-new-2026'});assert ops.call('lookups')['expense_accounts'];item=make_item('EXP-NEW-3');p=payload(item);p.pop('expense_operator_id');created=ops.call('save_unified_delivery',p,status=201);assert created['expense_id'];assert db.execute('select operator_id,amount from operator_cash_entries where id=?',(created['expense_id'],)).fetchone()==(operator,7500);db.close();print('PASS: new delivery expense, idempotency, rollback and munshi ownership')
if __name__=='__main__':main(check)
