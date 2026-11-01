"""Verify legacy print values against recovered Oracle rows, without changing them.
Run: python3 tests/legacy_print.py
"""
import json,sqlite3,urllib.request,urllib.parse,http.cookiejar
from decimal import Decimal,ROUND_HALF_UP
from integration import main

def check_legacy_print(base,database,password):
    opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def call(action,params=None,data=None):
        url=base+urllib.parse.urlencode({'action':action,**(params or {})})
        req=urllib.request.Request(url,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':token})
        with opener.open(req) as r:return json.load(r)
    token='';token=call('session')['csrf'];call('login',data={'username':'integration-review','password':password})
    db=sqlite3.connect(database);db.row_factory=sqlite3.Row
    def cents(value):return int((Decimal(str(value or 0))*100).quantize(Decimal('1'),rounding=ROUND_HALF_UP))
    candidates=[r[0] for r in db.execute("select id from deliveries where legacy_id is not null order by dated desc,id desc limit 3")]
    candidates += [r[0] for r in db.execute('select distinct di.delivery_id from delivery_items di join items i on i.id=di.item_id join legacy_IND l on l.INDNO=di.legacy_id where coalesce(l.LOADING_AMT,0)*100<>i.loading or coalesce(l.SUZUKI_KIRAYA,0)*100<>i.suzuki limit 3')]
    candidates += [r[0] for r in db.execute('select distinct di.delivery_id from delivery_items di join legacy_IND l on l.INDNO=di.legacy_id where l.DISC_AMT>0 limit 2')]
    mapping={'bilty_amount':'BILLTY_AMT','godown':'GODOWN_CHG','loading':'LOADING_AMT','suzuki':'SUZUKI_KIRAYA','bilty_received':'REC_BAMT','service_received':'REC_SAMT','discount':'DISC_AMT'}
    verified=0;has_difference=False
    for delivery_id in dict.fromkeys(candidates):
        result=call('delivery',{'id':delivery_id})
        header=db.execute('select * from legacy_INH where INHNO=?',(result['legacy_id'],)).fetchone()
        assert result['print_header']['reference']==header['DOCNO']
        assert result['print_header']['receiver']==header['REC_NAME1']
        assert result['print_header']['received_date']==header['REC_DATE1']
        expected=db.execute('select l.* from legacy_IND l join legacy_WORKING w on l.PLCODE=w.WLCODE and l.PMCODE=w.WMCODE and l.PWCODE=w.WCODE where l.INHNO=? order by l.INDNO',(result['legacy_id'],)).fetchall()
        assert len(expected)==len(result['print_items'])
        for original,printed in zip(expected,result['print_items']):
            assert printed['source_id']==original['INDNO']
            for key,column in mapping.items():assert printed[key]==cents(original[column]),(key,delivery_id)
            assert printed['qty']==original['QTY']
            assert printed['party_to']==original['PARTY_TO']
            verified+=1
        for item in result['items']:
            for printed in result['print_items']:
                if item['bilty']==printed['bilty'] and (item['loading']!=printed['loading'] or item['suzuki']!=printed['suzuki']):has_difference=True
    assert has_difference,'The regression cases must include differing arrival and delivery charges.'
    zero_total=db.execute('select count(*) from items where total=0 and bilty_amount+godown>0').fetchone()[0]
    assert zero_total>0
    print(json.dumps({'legacy_receipts_checked':len(set(candidates)),'original_lines_checked':verified,'verified':['original document and receiver fields','R150/R157 delivery snapshots rather than incoming charges','all original charge/cash/discount fields in integer paisa','null original TOTAL is not a valid printed charge total']},indent=2))
    db.close()

if __name__=='__main__':main(check_legacy_print)
