"""Run real HTTP integration checks against a disposable copy of the APG database.

Requires PHP and the private storage/app.sqlite. The source database is read-only.
Run: python3 tests/integration.py
"""
import os, pathlib, secrets, socket, subprocess, tempfile, time
import urllib.request,urllib.parse,http.cookiejar,json,sqlite3

def check(base_url, database, password):
    base=base_url;jar=http.cookiejar.CookieJar();op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar));checks=[]
    def api(action,params=None,data=None,token=None):
     url=base+urllib.parse.urlencode(dict(action=action,**(params or {})));headers={'Content-Type':'application/json'}
     if token:headers['X-CSRF-Token']=token
     req=urllib.request.Request(url,data=json.dumps(data).encode() if data is not None else None,headers=headers)
     with op.open(req) as r:return json.load(r)
    s=api('session');api('login',data={'username':'integration-review','password':password},token=s['csrf'])
    db=sqlite3.connect(database);db.row_factory=sqlite3.Row
    # Exercise writes only on the temporary database, then verify their ledger effects.
    customer=api('save_customer',data={'name':'Integration Receiver','group_code':'116'},token=s['csrf'])['id']
    lookups=api('lookups');cash=next(a['id'] for a in lookups['accounts'] if a['status']=='A' and a['id'].startswith('1-101-'))
    v=api('save_voucher',data={'kind':'RV','dated':'2026-11-01','memo':'Integration receipt','lines':[{'account_id':cash,'debit':'123.45'},{'account_id':customer,'credit':'123.45'}]},token=s['csrf'])
    l=api('ledger',{'account_id':customer,'from':'2017-10-28','to':'2026-11-01'})
    assert (l['total'],l['credit'],l['closing'])==(1,12345,-12345)
    checks.append('posted receipt reaches ledger in integer paisa')
    period={'from':'2017-10-28','to':'2026-11-01'}
    for key in ['trial','balances','daybook','journal','vouchers']:
     d=api('financial_report',dict(report=key,**period));assert len(d['rows'])<=30
     assert d['total']==d['stats']['total'];checks.append(key+' full period')
     api('financial_report',dict(report=key,search='Ababeel',**period));checks.append(key+' search')
     api('financial_report',dict(report=key,search='%_',**period));checks.append(key+' literal wildcard search')
     if d['total']>30:
      last=api('financial_report',dict(report=key,page=999999,**period));assert last['page']==(d['total']-1)//30;checks.append(key+' page clamping')
     if key=='balances':assert all(r['customer']==1 for r in d['rows'])
    # Compare report balance with the existing ledger calculation, including a nonzero prior period.
    for start,end in [('2017-10-28','2026-11-01'),('2019-01-01','2019-12-31')]:
     d=api('financial_report',dict(report='trial',search='1-116-252',**{'from':start,'to':end}));assert len(d['rows'])==1
     l=api('ledger',dict(account_id='1-116-252',**{'from':start,'to':end}));r=d['rows'][0]
     for k in ['opening','debit','credit','closing']:assert r[k]==l[k],(k,r[k],l[k])
     checks.append('trial equals individual ledger '+start)
    # Independent totals for daybook, including incomplete account codes.
    r=db.execute("select count(*) total,sum(debit) debit,sum(credit) credit from (select dated,debit,credit from historical_ledger union all select v.dated,l.debit,l.credit from voucher_lines l join vouchers v on v.id=l.voucher_id) where dated>=? and dated<?",('2017-10-28','2026-11-02')).fetchone()
    d=api('financial_report',dict(report='daybook',**period));assert all(d['stats'][k]==r[k] for k in ['total','debit','credit']);checks.append('daybook independent SQL totals')
    # Explicitly verify access control, CSRF and invalid requests over HTTP.
    for params in [dict(report='invalid'),dict(report='trial',**{'from':'2026-11-01','to':'2017-10-28'}),dict(report='trial',**{'from':'bad'})]:
     try:api('financial_report',params);raise AssertionError('Expected rejection')
     except urllib.error.HTTPError as e:assert e.code==422
    checks.append('invalid reports and dates rejected')
    try:urllib.request.urlopen(base+'action=financial_report&report=trial');raise AssertionError('Expected auth rejection')
    except urllib.error.HTTPError as e:assert e.code==401
    checks.append('reports require authentication')
    try:api('save_station',data={'name':'forbidden'},token='bad');raise AssertionError('Expected CSRF rejection')
    except urllib.error.HTTPError as e:assert e.code==403
    checks.append('CSRF enforced')
    trend=api('dashboard',{'date':'2026-10-31'})['trend'];assert len(trend)==7
    for t in trend:
     for kind in ['incoming','booking']:
      expected=db.execute('select count(*) from shipments where kind=? and dated=?',(kind,t['dated'])).fetchone()[0];assert t[kind]==expected
    checks.append('seven-day chart equals database')
    # Operational lists should reject reversed ranges and clamp out-of-range pages.
    try:
        api('shipments',{'from':'2026-11-01','to':'2017-10-28'})
        raise AssertionError('Expected invalid range rejection')
    except urllib.error.HTTPError as e:
        assert e.code==422
    d=api('customers',{'page':999999})
    assert d['page']==max(0,(d['total']-1)//30)
    checks.append('operational date validation and pagination')
    db.close()
    # Simulate an incomplete deployment without touching the original database.
    hidden=database.with_suffix('.offline')
    database.rename(hidden)
    try:
        try:
            api('session')
            raise AssertionError('Expected unavailable database response')
        except urllib.error.HTTPError as e:
            assert e.code==503
            message=json.load(e)['error']
            assert 'database' in message and str(database) not in message
    finally:
        hidden.rename(database)
    checks.append('missing database returns actionable 503 without paths')
    print(json.dumps({'passed':len(checks),'checks':checks},indent=2))


def main(checker=check):
    root=pathlib.Path(__file__).resolve().parents[1]
    source=root/'storage/app.sqlite'
    if not source.is_file():
        raise SystemExit('Restore your private storage/app.sqlite before running integration checks.')
    with tempfile.TemporaryDirectory(prefix='apg-integration-') as directory:
        database=pathlib.Path(directory)/'app.sqlite'
        original=sqlite3.connect('file:'+str(source)+'?mode=ro',uri=True)
        target=sqlite3.connect(database)
        original.backup(target)
        original.close()
        password=secrets.token_urlsafe(24)
        hashed=subprocess.run(['php','-r','echo password_hash(stream_get_contents(STDIN), PASSWORD_DEFAULT);'],input=password,text=True,capture_output=True,check=True).stdout
        target.execute('DELETE FROM users')
        target.execute("DELETE FROM meta WHERE key='user_access_version'")
        target.execute('INSERT INTO users(username,password) VALUES(?,?)',('integration-review',hashed))
        target.commit();target.close()
        with socket.socket() as listener:
            listener.bind(('127.0.0.1',0));port=listener.getsockname()[1]
        base_url=f'http://127.0.0.1:{port}/api.php?'
        with open(pathlib.Path(directory)/'server.log','w+') as log:
            process=subprocess.Popen(['php','-S',f'127.0.0.1:{port}','-t',str(root/'public')],cwd=root,env=dict(os.environ,APG_STORAGE=directory),stdout=log,stderr=log)
            try:
                for attempt in range(100):
                    if process.poll() is not None:
                        raise RuntimeError('Temporary PHP server failed to start.')
                    try:
                        with urllib.request.urlopen(base_url+'action=session',timeout=1):break
                    except (OSError,urllib.error.URLError):time.sleep(.1)
                else:raise RuntimeError('Temporary PHP server did not become ready.')
                checker(base_url,database,password)
                verify=sqlite3.connect(database)
                assert verify.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
                assert not verify.execute('PRAGMA foreign_key_check').fetchall()
                verify.close()
            finally:
                process.terminate()
                try:process.wait(timeout=5)
                except subprocess.TimeoutExpired:process.kill();process.wait()

if __name__=='__main__':
    main()
