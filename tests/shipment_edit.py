"""Saved shipment editing regressions on a disposable database."""
import urllib.request,urllib.parse,urllib.error,http.cookiejar,json,sqlite3
from integration import main

def check(base,database,password):
 op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
 token=''
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
 account=db.execute("SELECT id FROM accounts WHERE customer=1 AND status='A' LIMIT 1").fetchone()[0]
 station=db.execute("SELECT id FROM stations WHERE status='A' LIMIT 1").fetchone()[0]
 def payload(s):
  p={**s,'version':s['version'],'items':[]}
  for key in ['truck_amount','commission','labour_bonus','munshi_bonus']:p[key]=str(s[key]/100)
  for row in s['items']:
   line=dict(row)
   for key in ['bilty_amount','godown','loading','suzuki','rent','local_charge','advance']:line[key]=str(row[key]/100)
   p['items'].append(line)
  return p
 for kind in ['incoming','booking']:
  new={'kind':kind,'dated':'2026-11-02','station_id':station,'truck':'EDIT-TEST','labour_bonus':'12.34','munshi_bonus':'5.67','items':[{'account_id':account,'bilty':'EDIT-1','qty':1,'bilty_amount':'100','advance':'200'}]}
  created=call('save_shipment',new,status=201);s=call('shipment',params={'id':created['id']});item=s['items'][0]['id']
  if kind=='incoming':call('save_delivery',{'dated':'2026-11-02','receiver':'Edit test','items':[{'id':item,'bilty_received':'0','service_received':'0'}]},status=201);s=call('shipment',params={'id':created['id']})
  p=payload(s);p['truck']='CORRECTED';p['labour_bonus']='15.25';p['munshi_bonus']='7.75';p['items'][0]['detail']='Corrected goods';p['items'][0]['bilty_amount']='150'
  db.execute("UPDATE users SET role='manager' WHERE username='integration-review'");db.commit()
  call('save_shipment',p,status=403)
  # Edit permission is separate from create and from the other goods kind.
  other='booking' if kind=='incoming' else 'incoming'
  db.execute("UPDATE users SET permissions=? WHERE username='integration-review'",(json.dumps([other+'.edit',other+'.view',kind+'.view']),));db.commit()
  call('save_shipment',p,status=403)
  db.execute("UPDATE users SET permissions=? WHERE username='integration-review'",(json.dumps([kind+'.edit',kind+'.view']),));db.commit()
  lookup=call('lookups');assert any(a['id']==account for a in lookup['accounts'])
  call('save_shipment',new,status=403)
  result=call('save_shipment',p,status=201);assert result['reference']==s['reference']
  db.execute("UPDATE users SET permissions='[]' WHERE username='integration-review'");db.commit()
  call('save_shipment',p,status=403)
  db.execute("UPDATE users SET role='super_admin' WHERE username='integration-review'");db.commit()
  call('save_shipment',p,status=409)
  updated=call('shipment',params={'id':s['id']});assert updated['truck']=='CORRECTED' and updated['items'][0]['id']==item and updated['items'][0]['bilty_amount']==15000
  assert (updated['labour_bonus'],updated['munshi_bonus'])==((1525,775) if kind=='incoming' else (0,0))
  assert updated['items'][0]['status']==s['items'][0]['status']
  assert db.execute('SELECT count(*) FROM shipment_revisions WHERE shipment_id=?',(s['id'],)).fetchone()[0]==1
  bad=payload(updated);bad['items'][0]['id']=999999999;call('save_shipment',bad,status=422)
  bad=payload(updated);bad['items']=[{**bad['items'][0],'id':0}];call('save_shipment',bad,status=422)
  if kind=='incoming':
   assert db.execute('SELECT count(*) FROM delivery_items WHERE item_id=?',(item,)).fetchone()[0]==1
   bad=payload(updated);bad['dated']='2026-11-03';call('save_shipment',bad,status=422)
  p=payload(updated);p['items'].append({**new['items'][0],'bilty':'EDIT-2'})
  call('save_shipment',p,status=201)
  assert len(call('shipment',params={'id':s['id']})['items'])==2
 db.close();print('Incoming/booking edits, permission denial, stale edits, row ownership, delivery links, revisions and added bilties passed.')
if __name__=='__main__':main(check)
