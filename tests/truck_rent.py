"""Incoming truck balances, filters, pagination and permissions."""
import datetime,http.cookiejar,json,sqlite3,urllib.error,urllib.parse,urllib.request
from zoneinfo import ZoneInfo
from integration import main

def check(base,database,password):
 class Client:
  def __init__(self):
   self.op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.token='';self.token=self.call('session')['csrf']
  def call(self,action,data=None,params=None,status=200):
   req=urllib.request.Request(base+urllib.parse.urlencode({'action':action,**(params or {})}),data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':self.token})
   try:
    with self.op.open(req) as response:
     result=json.load(response);assert response.status==status,(response.status,result);return result
   except urllib.error.HTTPError as err:
    result=json.load(err);assert err.code==status,(err.code,result,status);return result
 admin=Client();admin.call('login',{'username':'integration-review','password':password});admin.call('save_station',{'name':'Truck Test Station'})
 db=sqlite3.connect(database);station=db.execute("SELECT id FROM stations WHERE name='Truck Test Station' ORDER BY id DESC LIMIT 1").fetchone()[0];db.close()
 customer=admin.call('save_customer',{'name':'Truck rent customer','group_code':'116'})['id'];today=datetime.datetime.now(ZoneInfo('Asia/Karachi')).date();old=(today-datetime.timedelta(days=1)).isoformat();today=today.isoformat()
 def save(number,dated,amount,truck,driver):
  return admin.call('save_shipment',{'kind':'incoming','dated':dated,'station_id':station,'truck':truck,'driver':driver,'truck_amount':amount,'labour_bonus':'50','munshi_bonus':'25','items':[{'account_id':customer,'bilty':number,'qty':1,'bilty_amount':'1000','godown':'500','advance':'100','service_advance':'30'}]},status=201)['id']
 first=save('TRUCK-1',today,'300','ABC-100','Driver Unique');second=save('TRUCK-2',today,'1600','ABC-200','Driver Two');save('TRUCK-3',old,'700','ABC-300','Driver Three')
 filters={'kind':'incoming','truck_report':'1','search':'Truck Test Station','from':today,'to':today}
 result=admin.call('shipments',params=filters);assert result['total']==2 and result['truck_total']==75000
 assert {r['id'] for r in result['rows']}=={first,second} and {r['id']:r['truck_rent'] for r in result['rows']}=={first:102500,second:-27500}
 for term,expected in [('ABC-100',first),('Driver Unique',first)]:
  found=admin.call('shipments',params={**filters,'search':term});assert found['total']==1 and found['rows'][0]['id']==expected and found['truck_total']==102500
 all_dates=admin.call('shipments',params={**filters,'from':'','to':''});assert all_dates['total']==3 and all_dates['truck_total']==137500
 regular=admin.call('shipments',params={'kind':'incoming','search':'ABC-100'});assert regular['rows'][0]['total']==150000 and regular['rows'][0]['bilty_amount_total']==100000
 admin.call('shipments',params={**filters,'kind':'booking'},status=422)
 admin.call('save_user',{'username':'truck-viewer','full_name':'Truck viewer','role':'custom','active':1,'permissions':['incoming.view'],'password':'Truck-viewer-2026'},status=201);viewer=Client();viewer.call('login',{'username':'truck-viewer','password':'Truck-viewer-2026'});assert viewer.call('shipments',params=filters)['truck_total']==75000
 admin.call('save_user',{'username':'truck-no-access','full_name':'Truck no access','role':'custom','active':1,'permissions':['booking.view'],'password':'Truck-no-access-2026'},status=201);restricted=Client();restricted.call('login',{'username':'truck-no-access','password':'Truck-no-access-2026'});restricted.call('shipments',params=filters,status=403)
 for n in range(29):save('TRUCK-PAGE-'+str(n),today,'300','PAGE-'+str(n),'Page driver')
 page1=admin.call('shipments',params=filters);page2=admin.call('shipments',params={**filters,'page':1});assert page1['total']==31 and len(page1['rows'])==30 and len(page2['rows'])==1 and page1['truck_total']==page2['truck_total']==3047500
 print('PASS: truck rent includes godown and deducts truck, bonuses and bilty advances, date and station/truck/driver search, signed balances and access checks.')
if __name__=='__main__':main(check)
