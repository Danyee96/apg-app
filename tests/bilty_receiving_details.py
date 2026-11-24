"""Bilty search shows the recorded handover date and receiver without duplicating rows."""
import datetime, http.cookiejar, json, urllib.parse, urllib.request, uuid
from zoneinfo import ZoneInfo
from integration import main

def check(base,database,password):
    op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())); token=''
    def call(action,data=None,**params):
        req=urllib.request.Request(base+urllib.parse.urlencode({'action':action,**params}),data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':token})
        with op.open(req) as response: return json.load(response)
    token=call('session')['csrf'];call('login',{'username':'integration-review','password':password})
    look=call('lookups');station=next(s['id'] for s in look['stations'] if s['status']=='A');date=datetime.datetime.now(ZoneInfo('Asia/Karachi')).date().isoformat()
    customer=call('save_customer',{'name':'Bilty receiving test','group_code':'116'})['id']
    ship=call('save_shipment',{'kind':'incoming','dated':date,'station_id':station,'truck':'RECEIVING-TEST','items':[{'account_id':customer,'bilty':'RECV-TEST-1','qty':1,'bilty_amount':'100'},{'account_id':customer,'bilty':'RECV-TEST-2','qty':1,'bilty_amount':'100'}]})
    items=call('shipment',id=ship['id'])['items'];pending=call('bilties',bilty_exact='RECV-TEST-1')['rows'];assert len(pending)==1 and pending[0]['receiving_date'] is None and pending[0]['receiver_name'] is None
    call('save_unified_delivery',{'request_key':str(uuid.uuid4()),'dated':date,'received_date':date,'receiver':'Test receiver','items':[{'id':items[0]['id'],'discount':'0','loading':'0','suzuki':'0','bilty_received':'0','service_received':'0'}]})
    rows=call('bilties',bilty_exact='RECV-TEST-1')['rows'];assert len(rows)==1 and rows[0]['receiving_date']==date and rows[0]['receiver_name']=='Test receiver',rows
    assert call('bilties',bilty_exact='RECV-TEST-2')['rows'][0]['receiving_date'] is None
    print('PASS: bilty search returns delivery date and receiver, and leaves pending bilties blank.')
if __name__=='__main__':main(check)
