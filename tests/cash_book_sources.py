"""Compare the cash-book sources with the recovered backup and new vouchers."""
import http.cookiejar,json,sqlite3,urllib.parse,urllib.request
from integration import main

def check(base,database,password):
 jar=http.cookiejar.CookieJar();op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
 def api(action,params=None,data=None,token=None):
  url=base+urllib.parse.urlencode(dict(action=action,**(params or {})))
  headers={'Content-Type':'application/json'}
  if token:headers['X-CSRF-Token']=token
  with op.open(urllib.request.Request(url,data=json.dumps(data).encode() if data is not None else None,headers=headers)) as r:return json.load(r)
 session=api('session');api('login',data={'username':'integration-review','password':password},token=session['csrf'])
 customer=api('save_customer',data={'name':'Cash Book Source Test','group_code':'116'},token=session['csrf'])['id']
 api('save_voucher',data={'kind':'RV','dated':'2026-11-01','memo':'Source test receipt','lines':[{'account_id':'1-101-001','debit':'12.34'},{'account_id':customer,'credit':'12.34'}]},token=session['csrf'])
 params={'account_id':'1-101-001','from':'2017-10-28','to':'2026-11-12'}
 original=api('ledger',dict(params,source='original'));new=api('ledger',dict(params,source='new'));combined=api('ledger',params)
 db=sqlite3.connect(database)
 raw=db.execute("SELECT count(*),CAST(round(sum(coalesce(VDDR,0))*100) AS INTEGER),CAST(round(sum(coalesce(VDCR,0))*100) AS INTEGER) FROM legacy_VRD WHERE VDLCODE='1' AND VDMCODE='101' AND VDWCODE='001' AND VDDATE>=? AND VDDATE<?",('2017-10-28','2026-11-13')).fetchone()
 assert (original['total'],original['debit'],original['credit'])==raw,((original['total'],original['debit'],original['credit']),raw)
 assert original['backup_date']=='2026-10-31' and original['source']=='original'
 assert new['source']=='new' and new['total']>=1
 assert combined['total']==original['total']+new['total']
 assert combined['debit']==original['debit']+new['debit'] and combined['credit']==original['credit']+new['credit']
 assert all(row['source']=='Original' for row in original['rows']) and all(row['source']=='New app' for row in new['rows'])
 print('PASS: original backup matches raw legacy transactions; new vouchers stay separate')
 db.close()

if __name__=='__main__':main(check)
