"""Backup and restore tests against a disposable SQLite copy. Never restores live data."""
import urllib.request,urllib.parse,urllib.error,http.cookiejar,json,sqlite3,pathlib
from integration import main

def check(base,database,password):
 class Client:
  def __init__(self):self.op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.token='';self.token=self.call('session')['csrf']
  def call(self,action,data=None,status=200,headers=None):
   req=urllib.request.Request(base+urllib.parse.urlencode({'action':action}),data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':self.token,**(headers or {})})
   try:
    with self.op.open(req,timeout=180) as r:
     assert r.status==status,(action,r.status,status)
     return json.load(r)
   except urllib.error.HTTPError as e:
    body=json.load(e);assert e.code==status,(action,e.code,body,status);return body
 admin=Client();admin.call('login',{'username':'integration-review','password':password})
 other=Client();other.call('login',{'username':'integration-review','password':password})
 db=sqlite3.connect(database);db.row_factory=sqlite3.Row
 folder=pathlib.Path(database).parent
 (folder/'backup-schedule.json').write_text(json.dumps({'token':'regression-only-secret','enabled':True,'driver':'test'}))
 admin.call('scheduled_backup',{},status=403)
 auto=admin.call('scheduled_backup',{},headers={'X-APG-Backup-Token':'regression-only-secret'})
 repeat=admin.call('scheduled_backup',{},headers={'X-APG-Backup-Token':'regression-only-secret'})
 assert auto['created'] and not repeat['created'] and repeat['backup']['id']==auto['backup']['id']
 manual=admin.call('backup',{})['backup'];assert manual['kind']=='manual' and manual['verified']
 listing=admin.call('backup_list');assert {r['kind'] for r in listing['rows']}=={'manual','automatic'}
 assert 'token' not in json.dumps(listing)
 # A changed file must never be restored, even if SQLite could still read it.
 automatic_file=folder/'backups'/(auto['backup']['id']+'.sqlite')
 with automatic_file.open('ab') as stream:stream.write(b'tampered')
 restore={'backup_id':auto['backup']['id'],'confirmation':'RESTORE','password':password}
 admin.call('backup_restore',restore,status=422)
 restore['backup_id']=manual['id']
 admin.call('backup_restore',{**restore,'password':'wrong'},status=422)
 admin.call('backup_restore',{**restore,'confirmation':'no'},status=422)
 admin.call('backup_restore',{**restore,'backup_id':'../../app.sqlite'},status=422)
 # Restrict restore to the super admin even if a user can create snapshots.
 uid=admin.call('save_user',{'username':'backup-clerk','full_name':'Backup Clerk','role':'custom','active':1,'permissions':['backups.create'],'password':'Backup-clerk-only-2026'},status=201)['id']
 clerk=Client();clerk.call('login',{'username':'backup-clerk','password':'Backup-clerk-only-2026'})
 clerk.call('backup_list');clerk.call('backup_restore',restore,status=403)
 # This new station must disappear when restoring the earlier snapshot.
 admin.call('save_station',{'name':'AFTER-BACKUP-REGRESSION'})
 db.close() # no outside SQLite connections when the application replaces the file
 result=admin.call('backup_restore',restore);assert result['ok'] and result['safety_backup']
 signed_out=admin.call('session');assert signed_out['user'] is None;admin.token=signed_out['csrf']
 assert other.call('session')['user'] is None
 admin.call('login',{'username':'integration-review','password':password})
 current=sqlite3.connect(database)
 assert current.execute('SELECT count(*) FROM stations WHERE name=?',('AFTER-BACKUP-REGRESSION',)).fetchone()[0]==0
 assert current.execute('SELECT count(*) FROM audit WHERE action=?',('restored',)).fetchone()[0]>=1
 assert current.execute('PRAGMA integrity_check').fetchone()[0]=='ok';current.close()
 safety=sqlite3.connect(folder/'backups'/(result['safety_backup']+'.sqlite'))
 assert safety.execute('SELECT count(*) FROM stations WHERE name=?',('AFTER-BACKUP-REGRESSION',)).fetchone()[0]==1;safety.close()
 assert len(admin.call('backup_list')['rows'])==3
 print('Verified manual/automatic snapshots, daily idempotency, checksum rejection, password/confirmation, permissions, safety backup, restore integrity and session revocation.')
if __name__=='__main__':main(check)
