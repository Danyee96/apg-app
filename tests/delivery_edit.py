"""Saved delivery edit regressions. All writes use a disposable database."""
import urllib.request,urllib.parse,urllib.error,http.cookiejar,json,sqlite3
from integration import main

def check(base,database,password):
 op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));token=''
 def call(action,data=None,params=None,status=200):
  req=urllib.request.Request(base+urllib.parse.urlencode({'action':action,**(params or {})}),data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':token})
  try:
   with op.open(req) as r:
    assert r.status==status,(action,r.status,status)
    return json.load(r)
  except urllib.error.HTTPError as e:
   body=json.load(e);assert e.code==status,(action,e.code,body,status);return body
 token=call('session')['csrf'];call('login',{'username':'integration-review','password':password})
 db=sqlite3.connect(database);db.row_factory=sqlite3.Row
 customer=db.execute("SELECT id FROM accounts WHERE customer=1 AND status='A' LIMIT 1").fetchone()[0];station=db.execute("SELECT id FROM stations WHERE status='A' LIMIT 1").fetchone()[0]
 shipment=call('save_shipment',{'kind':'incoming','dated':'2026-11-04','station_id':station,'truck':'DELIVERY-EDIT','items':[{'account_id':customer,'bilty':'EDIT-D1','party_to':'Recipient','qty':2,'bilty_amount':'100','godown':'20','loading':'10'}]},status=201)
 item=call('shipment',params={'id':shipment['id']})['items'][0]
 created=call('save_delivery',{'dated':'2026-11-04','receiver':'Original receiver','items':[{'id':item['id'],'bilty_received':'0','service_received':'0'}]},status=201)
 d=call('delivery',params={'id':created['id']})
 edit={'id':d['id'],'version':d['version'],'dated':d['dated'],'receiver':'Corrected receiver','mobile':'03000000000','cnic':'123','remarks':'Correction','items':[{'id':item['id'],'loading':'15.25','suzuki':'5.75','discount':'50','bilty_received':'0','service_received':'0'}]}
 db.execute("UPDATE users SET role='custom',permissions=? WHERE username='integration-review'",(json.dumps(['deliveries.create','deliveries.view','incoming.view']),));db.commit()
 call('update_delivery',edit,status=403)
 db.execute("UPDATE users SET permissions=? WHERE username='integration-review'",(json.dumps(['deliveries.edit','deliveries.view','incoming.view']),));db.commit()
 result=call('update_delivery',edit);assert not result['warnings']
 call('update_delivery',edit,status=409)
 updated=call('delivery',params={'id':d['id']});assert updated['reference']==d['reference'] and updated['receiver']=='Corrected receiver'
 assert (updated['items'][0]['loading'],updated['items'][0]['suzuki'],updated['items'][0]['bilty_received'],updated['items'][0]['discount'])==(1525,575,0,5000)
 assert db.execute('SELECT loading FROM items WHERE id=?',(item['id'],)).fetchone()[0]==1000
 assert db.execute('SELECT status FROM items WHERE id=?',(item['id'],)).fetchone()[0]=='delivered'
 assert db.execute('SELECT count(*) FROM delivery_revisions WHERE delivery_id=?',(d['id'],)).fetchone()[0]==1
 bad={**edit,'version':updated['version'],'items':[{**edit['items'][0],'id':9999999}]};call('update_delivery',bad,status=422)
 call('update_delivery',{**edit,'version':updated['version'],'dated':'2026-11-03'},status=422)
 # A later incoming-goods correction invalidates an already-open delivery editor.
 db.execute('UPDATE items SET qty=qty+1 WHERE id=?',(item['id'],));db.commit()
 call('update_delivery',{**edit,'version':updated['version']},status=409)
 db.execute("UPDATE users SET role='super_admin' WHERE username='integration-review'");db.commit()
 # Legacy receipt charges remain the original GD values while edited collections print correctly.
 legacy=db.execute("SELECT id FROM deliveries WHERE legacy_id IS NOT NULL AND id IN (SELECT delivery_id FROM delivery_items WHERE legacy_id IS NOT NULL) ORDER BY id DESC LIMIT 1").fetchone()[0]
 old=call('delivery',params={'id':legacy});source=[(r['source_id'],r['bilty_amount'],r['godown']) for r in old['print_items']]
 p={'id':legacy,'version':old['version'],'dated':max(old['dated'],max(row['dated'] for row in old['items'])),'receiver':'Legacy corrected receiver','items':[{'id':row['id'],'discount':'0','bilty_received':'1','service_received':'0','loading':str(row['loading']/100),'suzuki':str(row['suzuki']/100)} for row in old['items']]}
 call('update_delivery',p);new=call('delivery',params={'id':legacy})
 assert new['print_header']['receiver']=='Legacy corrected receiver'
 assert [(r['source_id'],r['bilty_amount'],r['godown']) for r in new['print_items']]==source
 assert all(r['bilty_received']==100 for r in new['print_items'])
 assert db.execute('PRAGMA foreign_key_check').fetchone() is None
 db.close();print('Delivery edit permission, corrected header/cash/charges, stale edits, fixed membership, source preservation, revision audit and legacy printed corrections passed.')
if __name__=='__main__':main(check)
