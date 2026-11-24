"""Run the desktop queue through the real API using a disposable database."""
import json, os, sqlite3, subprocess
from integration import main

def check(base, database, password):
 env={**os.environ,'APG_TEST_BASE':base,'APG_TEST_PASSWORD':password}
 result=subprocess.run(['node','tests/offline_sync_http.cjs'],env=env,text=True,capture_output=True,check=True)
 data=json.loads(result.stdout)
 db=sqlite3.connect(database)
 assert db.execute("SELECT COUNT(*) FROM shipments WHERE truck='HTTP-SYNC-TEST'").fetchone()[0]==1
 assert db.execute("SELECT COUNT(*) FROM items WHERE shipment_id=(SELECT id FROM shipments WHERE truck='HTTP-SYNC-TEST')").fetchone()[0]==2
 assert db.execute("SELECT driver,truck_amount,labour_bonus,munshi_bonus FROM shipments WHERE truck='HTTP-SYNC-TEST'").fetchone()==('Driver test',30000,2500,1500)
 item=db.execute("SELECT party_to,service_advance,goods_subcategory_id FROM items WHERE bilty='HTTP-SYNC-1' AND shipment_id=(SELECT id FROM shipments WHERE truck='HTTP-SYNC-TEST')").fetchone()
 assert item[0]=='Receiver' and item[1]==1000 and item[2] is not None
 assert db.execute('SELECT COUNT(*) FROM offline_shipment_requests WHERE request_key=?',(data['requestId'],)).fetchone()[0]==1
 assert db.execute("SELECT account_id FROM items WHERE bilty='HTTP-TEMP-1' AND shipment_id=(SELECT id FROM shipments WHERE truck='HTTP-TEMP-LINK')").fetchone()[0]==data['realCustomer']
 assert db.execute('SELECT temporary FROM accounts WHERE id=?',(data['realCustomer'],)).fetchone()[0]==1
 assert db.execute('SELECT COUNT(*) FROM delivery_items WHERE item_id=?',(data['deliveryItem'],)).fetchone()[0]==1
 assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
 db.close();print('Desktop queue retried a lost response through the real API without duplicating the shipment.')

if __name__=='__main__':main(check)
