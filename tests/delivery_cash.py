"""Two-stage handover, collection, receivables and double-entry ledger regressions on a copy."""
import json,urllib.request,urllib.parse,urllib.error,http.cookiejar,sqlite3,uuid
from integration import main

def check(base,database,password):
 class Client:
  def __init__(self):
   self.op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.token='';self.token=self.call('session')['csrf']
  def call(self,action,data=None,params=None,status=200):
   request=urllib.request.Request(base+urllib.parse.urlencode({'action':action,**(params or {})}),data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':self.token})
   try:
    with self.op.open(request) as response:
     body=json.load(response);assert response.status==status,(action,response.status,status,body);return body
   except urllib.error.HTTPError as error:
    body=json.load(error);assert error.code==status,(action,error.code,status,body);return body
 admin=Client();admin.call('login',{'username':'integration-review','password':password});lookup=admin.call('lookups');station=next(s['id'] for s in lookup['stations'] if s['status']=='A');cash=next(a['id'] for a in lookup['accounts'] if a['id'].startswith('1-101-') and a['status']=='A')
 customers=[admin.call('save_customer',{'name':f'Cash flow customer {n}','group_code':'116'})['id'] for n in range(2)]
 shipment=admin.call('save_shipment',{'kind':'incoming','dated':'2026-11-06','station_id':station,'truck':'CASH-FLOW','items':[{'account_id':customers[0],'bilty':'CASH-FLOW-A','qty':1,'bilty_amount':'200','godown':'70','advance':'20'},{'account_id':customers[1],'bilty':'CASH-FLOW-B','qty':1,'bilty_amount':'100','godown':'20'}]},status=201)
 items=admin.call('shipment',params={'id':shipment['id']})['items'];payload={'dated':'2026-11-06','receiver':'Cash flow receiver','items':[{'id':items[0]['id'],'loading':'30','suzuki':'10','discount':'10'},{'id':items[1]['id'],'loading':'0','suzuki':'0','discount':'0'}]}
 admin.call('save_delivery',{**payload,'items':[{**payload['items'][0],'bilty_received':'1'},payload['items'][1]]},status=422)
 saved=admin.call('save_delivery',payload,status=201);id=saved['id'];db=sqlite3.connect(database);db.row_factory=sqlite3.Row
 assert admin.call('delivery',params={'id':id})['cash_summary']['status']=='awaiting_cash'
 invoice=admin.call('delivery_cash_invoice',params={'id':id});assert invoice['due']==40000 and invoice['received']==0 and invoice['outstanding']==40000
 assert all(line['bilty_received']==0 and line['service_received']==0 for line in invoice['lines'])
 assert admin.call('delivery_cash_list',params={'search':'CASH-FLOW-A','status':'awaiting'})['rows'][0]['id']==id
 assert not admin.call('delivery_cash_list',params={'search':'%_'})['rows']
 assert all(admin.call('ledger',params={'account_id':account})['closing']==0 for account in customers)
 assert db.execute('select count(*) from vouchers where memo like ?',('%'+saved['reference']+'%',)).fetchone()[0]==0
 # Changing the source incoming record does not silently rebill or reassign a handover.
 db.execute('update items set godown=?,account_id=? where id=?',(99900,customers[1],items[0]['id']));db.commit()
 source_frozen=admin.call('delivery',params={'id':id});assert source_frozen['items'][0]['godown']==7000 and source_frozen['items'][0]['account_id']==customers[0]
 admin.call('update_delivery',{'id':id,'version':source_frozen['version'],'dated':source_frozen['dated'],'receiver':'Metadata before cash','items':[{'id':line['id'],'discount':str(line['discount']/100),'loading':str(line['loading']/100),'suzuki':str(line['suzuki']/100)} for line in source_frozen['items']]})
 invoice=admin.call('delivery_cash_invoice',params={'id':id});assert invoice['due']==40000 and invoice['lines'][0]['account_id']==customers[0]
 cash_before=admin.call('ledger',params={'account_id':cash})['closing']
 def receipt(inv,amounts):
  return {'delivery_id':id,'version':inv['version'],'request_key':str(uuid.uuid4()),'dated':'2026-11-06','cash_account_id':cash,'items':[{'id':line['delivery_item_id'],'bilty_received':amounts[n][0],'service_received':amounts[n][1]} for n,line in enumerate(inv['lines'])]}
 first=receipt(invoice,[('240','40'),('50','0')]);r=admin.call('receive_delivery_cash',first,status=201);assert admin.call('receive_delivery_cash',first,status=201)['replayed']
 admin.call('receive_delivery_cash',{**first,'request_key':str(uuid.uuid4())},status=409)
 current=admin.call('delivery_cash_invoice',params={'id':id});assert current['received']==33000 and current['outstanding']==7000 and current['lines'][0]['balance']==0 and current['lines'][1]['balance']==7000
 assert admin.call('ledger',params={'account_id':customers[0]})['closing']==0
 assert admin.call('ledger',params={'account_id':customers[1]})['closing']==7000
 assert admin.call('ledger',params={'account_id':cash})['closing']==cash_before+33000
 totals=db.execute('select v.id,sum(l.debit),sum(l.credit) from vouchers v join voucher_lines l on l.voucher_id=v.id where v.memo like ? group by v.id',('%'+saved['reference']+'%',)).fetchall();assert len(totals)==2 and all(row[1]==row[2] for row in totals)
 # An overpayment by A cannot hide what B still owes.
 admin.call('receive_delivery_cash',receipt(current,[('10','0'),('0','0')]),status=201)
 current=admin.call('delivery_cash_invoice',params={'id':id});assert current['outstanding']==7000 and current['credit']==1000 and current['status']=='customer_due'
 admin.call('receive_delivery_cash',receipt(current,[('0','0'),('70','0')]),status=201)
 current=admin.call('delivery_cash_invoice',params={'id':id});assert current['outstanding']==0 and current['credit']==1000 and current['status']=='customer_credit'
 assert admin.call('ledger',params={'account_id':customers[0]})['closing']==-1000
 assert admin.call('ledger',params={'account_id':customers[1]})['closing']==0
 assert admin.call('delivery',params={'id':id})['items'][0]['bilty_received']==25000
 summary=admin.call('delivery_customer_balances');assert next(row for row in summary['rows'] if row['account_id']==customers[0])['balance']==-1000
 d=admin.call('delivery',params={'id':id});admin.call('update_delivery',{'id':id,'version':d['version'],'dated':d['dated'],'receiver':'Changed','items':[{'id':line['id']} for line in d['items']]},status=409)
 metadata={"id":id,"version":d['version'],"dated":d['dated'],"receiver":'Metadata corrected',"items":[{"id":line['id'],"discount":str(line['discount']/100),"loading":str(line['loading']/100),"suzuki":str(line['suzuki']/100)} for line in d['items']]}
 admin.call('update_delivery',metadata);assert admin.call('delivery',params={'id':id})['cash_summary']['received']==41000
 admin.call('save_user',{'username':'cash-operator','full_name':'Cash operator','role':'operations','active':1,'permissions':['deliveries.create'],'password':'Cash-operator-test-2026'},status=201)
 ops=Client();ops.call('login',{'username':'cash-operator','password':'Cash-operator-test-2026'})
 for action in ['delivery_cash_invoice','delivery_cash_list','delivery_customer_balances']:ops.call(action,params={'id':id},status=403)
 ops.call('receive_delivery_cash',first,status=403)
 # Earlier invoices are not backfilled; zero collection explicitly transfers a new due to its customer account.
 second=admin.call('save_shipment',{'kind':'incoming','dated':'2026-11-06','station_id':station,'truck':'ZERO-CASH','items':[{'account_id':customers[1],'bilty':'ZERO-CASH','qty':1,'bilty_amount':'50'}]},status=201)
 item=admin.call('shipment',params={'id':second['id']})['items'][0]
 handed=admin.call('save_delivery',{'dated':'2026-11-06','receiver':'On account','items':[{'id':item['id']}]},status=201);id=handed['id'];zero=admin.call('delivery_cash_invoice',params={'id':id});admin.call('receive_delivery_cash',receipt(zero,[('0','0')]),status=201)
 assert admin.call('ledger',params={'account_id':customers[1]})['closing']==5000
 assert db.execute('pragma integrity_check').fetchone()[0]=='ok' and not db.execute('pragma foreign_key_check').fetchall()
 db.close();print('PASS: handover without cash; per-customer full/partial/unpaid allocations; no cross-customer offset; balanced JV/RV ledger postings; cash account update; later receipts and credit; retry/stale protection; immutable posted charges; operator denied collections; zero cash on account; historic receipts unchanged.')
if __name__=='__main__':main(check)
