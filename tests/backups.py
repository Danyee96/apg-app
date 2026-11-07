"""Backup and restore tests against a disposable SQLite copy. Never restores live data."""
import urllib.request,urllib.parse,urllib.error,http.cookiejar,json,sqlite3,pathlib,gzip,hashlib,subprocess,os
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
 # Verify the entire uncompressed snapshot, including every historical table.
 backup_folder=folder/'backups'
 archive=backup_folder/(manual['id']+'.sqlite.gz')
 raw=gzip.decompress(archive.read_bytes())
 assert manual['format_version']==2 and manual['compression']=='gzip'
 assert len(raw)==manual['database_size'] and hashlib.sha256(raw).hexdigest()==manual['database_sha256']
 assert archive.stat().st_size==manual['size'] and manual['size']<manual['database_size']
 snapshot=folder/'snapshot.sqlite';snapshot.write_bytes(raw)
 def contents(path):
  connection=sqlite3.connect(path)
  result={}
  for (table,) in connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('users','audit') ORDER BY name").fetchall():
   digest=hashlib.sha256()
   for record in connection.execute('SELECT * FROM "'+table.replace('"','""')+'" ORDER BY rowid'):
    digest.update(repr(record).encode())
   result[table]=digest.hexdigest()
  connection.close();return result
 expected=contents(snapshot)
 # Legacy backups still restore and can be converted without changing one byte.
 legacy={**manual,'format_version':1,'id':'manual-20260101T000000Z-abcdef123456','size':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
 for key in ['compression','database_size','database_sha256']:legacy.pop(key,None)
 legacy_path=backup_folder/(legacy['id']+'.sqlite');legacy_path.write_bytes(raw)
 legacy_manifest=backup_folder/(legacy['id']+'.json');legacy_manifest.write_text(json.dumps(legacy))
 env={**os.environ,'APG_STORAGE':str(folder)}
 root=pathlib.Path(__file__).resolve().parents[1]
 # Conversion preserves identity and fully matches the original file.
 subprocess.run(['php',str(root/'bin/compress-backups.php')],env=env,check=True,capture_output=True)
 converted=json.loads(legacy_manifest.read_text())
 assert converted['id']==legacy['id'] and converted['created_at']==legacy['created_at']
 assert not legacy_path.exists() and gzip.decompress((backup_folder/(legacy['id']+'.sqlite.gz')).read_bytes())==raw
 # Keep a legacy entry to exercise the real old-format restore path too.
 (backup_folder/(legacy['id']+'.sqlite.gz')).unlink();legacy_path.write_bytes(raw);legacy_manifest.write_text(json.dumps(legacy))
 # A changed file must never be restored, even if SQLite could still read it.
 automatic_file=folder/'backups'/(auto['backup']['id']+'.sqlite.gz')
 with automatic_file.open('ab') as stream:stream.write(b'tampered')
 restore={'backup_id':auto['backup']['id'],'confirmation':'RESTORE','password':password}
 admin.call('backup_restore',restore,status=422)
 # Even when the archive checksum matches, truncation, CRC damage, trailing
 # bytes and an incorrect decompressed checksum must fail before database replacement.
 auto_manifest=backup_folder/(auto['backup']['id']+'.json')
 original_archive=archive.read_bytes();original_auto=auto['backup']
 before=hashlib.sha256(pathlib.Path(database).read_bytes()).hexdigest()
 variants=[original_archive[:-8],original_archive[:-1]+bytes([original_archive[-1]^1]),original_archive+b'extra',original_archive]
 for index,payload in enumerate(variants):
  automatic_file.write_bytes(payload)
  metadata={**original_auto,'size':len(payload),'sha256':hashlib.sha256(payload).hexdigest()}
  if index==3:metadata['database_sha256']='0'*64
  auto_manifest.write_text(json.dumps(metadata))
  admin.call('backup_restore',restore,status=422)
  assert hashlib.sha256(pathlib.Path(database).read_bytes()).hexdigest()==before
  assert not list(folder.glob('restore-*.sqlite'))
 automatic_file.write_bytes(original_archive);auto_manifest.write_text(json.dumps({**original_auto,'size':len(original_archive),'sha256':hashlib.sha256(original_archive).hexdigest(),'database_size':manual['database_size'],'database_sha256':manual['database_sha256']}))
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
 assert contents(database)==expected, 'Every business table must match the original snapshot'
 safety_file=folder/'safety.sqlite';safety_file.write_bytes(gzip.decompress((backup_folder/(result['safety_backup']+'.sqlite.gz')).read_bytes()))
 safety=sqlite3.connect(safety_file)
 assert safety.execute('SELECT count(*) FROM stations WHERE name=?',('AFTER-BACKUP-REGRESSION',)).fetchone()[0]==1;safety.close()
 assert len(admin.call('backup_list')['rows'])==4
 # Restore an original version-one snapshot with the same safety guarantees.
 legacy_restore=admin.call('backup_restore',{**restore,'backup_id':legacy['id']})
 assert legacy_restore['ok'] and contents(database)==expected
 assert not list(backup_folder.glob('*.partial')) and not list(backup_folder.glob('verify-*.sqlite'))
 print('Verified manual/automatic snapshots, daily idempotency, checksum rejection, password/confirmation, permissions, safety backup, restore integrity and session revocation.')
if __name__=='__main__':main(check)
