"""Goods classification, permission, approval and analytics regressions on a DB copy."""
import urllib.request,urllib.parse,urllib.error,http.cookiejar,json,sqlite3
from integration import main

def check(base,database,password):
 op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));token=''
 def call(action,data=None,params=None,status=200):
  req=urllib.request.Request(base+urllib.parse.urlencode({'action':action,**(params or {})}),data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':token})
  try:
   with op.open(req) as r:
    assert r.status==status,(action,r.status,status);return json.load(r)
  except urllib.error.HTTPError as e:
   body=json.load(e);assert e.code==status,(action,e.code,body,status);return body
 token=call('session')['csrf'];call('login',{'username':'integration-review','password':password})
 db=sqlite3.connect(database);db.row_factory=sqlite3.Row
 catalog=call('goods_catalog');categories={row['name']:row['id'] for row in catalog['categories']};subs={row['name']:row for row in catalog['subcategories']}
 assert {'Cotton','Bundle','Roll','Bag','Drumi','Packet'}<=categories.keys() and len(catalog['subcategories'])>=24
 for name in ['Cotton Shoes','Bag Tea','Bndl bardana','Drumi roghan','Packet Pamper']:assert name in subs
 crate=call('save_goods_category',{'name':'Crate'},status=201)['id'];crate_sub=call('save_goods_category',{'name':'Crate Glass','category_id':crate},status=201)['id']
 call('save_goods_category',{'name':'crate'},status=422);call('save_goods_category',{'name':'Crate Glass','category_id':crate},status=422)
 account=db.execute("SELECT id FROM accounts WHERE customer=1 AND status='A' LIMIT 1").fetchone()[0];station=db.execute("SELECT id FROM stations WHERE status='A' LIMIT 1").fetchone()[0]
 payload={'kind':'incoming','dated':'2026-11-04','truck':'CATEGORY-TEST','station_id':station,'items':[
  {'account_id':account,'bilty':'CAT-1','qty':4,'bilty_amount':'100','godown':'20','goods_category_id':categories['Cotton'],'goods_subcategory_id':subs['Cotton Shoes']['id'],'goods_type':'Cotton Shoes','detail':'Shoes goods description'},
  {'account_id':account,'bilty':'CAT-2','qty':3,'goods_category_id':categories['Cotton'],'goods_type':'Cotton special regression'},
  {'account_id':account,'bilty':'CAT-3','qty':2,'goods_category_id':'other','goods_type':'Wooden crate regression'},
  {'account_id':account,'bilty':'CAT-4','qty':5,'goods_category_id':crate,'goods_subcategory_id':crate_sub,'goods_type':'Crate Glass'}]}
 mismatch={**payload,'items':[{**payload['items'][0],'goods_subcategory_id':subs['Bag Tea']['id']}]};call('save_shipment',mismatch,status=422)
 before=call('goods_analytics',params={'from':'2026-11-04','to':'2026-11-04','status':'all'})['totals']['quantity']
 saved=call('save_shipment',payload,status=201);shipment=call('shipment',params={'id':saved['id']});rows=shipment['items']
 assert rows[0]['goods_category_name']=='Cotton' and rows[0]['goods_subcategory_name']=='Cotton Shoes' and rows[0]['detail']=='Shoes goods description' and rows[0]['total']==12000
 assert rows[1]['goods_custom']=='Cotton special regression' and rows[1]['goods_category_id']==categories['Cotton']
 assert rows[2]['goods_category_id'] is None and rows[2]['goods_type']=='Wooden crate regression'
 stats=call('goods_analytics',params={'from':'2026-11-04','to':'2026-11-04','status':'all'});assert stats['totals']['quantity']==before+14
 assert any(r['subcategory']=='Crate Glass' and r['quantity']==5 for r in stats['rows'])
 # Rename keeps IDs, quantities and incoming links; stale/duplicate edits are rejected.
 call('update_goods_category',{'kind':'subcategory','id':subs['Cotton Shoes']['id'],'original_name':'Cotton Shoes','name':'Cotton Footwear'})
 renamed=call('shipment',params={'id':saved['id']})['items'][0]
 assert renamed['goods_subcategory_id']==subs['Cotton Shoes']['id'] and renamed['goods_subcategory_name']=='Cotton Footwear' and renamed['qty']==4
 call('update_goods_category',{'kind':'subcategory','id':subs['Cotton Shoes']['id'],'original_name':'Cotton Shoes','name':'Stale name'},status=409)
 call('update_goods_category',{'kind':'subcategory','id':subs['Cotton Shoes']['id'],'original_name':'Cotton Footwear','name':'Cotton Oil'},status=422)
 call('update_goods_category',{'kind':'category','id':crate,'original_name':'Crate','name':'Box'})
 assert any(row['id']==crate and row['name']=='Box' for row in call('goods_catalog')['categories'])
 # Operations classification persists through pending submissions and approval, without entering global totals early.
 db.execute("UPDATE users SET role='operations',permissions=? WHERE username='integration-review'",(json.dumps(['incoming.create','incoming.view']),));db.commit()
 call('save_goods_category',{'name':'Forbidden'},status=403)
 call('update_goods_category',{'kind':'category','id':crate,'original_name':'Box','name':'Forbidden'},status=403)
 pending=call('save_shipment',payload,status=201);assert pending['pending']
 assert call('goods_analytics',params={'from':'2026-11-04','to':'2026-11-04','status':'all'})['totals']['quantity']==before+14
 db.execute("UPDATE users SET role='super_admin' WHERE username='integration-review'");db.commit()
 submitted=call('incoming_submission',params={'id':pending['id']});assert submitted['payload']['items'][0]['goods_subcategory_id']==subs['Cotton Shoes']['id']
 approved=call('save_shipment',{**submitted['payload'],'pending_id':pending['id']},status=201)
 assert call('shipment',params={'id':approved['id']})['items'][0]['goods_type']=='Cotton Footwear'
 assert call('goods_analytics',params={'from':'2026-11-04','to':'2026-11-04','status':'all'})['totals']['quantity']==before+28
 assert db.execute("SELECT count(*) FROM items i JOIN shipments s ON s.id=i.shipment_id WHERE s.kind='incoming' AND i.goods_subcategory_id IS NOT NULL").fetchone()[0]>4
 assert db.execute('PRAGMA foreign_key_check').fetchone() is None
 db.close();print('Seeded categories, admin-only additions, duplicate/mismatched categories, custom types, exact legacy classification, quantity analytics and Operations approval classification passed.')
if __name__=='__main__':main(check)
