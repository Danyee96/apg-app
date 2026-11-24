#!/usr/bin/env python3
"""Compare a recovered old-system SQLite export to a prepared APG candidate.

Read-only. Does not create or update financial records. Customer details are not
printed. Usage: python3 bin/audit-recovered-backup.py SOURCE.sqlite CANDIDATE.sqlite
"""
import json,sqlite3,sys
from pathlib import Path

def open_readonly(path):
 return sqlite3.connect(Path(path).resolve().as_uri()+'?mode=ro',uri=True)

def audit(source_path,candidate_path):
 source=open_readonly(source_path);candidate=open_readonly(candidate_path)
 candidate.execute('ATTACH DATABASE ? AS source',(Path(source_path).resolve().as_uri()+'?mode=ro',))
 try:
  tables=[r[0] for r in source.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
  counts={name:source.execute('SELECT count(*) FROM "'+name+'"').fetchone()[0] for name in tables}
  unlinked=candidate.execute("""SELECT count(*),sum(CASE WHEN x.DATED>=date((SELECT max(DATED) FROM source.IND),'-1 year') THEN 1 ELSE 0 END),sum(CASE WHEN x.PLCODE IS NULL OR x.PMCODE IS NULL OR x.PWCODE IS NULL THEN 1 ELSE 0 END) FROM source.IND x LEFT JOIN delivery_items d ON d.legacy_id=x.INDNO WHERE x.INTYPE='GD' AND d.id IS NULL""").fetchone()
  incomplete=source.execute('SELECT count(*) FROM VRD WHERE VDLCODE IS NULL OR VDMCODE IS NULL OR VDWCODE IS NULL').fetchone()[0]
  comparison=candidate.execute("""WITH goods AS (SELECT i.account_id,SUM(MAX(0,COALESCE(l.BILLTY_AMT,0)+COALESCE(l.GODOWN_CHG,0)-COALESCE(l.DISC_AMT,0)-COALESCE(l.REC_BAMT,0)))*100 amount FROM delivery_items d JOIN items i ON i.id=d.item_id JOIN legacy_IND l ON l.INDNO=d.legacy_id GROUP BY i.account_id), ledger AS (SELECT account_id,SUM(debit-credit) amount FROM historical_ledger GROUP BY account_id) SELECT COUNT(*),SUM(CASE WHEN COALESCE(goods.amount,0)<>COALESCE(ledger.amount,0) THEN 1 ELSE 0 END) FROM accounts a LEFT JOIN goods ON goods.account_id=a.id LEFT JOIN ledger ON ledger.account_id=a.id WHERE a.customer=1""").fetchone()
  return {'source_integrity':source.execute('PRAGMA integrity_check').fetchone()[0], 'candidate_integrity':candidate.execute('PRAGMA integrity_check').fetchone()[0], 'candidate_foreign_key_violations':len(candidate.execute('PRAGMA foreign_key_check').fetchall()),'source_table_counts':counts,'source_ledger_date_range':source.execute('SELECT min(VDDATE),max(VDDATE) FROM VRD').fetchone(),'unlinked_delivery_rows':unlinked[0],'unlinked_delivery_rows_last_year':unlinked[1] or 0,'unlinked_delivery_rows_missing_customer_code':unlinked[2] or 0,'ledger_rows_missing_account_code':incomplete,'customers_compared':comparison[0],'customers_goods_and_ledger_disagree':comparison[1] or 0}
 finally:source.close();candidate.close()

if __name__=='__main__':
 if len(sys.argv)!=3:raise SystemExit(__doc__)
 print(json.dumps(audit(*sys.argv[1:]),indent=2))
