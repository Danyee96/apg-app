"""Check optimized delivery pagination/filtering against independent database totals."""
import json, sqlite3, urllib.request, urllib.parse, http.cookiejar, time
from integration import main

def check(base,database,password):
    client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def api(action,params=None,data=None,token=''):
        request=urllib.request.Request(base+urllib.parse.urlencode({'action':action,**(params or {})}),data=json.dumps(data).encode() if data else None,headers={'Content-Type':'application/json','X-CSRF-Token':token})
        with client.open(request) as response:return json.load(response)
    token=api('session')['csrf'];api('login',data={'username':'integration-review','password':password},token=token)
    db=sqlite3.connect(database);db.row_factory=sqlite3.Row
    documents=[dict(row) for row in db.execute('''SELECT d.id,d.dated,SUM(l.bilty_received+l.service_received) collected,
        SUM(MAX(0,l.bilty_due-l.bilty_received)+CASE WHEN l.legacy_service_received<>0 THEN MAX(0,l.service_due-l.service_received) ELSE MAX(0,l.loading-l.loading_received)+MAX(0,l.suzuki-l.suzuki_received) END) outstanding
        FROM deliveries d JOIN delivery_unified_lines l ON l.delivery_id=d.id GROUP BY d.id''')]
    cases=[{}, {'page':2},{'page':999999},{'sort':'oldest'}, {'from':'2026-11-09','to':'2026-11-09'}, {'from':'2026-11-01','to':'2026-11-08','page':1}, {'payment_status':'fully_paid'}, {'payment_status':'pending_payment','from':'2026-11-01'}, {'payment_status':'partially_paid','sort':'balance_high'}, {'sort':'received_high','min_outstanding':'500'}, {'from':'2099-01-01'}]
    timings=[]
    for params in cases:
        rows=[d for d in documents if (not params.get('from') or d['dated']>=params['from']) and (not params.get('to') or d['dated']<=params['to'])]
        status=params.get('payment_status')
        if status:rows=[d for d in rows if {'fully_paid':d['outstanding']==0,'partially_paid':d['outstanding']>0 and d['collected']>0,'pending_payment':d['outstanding']>0 and d['collected']==0}[status]]
        if params.get('min_outstanding'):rows=[d for d in rows if d['outstanding']>=int(params['min_outstanding'])*100]
        sort=params.get('sort');rows.sort(key=lambda d:((d['outstanding'] if sort=='balance_high' else d['collected']),d['dated'],d['id']) if sort in ('balance_high','received_high') else (d['dated'],d['id']),reverse=sort!='oldest')
        started=time.perf_counter();result=api('unified_deliveries',params);timings.append(round((time.perf_counter()-started)*1000))
        page=min(params.get('page',0),max(0,(len(rows)-1)//30));expected=rows[page*30:page*30+30]
        assert result['total']==len(rows) and result['page']==page,(params,result['total'],len(rows))
        assert [row['id'] for row in result['rows']]==[row['id'] for row in expected],params
        assert int(result['stats']['outstanding'])==sum(row['outstanding'] for row in rows),params
        for row in result['rows']:
            preview=[r[0] for r in db.execute('SELECT bilty FROM delivery_unified_lines WHERE delivery_id=? ORDER BY delivery_item_id LIMIT 3',(row['id'],))]
            assert row['bilty_preview']==preview
    db.close();print('PASS: delivery totals, ordering, pagination, empty ranges and batched bilty previews;',len(cases),'cases; request ms:',timings)
if __name__=='__main__':main(check)
