"""Build a data-inclusive PHP upload bundle from a consistent database snapshot."""
from pathlib import Path
import datetime,hashlib,json,shutil,sqlite3,tempfile,zipfile
B=Path(__file__).resolve().parent
OUT=B/'releases';OUT.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='apg-package-') as tmp:
 root=Path(tmp);public=root/'public_html';public.mkdir();store=root/'storage';store.mkdir()
 for f in (B/'public').iterdir():
  if f.is_file():shutil.copy2(f,public/f.name)
 for name in ['bootstrap.php','access.php','backups.php','goods.php','delivery_cash.php','delivery_create.php','delivery_unified.php','operator_cash.php','wasooli.php']:
  shutil.copy2(B/name,root/name)
 shutil.copy2(B/'storage/.htaccess',store/'.htaccess')
 source=sqlite3.connect('file:'+str(B/'storage/app.sqlite')+'?mode=ro',uri=True)
 target=sqlite3.connect(store/'app.sqlite');source.backup(target)
 tables=target.execute("SELECT name FROM sqlite_master WHERE type='table' AND name GLOB 'legacy_*'").fetchall()
 assert len(tables)==21
 assert sum(target.execute('SELECT count(*) FROM "'+t[0]+'"').fetchone()[0] for t in tables)==1123155
 assert target.execute('SELECT count(*) FROM historical_ledger').fetchone()[0]==705476
 assert target.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
 assert not target.execute('PRAGMA foreign_key_check').fetchall()
 counts={t:target.execute('SELECT count(*) FROM '+t).fetchone()[0] for t in ['accounts','shipments','items','deliveries','vouchers','voucher_lines','users','historical_ledger']}
 target.close();source.close()
 manifest=json.loads((B/'storage/data-manifest.json').read_text());manifest['packaged_at_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat();manifest['packaged_database_sha256']=hashlib.file_digest(open(store/'app.sqlite','rb'),'sha256').hexdigest();manifest['packaged_counts']=counts
 (store/'data-manifest.json').write_text(json.dumps(manifest,indent=2))
 (root/'UPLOAD-INSTRUCTIONS.txt').write_text('''APG — Data-inclusive upload package

This package contains the working PHP app, your existing administrator login (hashed password), current app records, all 21 recovered Oracle tables and 705,476 historical ledger entries in ONE database: storage/app.sqlite.

LAYOUT (preserve these relative paths):
  public_html/index.php, api.php, app.js, style.css, .htaccess
  bootstrap.php, access.php
  storage/app.sqlite, data-manifest.json, .htaccess

Place public_html contents in the website document root. Place bootstrap.php and storage beside that root, one directory ABOVE it. Only public_html is public. Do not put storage or the database inside public_html. If the host uses a different web-root name, the API's ../bootstrap.php path must still reach bootstrap.php. APG_STORAGE can override the private storage directory.

The PHP process needs read/write access to private storage and app.sqlite. PHP 8.2+, PDO SQLite, mbstring and sessions are required. Use HTTPS. Confirm your actual hosting plan supports these requirements before deployment. No viewer folder, Oracle installation, RAR file, node_modules, migration script or separate legacy.sqlite is needed at runtime.

Verify after upload: sign in using the existing app login; open Ledger a/c Detail, select Ababeel Drug (1-116-252), and use Full history. Expect 68 entries, from 3 November 2017 through 26 January 2020. Both period debit and credit total Rs 23,370.00. Settings > Browse imported backup exposes all 21 original tables; VRD has 705,476 rows.

On a FRESH deployment, upload storage/app.sqlite from this package. On LATER CODE UPDATES, do not overwrite a live database with an older package; that would discard transactions entered on the live site. Use the latest consistent database backup or a controlled migration. Keep a backup of the current live database first.

This package was verified locally. Upload and Hostinger runtime have not been tested. Financial posting rules, balance reconciliation, user roles and other review-version limitations in the app still apply. This data fix does not certify the system for live accounting.
''')
 zip_path=OUT/'APG-upload-2026-11-01.zip'
 with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for f in sorted(root.rglob('*')):
   if f.is_file():z.write(f,f.relative_to(root))
 (OUT/'APG-upload-manifest.json').write_text(json.dumps(manifest,indent=2))
 print('Created',zip_path,flush=True);print('Database included:',counts,flush=True);print('ZIP bytes:',zip_path.stat().st_size,flush=True)
