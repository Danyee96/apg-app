"""Advance bilties cannot receive new delivery discounts; existing ones are retained."""
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
 admin=Client();admin.call('login',{'username':'integration-review','password':password});look=admin.call('lookups');station=next(x['id'] for x in look['stations'] if x['status']=='A');date=datetime.datetime.now(ZoneInfo('Asia/Karachi')).date().isoformat();customer=admin.call('save_customer',{'name':'Advance discount test','group_code':'116'})['id']
 def item(bilty,advance):
  shipment=admin.call('save_shipment',{'kind':'incoming','dated':date,'station_id':station,'truck':'ADVANCE','items':[{'account_id':customer,'bilty':bilty,'qty':1,'bilty_amount':'500','godown':'0','advance':advance}]},status=201);return admin.call('shipment',id=shipment['id'])['items'][0]['id']
 def payload(itemid,discount):return {'request_key':str(uuid.uuid4()),'dated':date,'receiver':'Test','items':[{'id':itemid,'discount':discount,'loading':'0','suzuki':'0','bilty_received':'0','service_received':'0'}]}
 advance=item('ADV-DISC','100');p=payload(advance,'20');admin.call('save_unified_delivery',p,status=422);db=sqlite3.connect(database);assert not db.execute('select 1 from delivery_items where item_id=?',(advance,)).fetchone();p['discount']='0';p['items'][0]['discount']='0';saved=admin.call('save_unified_delivery',p,status=201);doc=admin.call('unified_delivery',id=saved['id']);line=doc['lines'][0]
 edit={'id':saved['id'],'version':doc['version'],'request_key':str(uuid.uuid4()),'dated':date,'receiver':'Test','items':[{'id':line['delivery_item_id'],'discount':'20','loading':'0','suzuki':'0','bilty_received':'0','service_received':'0'}]};admin.call('save_unified_delivery',edit,status=422);assert db.execute('select discount from delivery_items where id=?',(line['delivery_item_id'],)).fetchone()[0]==0
 normal=item('NO-ADV-DISC','0');result=admin.call('save_unified_delivery',payload(normal,'20'),status=201);assert admin.call('unified_delivery',id=result['id'])['lines'][0]['discount']==2000
 # A discount that predates this rule remains unchanged on unrelated edits.
 db.execute('update delivery_items set discount=1000 where id=?',(line['delivery_item_id'],));db.execute('update delivery_cash_lines set bilty_due=bilty_due-1000 where delivery_item_id=?',(line['delivery_item_id'],));db.commit();doc=admin.call('unified_delivery',id=saved['id']);edit.update({'version':doc['version'],'request_key':str(uuid.uuid4())});edit['items'][0]['discount']='10';admin.call('save_unified_delivery',edit,status=201);assert db.execute('select discount from delivery_items where id=?',(line['delivery_item_id'],)).fetchone()[0]==1000;db.close();print('PASS: advance discount locked, ordinary discounts work, historical discount retained')
if __name__=='__main__':main(check)
