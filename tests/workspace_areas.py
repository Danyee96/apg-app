"""Exercise area management using a disposable database."""
import http.cookiejar,json,sqlite3,urllib.parse,urllib.request,urllib.error,secrets
from integration import main

def check(base,database,password):
 def client():
  opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
  token=None
  def call(action,data=None,**params):
   headers={'Content-Type':'application/json'}
   if data is not None:headers['X-CSRF-Token']=token
   request=urllib.request.Request(base+urllib.parse.urlencode({'action':action,**params}),data=json.dumps(data).encode() if data is not None else None,headers=headers)
   with opener.open(request) as response:return json.load(response)
  token=call('session')['csrf'];return call
 admin=client();admin('login',{'username':'integration-review','password':password});db=sqlite3.connect(database)
 old=db.execute("SELECT TRIM(AREANAME) FROM legacy_AREAS WHERE TRIM(COALESCE(AREANAME,''))<>'' LIMIT 1").fetchone()[0]
 assert any(a['area'].lower()==old.lower() for a in admin('workspace_areas'))
 name='Test area '+secrets.token_hex(5);new=name+' renamed';admin('save_workspace_area',{'name':name});assert any(a['area']==name for a in admin('lookups')['areas'])
 customer=admin('save_customer',{'name':'Area regression '+name,'group_code':'116','area':name})['id'];version=admin('customer',id=customer)['version']
 try:admin('save_workspace_area',{'name':name.upper()});assert False
 except urllib.error.HTTPError as e:assert e.code==409
 admin('save_workspace_area',{'original':name,'name':new})
 updated=admin('customer',id=customer);assert updated['area']==new and updated['version']==version+1
 assert any(r['id']==customer for r in admin('wasooli_customers',area=new)['rows'])
 assert any(a['area']==new for a in admin('lookups')['areas']) and not any(a['area']==name for a in admin('lookups')['areas'])
 assert db.execute('SELECT AREANAME FROM legacy_AREAS WHERE TRIM(AREANAME)=? LIMIT 1',(old,)).fetchone()
 try:admin('save_workspace_area',{'original':name,'name':'stale'});assert False
 except urllib.error.HTTPError as e:assert e.code==409
 db.execute("INSERT INTO users(username,password,role,permissions,active) SELECT 'area-test-viewer',password,'custom',?,1 FROM users WHERE username='integration-review'",(json.dumps(['settings.view']),));db.commit()
 viewer=client();viewer('login',{'username':'area-test-viewer','password':password});assert viewer('workspace_areas')
 try:viewer('save_workspace_area',{'name':'Unauthorized'});assert False
 except urllib.error.HTTPError as e:assert e.code==403
 print('PASS: legacy areas, add, duplicate and stale checks, customer rename and permissions')
 db.close()
if __name__=='__main__':main(check)
