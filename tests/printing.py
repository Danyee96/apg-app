"""Thermal preview and PDF checks against a disposable copy of the database.
Requires Node, Playwright and a Chromium browser. See README for environment setup.
Run: python3 tests/printing.py
"""
import os, pathlib, sqlite3, subprocess, json, re
from integration import main

def check_printing(base, database, password):
    root=pathlib.Path(__file__).resolve().parents[1]
    db=sqlite3.connect(database)
    cash=db.execute("SELECT id FROM accounts WHERE id LIKE '1-101-%' AND status='A' LIMIT 1").fetchone()[0]
    customer=db.execute("SELECT id FROM accounts WHERE customer=1 AND status='A' LIMIT 1").fetchone()[0]
    voucher=db.execute("INSERT INTO vouchers(reference,kind,dated,memo,created_by) VALUES('THERMAL-TEST','RV','2026-11-02','Thermal print test','integration-review')").lastrowid
    db.execute('INSERT INTO voucher_lines(voucher_id,account_id,debit,credit) VALUES(?,?,100,0)',(voucher,cash))
    db.execute('INSERT INTO voucher_lines(voucher_id,account_id,debit,credit) VALUES(?,?,0,100)',(voucher,customer))
    db.commit();db.close()
    output=pathlib.Path(os.environ.get('APG_PRINT_OUTPUT',str(database.parent/'print-checks')))
    env=dict(os.environ,APG_TEST_URL=base.split('/api.php?')[0],APG_TEST_USERNAME='integration-review',APG_TEST_PASSWORD=password,APG_PRINT_OUTPUT=str(output))
    subprocess.run(['node',str(root/'tests/thermal-print.mjs')],env=env,check=True)
    files=json.loads((output/'pdfs.json').read_text())
    for item in files:
        boxes=re.findall(rb'/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]',pathlib.Path(item['path']).read_bytes())
        assert boxes, item['path']
        if 'bulk-incoming-a4' in item['path']:assert len(boxes)>1,'Long A4 report must paginate'
        for x,y,w,h in boxes:
            millimetres=(float(w)-float(x))*25.4/72
            assert abs(millimetres-float(item['width']))<.5,(item['path'],millimetres)
            if item['width']=='297':assert abs((float(h)-float(y))*25.4/72-210)<.5,item['path']
            if item['width']=='210':assert abs((float(h)-float(y))*25.4/72-297)<.5,item['path']
    print(f'Verified physical paper widths in {len(files)} generated PDFs. No physical print jobs were submitted.')

if __name__=='__main__':
    main(check_printing)
