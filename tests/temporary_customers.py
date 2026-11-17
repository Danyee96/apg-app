"""Integration checks against an isolated copy of the workspace database."""
import http.cookiejar,json,sqlite3,urllib.parse,urllib.request,urllib.error,secrets
from integration import main

def check(base, database, password):
    opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def api(action,data=None,**params):
        headers={'Content-Type':'application/json'}
        if data is not None:headers['X-CSRF-Token']=csrf
        req=urllib.request.Request(base+urllib.parse.urlencode({'action':action,**params}),data=json.dumps(data).encode() if data is not None else None,headers=headers)
        with opener.open(req) as response:return json.load(response)
    csrf=api('session')['csrf']
    api('login',{'username':'integration-review','password':password})
    name='TEST TEMP '+secrets.token_hex(6)
    account=api('incoming_customer_create',{'name':name,'mode':'temporary'})['id']
    assert any(r['id']==account for r in api('temporary_customers',search=name)['rows'])
    assert not any(r['id']==account for r in api('customers',search=name)['rows'])
    try:api('incoming_customer_create',{'name':name.lower(),'mode':'temporary'});assert False
    except urllib.error.HTTPError as e:assert e.code==409
    db=sqlite3.connect(database)
    shipment=db.execute("INSERT INTO shipments(kind,reference,dated) VALUES('incoming','TEST TEMP','2026-11-17')").lastrowid
    item=db.execute("INSERT INTO items(shipment_id,account_id,bilty,qty) VALUES(?,?,?,?)",(shipment,account,'TEMP',4)).lastrowid;db.commit()
    row=api('temporary_customers',search=name)['rows'][0];assert (row['bilties'],row['quantity'])==(1,4)
    assert api('temporary_customer_goods',id=account)['rows'][0]['id']==item
    api('promote_temporary_customer',{'id':account,'version':row['version'],'area':'Test area','mobile':'03001234567'})
    assert api('customers',search=name)['rows'][0]['id']==account
    assert not api('temporary_customers',search=name)['rows']
    assert db.execute('SELECT account_id FROM items WHERE id=?',(item,)).fetchone()[0]==account
    try:api('promote_temporary_customer',{'id':account,'version':row['version'],'area':'Test area','mobile':'03001234567'});assert False
    except urllib.error.HTTPError as e:assert e.code==409
    full=api('incoming_customer_create',{'name':name+' full','mode':'full','area':'Test area','mobile':'03001234567'})['id']
    assert api('customers',search=name+' full')['rows'][0]['id']==full
    db.execute("INSERT INTO users(username,password,role,permissions,active) SELECT 'temp-test-munshi',password,'operations',?,1 FROM users WHERE username='integration-review'",(json.dumps(['incoming.view','incoming.create','customers.manage']),));db.commit()
    operator=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def op(action,data=None,**params):
        headers={'Content-Type':'application/json'}
        if data is not None:headers['X-CSRF-Token']=opcsrf
        req=urllib.request.Request(base+urllib.parse.urlencode({'action':action,**params}),data=json.dumps(data).encode() if data is not None else None,headers=headers)
        with operator.open(req) as response:return json.load(response)
    opcsrf=op('session')['csrf'];op('login',{'username':'temp-test-munshi','password':password})
    opsid=op('incoming_customer_create',{'name':name+' munshi','mode':'temporary'})['id']
    opsrow=op('temporary_customers',search=name+' munshi')['rows'][0]
    try:op('promote_temporary_customer',{'id':opsid,'version':opsrow['version'],'area':'Area','mobile':'03001234567'});assert False
    except urllib.error.HTTPError as e:assert e.code==403
    try:op('save_customer',{'id':opsid,'name':name+' munshi','version':opsrow['version'],'group_code':'116'});assert False
    except urllib.error.HTTPError as e:assert e.code in (403,422)
    opfull=op('incoming_customer_create',{'name':name+' munshi full','mode':'full','area':'Area','mobile':'03001234567'})['id']
    assert db.execute('SELECT temporary FROM accounts WHERE id=?',(opfull,)).fetchone()[0]==0
    print('Temporary and full creation, permission checks, goods history and conversion passed.')
    db.close()
if __name__=='__main__':main(check)
