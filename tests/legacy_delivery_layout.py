"""Verify reconstructed delivery sheet/challan/receipt previews on disposable data."""
import os,pathlib,sqlite3,subprocess
from integration import main

def check(base,database,password):
 db=sqlite3.connect(database)
 delivery=db.execute('SELECT id FROM deliveries WHERE legacy_id IS NOT NULL ORDER BY dated DESC,id DESC LIMIT 1').fetchone()[0];db.close()
 subprocess.run(['node',str(pathlib.Path(__file__).with_suffix('.mjs'))],env=dict(os.environ,APG_TEST_URL=base.split('/api.php?')[0],APG_TEST_PASSWORD=password,APG_PRINT_DELIVERY_ID=str(delivery)),check=True)
if __name__=='__main__':main(check)
