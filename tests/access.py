"""Permission boundaries, user lifecycle and profile-image integration checks.
Run: python3 tests/access.py. Uses the disposable server/database in integration.py.
"""
import json, urllib.request, urllib.parse, urllib.error, http.cookiejar, sqlite3, subprocess, base64, os, pathlib
from integration import main


def check_access(base, database, password):
    checks=[]
    class Client:
        def __init__(self):
            self.op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
            self.csrf=self.call('session')['csrf']
        def call(self,action,data=None,params=None,status=200):
            request=urllib.request.Request(base+urllib.parse.urlencode({'action':action,**(params or {})}),data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':getattr(self,'csrf','')})
            try:
                with self.op.open(request) as r:
                    assert r.status==status,(action,r.status,status)
                    return json.load(r)
            except urllib.error.HTTPError as e:
                assert e.code==status,(action,e.code,e.read().decode(),status)
                return json.load(e)
        def login(self,username,pw):
            self.call('login',{'username':username,'password':pw})
            return self.call('session')
    admin=Client();session=admin.login('integration-review',password)
    assert session['profile']['role']=='super_admin'
    root_id=session['profile']['id']
    db=sqlite3.connect(database);db.row_factory=sqlite3.Row
    assert subprocess.run(['php','-r','exit(password_verify(stream_get_contents(STDIN),$argv[1])?0:1);',db.execute('select password from users where id=?',(root_id,)).fetchone()[0]],input=password,text=True).returncode==0
    checks.append('migration preserves original login hash and grants protected super admin')

    root=pathlib.Path(__file__).resolve().parents[1]
    script='require $argv[1];require $argv[2];migrate_access();$_SESSION=["username"=>"integration-review"];echo current_user()["role"];'
    legacy=subprocess.run(['php','-r',script,str(root/'bootstrap.php'),str(root/'access.php')],env=dict(os.environ,APG_STORAGE=str(database.parent)),text=True,capture_output=True,check=True)
    assert legacy.stdout=='super_admin'
    checks.append('idempotent migration and existing username-only session remain compatible')

    directory=admin.call('users');catalog=directory['catalog']
    assert all(k not in session['profile'] for k in ['password','auth_version'])
    assert all('password' not in user for user in directory['rows'])
    checks.append('password hashes and session versions never exposed')
    test_password='Access-test-only-2026'
    def create(username,permissions,role='custom'):
        return admin.call('save_user',{'username':username,'full_name':username.title(),'email':username+'@example.com','role':role,'active':1,'permissions':permissions,'password':test_password},status=201)['id']
    def update(user_id,**overrides):
        user=admin.call('user',params={'id':user_id})
        return admin.call('save_user',{**user,**overrides})
    operation_id=create('operator',['incoming.create'])
    ops=Client();ops_session=ops.login('operator',test_password)
    assert set(ops_session['permissions'])=={'incoming.view','incoming.create'}
    checks.append('create permission includes its required view permission')
    ops.call('shipments',params={'kind':'incoming'})
    booking=db.execute("select id from shipments where kind='booking' limit 1").fetchone()[0]
    ops.call('shipment',params={'id':booking},status=403)
    ops.call('shipments',params={'kind':'booking'},status=403)
    assert all(row['kind']=='incoming' for row in ops.call('bilties')['rows'])
    ops.call('bilties',params={'kind':'booking'},status=403)
    checks.append('shipment and bilty reads cannot cross permitted goods types')
    for action in ['dashboard','users','ledger','financial_report','vouchers','customers','settings','backup','imported_tables','imported_rows','account_groups','save_user','save_voucher','save_delivery','save_customer','save_account','save_station']:
        ops.call(action,data={} if action.startswith('save_') or action=='backup' else None,status=403)
    checks.append('restricted account denied all unassigned read and write endpoints')
    lookup=ops.call('lookups')
    assert lookup['accounts'] and all(a['customer'] and not a['phone'] and not a['address'] for a in lookup['accounts'])
    checks.append('operational lookups exclude financial accounts and unassigned contacts')

    station=next(s['id'] for s in lookup['stations'] if s['status']=='A')
    customer=next(a['id'] for a in lookup['accounts'] if a['status']=='A')
    arrival={'kind':'incoming','dated':'2026-11-01','station_id':station,'truck':'ROLE-TEST','items':[{'account_id':customer,'bilty':'ACCESS-TEST','qty':1,'party_to':'Access test recipient','bilty_amount':'1'}]}
    arrival_id=ops.call('save_shipment',arrival,status=201)['id']
    ops.call('save_shipment',{**arrival,'kind':'booking'},status=403)
    checks.append('restricted operator can create assigned incoming goods but cannot create bookings')
    delivery_id=create('delivery-clerk',['deliveries.create'])
    clerk=Client();clerk.login('delivery-clerk',test_password)
    item=clerk.call('shipment',params={'id':arrival_id})['items'][0]
    clerk.call('save_delivery',{'dated':'2026-11-01','receiver':'Access test receiver','items':[{'id':item['id']}]},status=201)
    clerk.call('vouchers',status=403)
    checks.append('delivery permission grants required goods views and permits handover without accounting access')

    ops.call('save_profile',{'full_name':'Updated Operator','email':'operator@example.com','phone':'123','job_title':'Goods clerk','bio':'Profile details'})
    assert ops.call('profile')['full_name']=='Updated Operator'
    for key,value in [('role','super_admin'),('permissions',list(catalog)),('id',root_id),('username','integration-review'),('active',1)]:
        ops.call('save_profile',{'full_name':'Escalation attempt',key:value},status=403)
    checks.append('users edit own details but cannot escalate role or target another user')
    # Photo uploads must decode as a raster image and are rewritten to a fixed JPEG.
    image=subprocess.run(['php','-r','$im=imagecreatetruecolor(2,2);imagepng($im);'],capture_output=True,check=True).stdout
    photo='data:image/png;base64,'+base64.b64encode(image).decode()
    result=ops.call('save_profile',{'full_name':'Operator Photo','avatar':photo})
    assert result['avatar'].startswith('data:image/jpeg;base64,')
    jpeg=base64.b64decode(result['avatar'].split(',',1)[1]);assert jpeg[:2]==b'\xff\xd8'
    for invalid in ['data:image/svg+xml;base64,PHN2Zy8+','data:image/png;base64,'+base64.b64encode(b'not an image').decode()]:
        ops.call('save_profile',{'full_name':'Invalid image','avatar':invalid},status=422)
    ops.call('save_profile',{'full_name':'Operator','avatar':''})
    assert ops.call('profile')['avatar']==''
    checks.append('raster photos are re-encoded, removable, and executable/invalid uploads rejected')
    # Revoking permissions takes effect in existing sessions.
    update(operation_id,permissions=[])
    ops.call('shipments',params={'kind':'incoming'},status=403)
    lookup=ops.call('lookups');assert lookup=={'stations':[],'accounts':[],'areas':[],'goods_catalog':{'categories':[],'subcategories':[]}}
    ops.call('goods_catalog',status=403);ops.call('goods_analytics',status=403)
    ops.call('stations',status=403)
    checks.append('permissions revoked immediately and profile-only lookups disclose no business data')
    update(operation_id,active=0)
    assert ops.call('session')['user'] is None
    ops.call('profile',status=401)
    inactive=Client();inactive.call('login',{'username':'operator','password':test_password},status=401)
    checks.append('disabled users lose existing sessions and cannot sign in')
    update(operation_id,active=1)
    ops.login('operator',test_password)
    update(operation_id,password='Reset-test-password-2026')
    assert ops.call('session')['user'] is None
    ops.login('operator','Reset-test-password-2026')
    checks.append('admin password reset invalidates old sessions and permits new password')
    other=Client();other.login('operator','Reset-test-password-2026')
    ops.call('change_password',{'current_password':'wrong','new_password':'Self-change-test-2026'},status=422)
    ops.call('change_password',{'current_password':'Reset-test-password-2026','new_password':'Self-change-test-2026'})
    assert ops.call('session')['user']=='operator'
    assert other.call('session')['user'] is None
    checks.append('self password change requires current password and invalidates other sessions')
    super_user=admin.call('user',params={'id':root_id})
    for overrides in [{'role':'manager'},{'active':0},{'password':'Unwanted-reset-2026'}]:
        admin.call('save_user',{**super_user,'full_name':'Super admin',**overrides},status=403)
    admin.call('save_user',{'username':'fake-super','full_name':'Invalid super','role':'super_admin','active':1,'password':test_password,'permissions':[]},status=422)
    checks.append('original super admin cannot be demoted, deactivated, reset or duplicated')
    user=admin.call('user',params={'id':operation_id});update(operation_id,full_name='New details')
    admin.call('save_user',user,status=409)
    admin.call('save_user',{'username':'operator','full_name':'Duplicate','role':'custom','active':1,'password':test_password,'permissions':[]},status=422)
    admin.call('save_user',{'username':'bad-perms','full_name':'Bad permissions','role':'custom','active':1,'password':test_password,'permissions':['users.manage']},status=422)
    checks.append('stale user edits, duplicate usernames and unknown permissions rejected')
    admin.call('save_user',{'username':'long-password','full_name':'Too long','role':'custom','active':1,'password':'x'*73,'permissions':[]},status=422)
    checks.append('new passwords reject bcrypt truncation lengths')

    accounts_id=create('accountant',['reports.view','vouchers.create'],'accountant')
    finance=Client();finance.login('accountant',test_password)
    finance.call('financial_report',params={'report':'trial','search':'1-116-252'})
    finance.call('ledger',params={'account_id':'1-116-252'})
    finance.call('shipments',status=403)
    finance.call('users',status=403)
    checks.append('accountant can read financial data without goods or user administration access')
    assert db.execute("select count(*) from audit where entity='user'").fetchone()[0]>=10
    checks.append('user, permission, profile and password changes audited')
    db.close()
    print(json.dumps({'passed':len(checks),'checks':checks},indent=2))

if __name__=='__main__':
    main(check_access)
