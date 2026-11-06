<?php
declare(strict_types=1);

function migrate_delivery_cash(): void {
 if((one("SELECT value FROM meta WHERE key='delivery_cash_version'")['value']??'')==='4')return;
 transaction(function(){
  if(!in_array('cash_workflow',array_column(query('PRAGMA table_info(deliveries)'),'name'),true))run('ALTER TABLE deliveries ADD COLUMN cash_workflow INTEGER NOT NULL DEFAULT 0');
  if(!in_array('delivery_mode',array_column(query('PRAGMA table_info(deliveries)'),'name'),true))run("ALTER TABLE deliveries ADD COLUMN delivery_mode TEXT NOT NULL DEFAULT 'standard'");
  run('CREATE TABLE IF NOT EXISTS delivery_cash_invoices(delivery_id INTEGER PRIMARY KEY REFERENCES deliveries(id),posted_voucher_id INTEGER REFERENCES vouchers(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  run('CREATE TABLE IF NOT EXISTS delivery_cash_lines(delivery_item_id INTEGER PRIMARY KEY REFERENCES delivery_items(id),delivery_id INTEGER NOT NULL REFERENCES deliveries(id),account_id TEXT NOT NULL REFERENCES accounts(id),bilty TEXT NOT NULL,party_to TEXT NOT NULL DEFAULT \'\',bilty_due INTEGER NOT NULL,service_due INTEGER NOT NULL)');
  foreach(['bilty_amount','godown','advance'] as $column)if(!in_array($column,array_column(query('PRAGMA table_info(delivery_cash_lines)'),'name'),true))run('ALTER TABLE delivery_cash_lines ADD COLUMN '.$column.' INTEGER NOT NULL DEFAULT 0');
  run('CREATE INDEX IF NOT EXISTS delivery_cash_lines_delivery ON delivery_cash_lines(delivery_id)');
  run('CREATE INDEX IF NOT EXISTS delivery_cash_lines_account ON delivery_cash_lines(account_id)');
  run('CREATE TABLE IF NOT EXISTS delivery_cash_receipts(id INTEGER PRIMARY KEY AUTOINCREMENT,delivery_id INTEGER NOT NULL REFERENCES deliveries(id),request_key TEXT NOT NULL UNIQUE,dated TEXT NOT NULL,cash_account_id TEXT REFERENCES accounts(id),notes TEXT NOT NULL DEFAULT \'\',created_by TEXT NOT NULL,voucher_id INTEGER REFERENCES vouchers(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,request_hash TEXT NOT NULL)');
  run('CREATE INDEX IF NOT EXISTS delivery_cash_receipts_delivery ON delivery_cash_receipts(delivery_id)');
  run('CREATE TABLE IF NOT EXISTS delivery_cash_receipt_lines(receipt_id INTEGER NOT NULL REFERENCES delivery_cash_receipts(id),delivery_item_id INTEGER NOT NULL REFERENCES delivery_cash_lines(delivery_item_id),bilty_received INTEGER NOT NULL,service_received INTEGER NOT NULL,PRIMARY KEY(receipt_id,delivery_item_id))');
  run('CREATE INDEX IF NOT EXISTS delivery_cash_receipt_lines_item ON delivery_cash_receipt_lines(delivery_item_id)');
  run("CREATE VIEW IF NOT EXISTS delivery_cash_balances AS SELECT l.*,COALESCE(r.bilty_received,0) bilty_received,COALESCE(r.service_received,0) service_received,l.bilty_due+l.service_due-COALESCE(r.bilty_received,0)-COALESCE(r.service_received,0) balance FROM delivery_cash_lines l LEFT JOIN (SELECT delivery_item_id,SUM(bilty_received) bilty_received,SUM(service_received) service_received FROM delivery_cash_receipt_lines GROUP BY delivery_item_id) r ON r.delivery_item_id=l.delivery_item_id");
  run("CREATE TABLE IF NOT EXISTS cash_collection_submissions(id INTEGER PRIMARY KEY AUTOINCREMENT,delivery_id INTEGER NOT NULL REFERENCES deliveries(id),submitted_by INTEGER NOT NULL,submitted_name TEXT NOT NULL,submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,status TEXT NOT NULL DEFAULT 'pending',payload TEXT NOT NULL,request_key TEXT NOT NULL UNIQUE,request_hash TEXT NOT NULL,approved_by INTEGER,approved_at TEXT,receipt_id INTEGER REFERENCES delivery_cash_receipts(id),approved_payload TEXT)");
  run("CREATE UNIQUE INDEX IF NOT EXISTS cash_collection_pending_delivery ON cash_collection_submissions(delivery_id) WHERE status='pending'");
  run('CREATE INDEX IF NOT EXISTS cash_collection_submitter ON cash_collection_submissions(submitted_by,status)');
  run("INSERT OR REPLACE INTO meta(key,value) VALUES('delivery_cash_version','4')");
 });
}
function sync_delivery_cash_invoice(int $id): void {
 if(one("SELECT id FROM cash_collection_submissions WHERE delivery_id=? AND status='pending'",[$id]))throw new RuntimeException('A cash collection is awaiting approval. Review or discard it before changing charges.',409);
 $invoice=one('SELECT * FROM delivery_cash_invoices WHERE delivery_id=?',[$id]);
 if($invoice && $invoice['posted_voucher_id']!==null)throw new RuntimeException('Cash processing has started. Delivery charges and customer allocations are locked.',409);
 run('INSERT OR IGNORE INTO delivery_cash_invoices(delivery_id) VALUES(?)',[$id]);
 $frozen=array_column(query('SELECT * FROM delivery_cash_lines WHERE delivery_id=?',[$id]),null,'delivery_item_id');
 run('DELETE FROM delivery_cash_lines WHERE delivery_id=?',[$id]);
 foreach(query('SELECT di.*,i.account_id,i.bilty,i.party_to,i.bilty_amount,i.godown,i.advance FROM delivery_items di JOIN items i ON i.id=di.item_id WHERE di.delivery_id=?',[$id]) as $line){
  if(isset($frozen[$line['id']]))foreach(['account_id','bilty','party_to','bilty_amount','godown','advance'] as $key)$line[$key]=$frozen[$line['id']][$key];
  run('INSERT INTO delivery_cash_lines(delivery_item_id,delivery_id,account_id,bilty,party_to,bilty_due,service_due,bilty_amount,godown,advance) VALUES(?,?,?,?,?,?,?,?,?,?)',[$line['id'],$id,$line['account_id'],$line['bilty'],$line['party_to']??'',(int)$line['bilty_amount']+(int)$line['godown']-(int)$line['advance']-(int)$line['discount'],(int)$line['loading_charge']+(int)$line['suzuki_charge'],(int)$line['bilty_amount'],(int)$line['godown'],(int)$line['advance']]);
 }
}
function delivery_cash_invoice(int $id): array {
 $header=one('SELECT d.*,c.posted_voucher_id FROM delivery_cash_invoices c JOIN deliveries d ON d.id=c.delivery_id WHERE d.id=?',[$id]);if(!$header)throw new InvalidArgumentException('Delivery cash invoice not found.');
 $lines=query('SELECT b.*,a.name customer FROM delivery_cash_balances b JOIN accounts a ON a.id=b.account_id WHERE b.delivery_id=? ORDER BY b.delivery_item_id',[$id]);
 $receipts=query('SELECT r.*,a.name cash_account,(SELECT SUM(l.bilty_received+l.service_received) FROM delivery_cash_receipt_lines l WHERE l.receipt_id=r.id) amount FROM delivery_cash_receipts r LEFT JOIN accounts a ON a.id=r.cash_account_id WHERE r.delivery_id=? ORDER BY r.id',[$id]);
 $due=array_sum(array_column($lines,'bilty_due'))+array_sum(array_column($lines,'service_due'));$received=array_sum(array_column($lines,'bilty_received'))+array_sum(array_column($lines,'service_received'));$balance=$due-$received;
 // Balance status is per customer/bilty: a credit for one customer never settles another's debt.
 $outstanding=array_sum(array_map(fn($line)=>max(0,(int)$line['balance']),$lines));$credit=array_sum(array_map(fn($line)=>max(0,-(int)$line['balance']),$lines));
 $result=['header'=>$header,'lines'=>$lines,'receipts'=>$receipts,'due'=>$due,'received'=>$received,'balance'=>$balance,'outstanding'=>$outstanding,'credit'=>$credit,'status'=>!$receipts?'awaiting_cash':($outstanding>0?'customer_due':($credit>0?'customer_credit':'paid'))];
 $result['version']=shipment_version($result);$result['pending_cash']=one("SELECT id,submitted_name,submitted_at FROM cash_collection_submissions WHERE delivery_id=? AND status='pending'",[$id]);if($result['pending_cash'])$result['status']='pending_approval';return $result;
}
function delivery_system_voucher(string $kind,string $dated,string $memo,array $entries): int {
 $entries=array_values(array_filter($entries,fn($row)=>$row[1]!==0||$row[2]!==0));
 if(array_sum(array_column($entries,1))!==array_sum(array_column($entries,2)))throw new RuntimeException('Delivery accounting entries do not balance.');
 run('INSERT INTO vouchers(reference,kind,dated,memo,created_by) VALUES(?,?,?,?,?)',['pending-'.bin2hex(random_bytes(8)),$kind,$dated,$memo,$_SESSION['username']]);$id=(int)db()->lastInsertId();run('UPDATE vouchers SET reference=? WHERE id=?',[$kind.'-'.str_pad((string)$id,6,'0',STR_PAD_LEFT),$id]);
 foreach($entries as $row)run('INSERT INTO voucher_lines(voucher_id,account_id,debit,credit) VALUES(?,?,?,?)',[$id,...$row]);audit('posted','voucher',$id);return $id;
}
function validate_delivery_cash_amounts(array $p,array $invoice,string $dated): array {
  if($dated<$invoice['header']['dated']||(!empty($invoice['receipts'])&&$dated<max(array_column($invoice['receipts'],'dated'))))throw new InvalidArgumentException('Cash receiving date cannot be earlier than delivery or a previous collection.');
  $input=$p['items']??[];if(!is_array($input)||count($input)!==count($invoice['lines']))throw new InvalidArgumentException('Include every invoice bilty once.');$lines=[];$total=0;
  foreach($input as $row){if(!is_array($row))throw new InvalidArgumentException('Include every invoice bilty once.');$lineId=filter_var($row['id']??0,FILTER_VALIDATE_INT);if(!$lineId||isset($lines[$lineId]))throw new InvalidArgumentException('Include every invoice bilty once.');$bilty=money($row,'bilty_received');$service=money($row,'service_received');$lines[$lineId]=[$bilty,$service];$total+=$bilty+$service;}
  $allowed=array_fill_keys(array_column($invoice['lines'],'delivery_item_id'),true);if(array_diff_key($allowed,$lines)||array_diff_key($lines,$allowed))throw new InvalidArgumentException('A cash line does not belong to this delivery.');
  if($total===0&&$invoice['receipts'])throw new InvalidArgumentException('Enter an amount for this additional collection.');
  $cashAccount=text($p,'cash_account_id',40);if($total>0&&!one("SELECT id FROM accounts WHERE id=? AND status='A' AND (id LIKE '1-101-%' OR id LIKE '1-106-%')",[$cashAccount]))throw new InvalidArgumentException('Choose an active cash or bank account.');
 return [$lines,$total,$cashAccount];
}
function can_submit_delivery_cash(array $user): bool {return $user['role']==='operations'&&can_access($user,'deliveries.create');}
function record_delivery_cash(array $p,array $user,bool $insideTransaction=false,int $approvalId=0): array {
 $id=(int)($p['delivery_id']??0);$dated=day($p);$key=text($p,'request_key',100,true);if(!preg_match('/^[a-zA-Z0-9-]{16,100}$/D',$key))throw new InvalidArgumentException('Invalid cash receipt request key.');
 $payloadHash=shipment_version($p);
 $save=function()use($p,$user,$id,$dated,$key,$payloadHash,$approvalId){
  if(!$approvalId&&one('SELECT id FROM cash_collection_submissions WHERE request_key=?',[$key]))throw new RuntimeException('This cash request key was already used for different values.',409);
  $existing=one('SELECT * FROM delivery_cash_receipts WHERE request_key=?',[$key]);if($existing){if((int)$existing['delivery_id']!==$id||!hash_equals($existing['request_hash'],$payloadHash))throw new RuntimeException('This cash request key was already used for different values.',409);return ['id'=>$existing['id'],'delivery_id'=>$id,'replayed'=>true];}
  $reserved=one("SELECT id FROM cash_collection_submissions WHERE delivery_id=? AND status='pending'",[$id]);if($reserved&&(int)$reserved['id']!==$approvalId)throw new RuntimeException('A cash collection is already awaiting approval for this delivery.',409);
  $invoice=delivery_cash_invoice($id);if(!hash_equals($invoice['version'],(string)($p['version']??'')))throw new RuntimeException('This cash invoice changed. Reopen it before collecting.',409);
  [$lines,$total,$cashAccount]=validate_delivery_cash_amounts($p,$invoice,$dated);
  if($invoice['header']['posted_voucher_id']===null){
   // This is a clearing account, not a revenue classification. Historical accounts/amounts stay unchanged.
   run("INSERT OR IGNORE INTO accounts(id,name,group_code,group_name,customer) VALUES('SYS-DELIVERY-CLEARING','Delivery charges clearing','SYS-DELIVERY','DELIVERY CLEARING',0)");
   $entries=[];$net=0;foreach($invoice['lines'] as $line){$due=(int)$line['bilty_due']+(int)$line['service_due'];$entries[]=[$line['account_id'],max(0,$due),max(0,-$due)];$net+=$due;}
   $entries[]=['SYS-DELIVERY-CLEARING',max(0,-$net),max(0,$net)];
   $voucher=delivery_system_voucher('JV',$dated,'Delivery charge assessment · '.$invoice['header']['reference'],$entries);run('UPDATE delivery_cash_invoices SET posted_voucher_id=? WHERE delivery_id=?',[$voucher,$id]);
  }
  $voucher=null;if($total>0){$entries=[[$cashAccount,$total,0]];foreach($invoice['lines'] as $line){[$bilty,$service]=$lines[$line['delivery_item_id']];$entries[]=[$line['account_id'],0,$bilty+$service];}$voucher=delivery_system_voucher('RV',$dated,'Delivery cash received · '.$invoice['header']['reference'],$entries);}
  run('INSERT INTO delivery_cash_receipts(delivery_id,request_key,dated,cash_account_id,notes,created_by,voucher_id,request_hash) VALUES(?,?,?,?,?,?,?,?)',[$id,$key,$dated,$total>0?$cashAccount:null,text($p,'notes',500),$user['username'],$voucher,$payloadHash]);$receiptId=(int)db()->lastInsertId();
  foreach($lines as $lineId=>[$bilty,$service]){run('INSERT INTO delivery_cash_receipt_lines(receipt_id,delivery_item_id,bilty_received,service_received) VALUES(?,?,?,?)',[$receiptId,$lineId,$bilty,$service]);run('UPDATE delivery_items SET bilty_received=bilty_received+?,service_received=service_received+? WHERE id=?',[$bilty,$service,$lineId]);}
  audit('received cash','delivery',$id);return ['id'=>$receiptId,'delivery_id'=>$id,'voucher_id'=>$voucher];
 };
 return $insideTransaction?$save():transaction($save);
}
function delivery_cash_routes(string $action,string $method,array $p,array $user): void {
 if(!in_array($action,['delivery_cash_list','delivery_cash_invoice','receive_delivery_cash','delivery_customer_balances','pending_cash_collections','cash_collection_submission','approve_cash_collection','discard_cash_collection'],true))return;
 if($user['role']!=='super_admin'&&!can_submit_delivery_cash($user))fail('Delivery cash access is not available to this account.',403);
 if(in_array($action,['delivery_customer_balances','approve_cash_collection','discard_cash_collection'],true)&&$user['role']!=='super_admin')fail('Only the super admin can approve cash collections.',403);
 if($action==='delivery_cash_invoice'&&$method==='GET'){$result=delivery_cash_invoice((int)($_GET['id']??0));$result['cash_accounts']=query("SELECT id,name FROM accounts WHERE status='A' AND (id LIKE '1-101-%' OR id LIKE '1-106-%') ORDER BY id");response($result);}
 if($action==='receive_delivery_cash'&&$method==='POST')response($user['role']==='super_admin'?record_delivery_cash($p,$user):submit_delivery_cash($p,$user),201);
 delivery_cash_approval_routes($action,$method,$p,$user);
 if($action==='delivery_customer_balances'&&$method==='GET'){
  $where=' WHERE 1=1';$args=[];if(!empty($_GET['search'])){$where.=" AND (a.name LIKE ? ESCAPE '\\' OR a.id LIKE ? ESCAPE '\\' OR b.party_to LIKE ? ESCAPE '\\')";$args=array_fill(0,3,pattern());}
  response(['rows'=>query('SELECT b.account_id,a.name customer,b.party_to,COUNT(*) bilties,SUM(b.bilty_due+b.service_due) due,SUM(b.bilty_received+b.service_received) received,SUM(b.balance) balance,SUM(CASE WHEN c.posted_voucher_id IS NULL THEN b.balance ELSE 0 END) awaiting_cash FROM delivery_cash_balances b JOIN accounts a ON a.id=b.account_id JOIN delivery_cash_invoices c ON c.delivery_id=b.delivery_id'.$where.' GROUP BY b.account_id,b.party_to HAVING SUM(b.balance)<>0 ORDER BY balance DESC,a.name',$args)]);
 }
 if($action==='delivery_cash_list'&&$method==='GET'){
  $where=' WHERE 1=1';$args=[];if(!empty($_GET['search'])){$where.=" AND (d.reference LIKE ? ESCAPE '\\' OR d.receiver LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM delivery_cash_lines l JOIN accounts a ON a.id=l.account_id WHERE l.delivery_id=d.id AND (l.bilty LIKE ? ESCAPE '\\' OR a.name LIKE ? ESCAPE '\\' OR l.party_to LIKE ? ESCAPE '\\')))";$args=array_fill(0,5,pattern());}$where.=rangeWhere('d.dated',$args);
  $base='WITH totals AS (SELECT delivery_id,COUNT(*) bilties,SUM(bilty_due+service_due) due,SUM(bilty_received+service_received) received,SUM(balance) balance,SUM(CASE WHEN balance>0 THEN balance ELSE 0 END) outstanding,SUM(CASE WHEN balance<0 THEN -balance ELSE 0 END) credit FROM delivery_cash_balances GROUP BY delivery_id), invoices AS (SELECT d.*,t.bilties,t.due,t.received,t.balance,t.outstanding,t.credit,(SELECT COUNT(*) FROM delivery_cash_receipts r WHERE r.delivery_id=d.id) receipts,(SELECT COUNT(*) FROM cash_collection_submissions s WHERE s.delivery_id=d.id AND s.status=\'pending\') pending_cash FROM deliveries d JOIN totals t ON t.delivery_id=d.id'.$where.') ';
  $mode=text($_GET,'status',20);$filter=match($mode){'awaiting'=>' WHERE receipts=0','outstanding'=>' WHERE outstanding>0','paid'=>' WHERE receipts>0 AND outstanding=0',default=>''};
  $stats=one($base.'SELECT COUNT(*) total,COALESCE(SUM(due),0) due,COALESCE(SUM(received),0) received,COALESCE(SUM(outstanding),0) outstanding,COALESCE(SUM(credit),0) credit FROM invoices'.$filter,$args);$page=max(0,min(max(0,(int)ceil($stats['total']/30)-1),(int)($_GET['page']??0)));
  response(['rows'=>query($base.'SELECT * FROM invoices'.$filter.' ORDER BY dated DESC,id DESC LIMIT 30 OFFSET '.($page*30),$args),'stats'=>$stats,'total'=>(int)$stats['total'],'page'=>$page,'page_size'=>30]);
 }
 fail('Method not allowed.',405);
}

function cash_submission_version(array $row): string {
 return shipment_version(['submission'=>$row,'invoice_version'=>delivery_cash_invoice((int)$row['delivery_id'])['version']]);
}
function submit_delivery_cash(array $p,array $user): array {
 $id=(int)($p['delivery_id']??0);$dated=day($p);$key=text($p,'request_key',100,true);if(!preg_match('/^[a-zA-Z0-9-]{16,100}$/D',$key))throw new InvalidArgumentException('Invalid cash receipt request key.');$hash=shipment_version($p);
 return transaction(function()use($p,$user,$id,$dated,$key,$hash){
  $existing=one('SELECT * FROM cash_collection_submissions WHERE request_key=?',[$key]);if($existing){if((int)$existing['submitted_by']!==(int)$user['id']||!hash_equals($existing['request_hash'],$hash))throw new RuntimeException('This cash request key was already used for different values.',409);if($existing['status']==='discarded')throw new RuntimeException('This cash collection was discarded. Reopen the invoice to submit again.',409);return ['id'=>$existing['status']==='approved'?$existing['receipt_id']:$existing['id'],'delivery_id'=>$id,'pending'=>$existing['status']==='pending','status'=>$existing['status'],'replayed'=>true];}
  if(one('SELECT id FROM delivery_cash_receipts WHERE request_key=?',[$key]))throw new RuntimeException('This cash request key was already used for different values.',409);
  if(one("SELECT id FROM cash_collection_submissions WHERE delivery_id=? AND status='pending'",[$id]))throw new RuntimeException('A cash collection is already awaiting approval for this delivery.',409);
  $invoice=delivery_cash_invoice($id);if(!hash_equals($invoice['version'],(string)($p['version']??'')))throw new RuntimeException('This cash invoice changed. Reopen it before collecting.',409);
  [$lines,$total,$cashAccount]=validate_delivery_cash_amounts($p,$invoice,$dated);
  $format=fn($amount)=>sprintf('%d.%02d',intdiv($amount,100),$amount%100);$items=[];foreach($lines as $lineId=>[$bilty,$service])$items[]=['id'=>$lineId,'bilty_received'=>$format($bilty),'service_received'=>$format($service)];
  $payload=['delivery_id'=>$id,'version'=>$invoice['version'],'request_key'=>$key,'dated'=>$dated,'cash_account_id'=>$cashAccount,'notes'=>text($p,'notes',500),'items'=>$items];
  run('INSERT INTO cash_collection_submissions(delivery_id,submitted_by,submitted_name,payload,request_key,request_hash) VALUES(?,?,?,?,?,?)',[$id,$user['id'],$user['username'],json_encode($payload,JSON_THROW_ON_ERROR),$key,$hash]);$submissionId=(int)db()->lastInsertId();audit('submitted','cash_collection',$submissionId);return ['id'=>$submissionId,'delivery_id'=>$id,'pending'=>true];
 });
}
function delivery_cash_approval_routes(string $action,string $method,array $p,array $user): void {
 if($action==='pending_cash_collections'&&$method==='GET'){
  $where=" WHERE s.status='pending'";$args=[];if($user['role']!=='super_admin'){$where.=' AND s.submitted_by=?';$args[]=$user['id'];}
  $result=paged('cash_collection_submissions s JOIN deliveries d ON d.id=s.delivery_id',$where,$args,'s.id,s.delivery_id,s.submitted_name,s.submitted_at,s.payload,d.reference,d.receiver,d.delivery_mode','s.id DESC');
  foreach($result['rows'] as &$row){$payload=json_decode($row['payload'],true,64,JSON_THROW_ON_ERROR);unset($row['payload']);$row['dated']=$payload['dated'];$row['amount']=array_sum(array_map(fn($line)=>money($line,'bilty_received')+money($line,'service_received'),$payload['items']));$row['bilties']=count($payload['items']);}unset($row);response($result);
 }
 if($action==='cash_collection_submission'&&$method==='GET'){
  $row=one("SELECT * FROM cash_collection_submissions WHERE id=? AND status='pending'",[(int)($_GET['id']??0)]);if(!$row)fail('Pending cash collection not found.',404);if($user['role']!=='super_admin'&&(int)$row['submitted_by']!==(int)$user['id'])fail('This cash submission is not available to your account.',403);
  response(['id'=>$row['id'],'delivery_id'=>$row['delivery_id'],'submitted_name'=>$row['submitted_name'],'submitted_at'=>$row['submitted_at'],'version'=>cash_submission_version($row),'payload'=>json_decode($row['payload'],true,64,JSON_THROW_ON_ERROR)]);
 }
 if($action==='discard_cash_collection'&&$method==='POST'){
  $id=(int)($p['id']??0);transaction(function()use($id){if(!one("SELECT id FROM cash_collection_submissions WHERE id=? AND status='pending'",[$id]))throw new RuntimeException('This cash collection is no longer pending.',409);run("UPDATE cash_collection_submissions SET status='discarded' WHERE id=?",[$id]);audit('discarded','cash_collection',$id);});response(['ok'=>true]);
 }
 if($action==='approve_cash_collection'&&$method==='POST'){
  $result=transaction(function()use($p,$user){
   $id=(int)($p['pending_id']??0);$row=one("SELECT * FROM cash_collection_submissions WHERE id=? AND status='pending'",[$id]);if(!$row)throw new RuntimeException('This cash collection is no longer pending.',409);
   if(!hash_equals(cash_submission_version($row),(string)($p['pending_version']??'')))throw new RuntimeException('This cash submission changed. Reopen it before approving.',409);
   if((int)($p['delivery_id']??0)!==(int)$row['delivery_id'])throw new InvalidArgumentException('The cash submission belongs to a different delivery.');
   $invoice=delivery_cash_invoice((int)$row['delivery_id']);$approved=['delivery_id'=>(int)$row['delivery_id'],'version'=>$invoice['version'],'request_key'=>'cash-approval-'.str_pad((string)$id,16,'0',STR_PAD_LEFT),'dated'=>day($p),'cash_account_id'=>text($p,'cash_account_id',40),'notes'=>text($p,'notes',500),'items'=>$p['items']??[]];
   $receipt=record_delivery_cash($approved,['username'=>$row['submitted_name']],true,$id);
   run("UPDATE cash_collection_submissions SET status='approved',approved_by=?,approved_at=CURRENT_TIMESTAMP,receipt_id=?,approved_payload=? WHERE id=?",[$user['id'],$receipt['id'],json_encode($approved,JSON_THROW_ON_ERROR),$id]);audit('approved','cash_collection',$id);return $receipt;
  });response($result,201);
 }
}
