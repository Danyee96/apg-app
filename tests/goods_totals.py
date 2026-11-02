"""Regressions for recovered totals and delivery collection limits.
Run: python3 tests/goods_totals.py. Never writes to the working database.
"""
import urllib.request,urllib.parse,urllib.error,http.cookiejar,json,sqlite3
from integration import main

def check_goods(base,database,password):
    opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def call(action,params=None,data=None,status=200):
        request=urllib.request.Request(base+urllib.parse.urlencode({'action':action,**(params or {})}),data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':token})
        try:
            with opener.open(request) as response:
                assert response.status==status,(action,response.status,status)
                return json.load(response)
        except urllib.error.HTTPError as error:
            assert error.code==status,(action,error.code,error.read().decode(),status)
            return json.load(error)
    token='';token=call('session')['csrf'];call('login',data={'username':'integration-review','password':password})
    db=sqlite3.connect(database);db.row_factory=sqlite3.Row
    item=db.execute("SELECT i.*,s.dated,s.kind FROM items i JOIN shipments s ON s.id=i.shipment_id WHERE s.kind='incoming' AND i.status='pending' AND i.total=0 AND i.bilty_amount+i.godown>i.advance ORDER BY i.id DESC LIMIT 1").fetchone()
    assert item,'Recovery fixture must contain a pending bilty with a missing total.'
    expected=item['bilty_amount']+item['godown']
    shipment=call('shipment',{'id':item['shipment_id']})
    read=next(row for row in shipment['items'] if row['id']==item['id'])
    assert read['total']==expected,('Shipment screen shows a missing stored total instead of original charges',read['total'],expected)
    assert read['stored_total']==0
    listed=call('bilties',{'kind':'incoming','status':'pending','search':item['bilty']})
    read=next(row for row in listed['rows'] if row['id']==item['id'])
    assert read['total']==expected and read['stored_total']==0
    amount=expected-item['advance']
    delivery={'dated':max('2026-11-02',item['dated'][:10]),'receiver':'Recovered total regression','items':[{'id':item['id'],'bilty_received':f'{amount/100:.2f}','discount':'0','service_received':'0'}]}
    excessive={**delivery,'items':[{**delivery['items'][0],'bilty_received':f'{(amount+1)/100:.2f}'}]}
    before=db.execute('SELECT count(*) FROM deliveries').fetchone()[0]
    call('save_delivery',data=excessive,status=422)
    assert db.execute('SELECT count(*) FROM deliveries').fetchone()[0]==before
    # Handover can set charges absent from the arrival record, without dropping limits.
    service_line={**delivery['items'][0],'loading':'200','suzuki':'300','service_received':'500.01'}
    service_delivery={**delivery,'items':[service_line]}
    original_charges=tuple(db.execute('SELECT loading,suzuki FROM items WHERE id=?',(item['id'],)).fetchone())
    call('save_delivery',data=service_delivery,status=422)
    assert tuple(db.execute('SELECT loading,suzuki FROM items WHERE id=?',(item['id'],)).fetchone())==original_charges
    call('save_delivery',data={**delivery,'items':[{**service_line,'loading':'-1'}]},status=422)
    delivery={**delivery,'items':[{**service_line,'service_received':'500'}]}
    created=call('save_delivery',data=delivery,status=201)
    saved=call('delivery',{'id':created['id']})['items'][0]
    assert (saved['loading'],saved['suzuki'],saved['service_received'])==(20000,30000,50000)
    assert db.execute("SELECT count(*) FROM audit WHERE action='delivery_charges' AND entity_id=?",(str(item['id']),)).fetchone()[0]==1
    call('save_delivery',data=delivery,status=409)
    assert db.execute('SELECT total FROM items WHERE id=?',(item['id'],)).fetchone()[0]==0
    assert db.execute('SELECT count(*) FROM vouchers').fetchone()[0]==0
    assert call('delivery',{'id':created['id']})['items'][0]['total']==expected
    # Both kinds of shipment registers must sum the same original component formulas.
    for kind in ['incoming','booking']:
        entries=call('shipments',{'kind':kind})
        for row in entries['rows']:
            formula='bilty_amount+godown' if kind=='incoming' else 'rent+loading+bilty_amount+local_charge'
            total=db.execute('SELECT COALESCE(SUM('+formula+'),0) FROM items WHERE shipment_id=?',(row['id'],)).fetchone()[0]
            assert row['total']==total,(kind,row['id'],row['total'],total)
    db.close()
    print(json.dumps({'checks':['recovered bilty and shipment detail totals','stored original total retained for provenance','valid collection accepted against recovered charges','overpayment and duplicate handover rejected','delivery read agrees with source charges','incoming and booking registers use original total formulas','no stored-total rewrite or automatic voucher posting']},indent=2))

if __name__=='__main__':main(check_goods)
