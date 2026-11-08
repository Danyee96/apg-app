<?php
declare(strict_types=1);

function migrate_delivery_cash(): void {
 if((one("SELECT value FROM meta WHERE key='delivery_cash_version'")['value']??'')==='5')return;
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
  run('CREATE TABLE IF NOT EXISTS walkin_delivery_requests(request_key TEXT PRIMARY KEY,submitted_by INTEGER NOT NULL,request_hash TEXT NOT NULL,delivery_id INTEGER NOT NULL REFERENCES deliveries(id),result_json TEXT NOT NULL)');
  run("INSERT OR REPLACE INTO meta(key,value) VALUES('delivery_cash_version','5')");
 });
}
function sync_delivery_cash_invoice(int $id): void {
 if(one("SELECT id FROM cash_collection_submissions WHERE delivery_id=? AND status='pending'",[$id]))throw new RuntimeException('A cash collection is awaiting approval. Review or discard it before changing charges.',409);
 $invoice=one('SELECT * FROM delivery_cash_invoices WHERE delivery_id=?',[$id]);
 if($invoice && ($invoice['posted_voucher_id']!==null||!empty($invoice['assessment_complete'])))throw new RuntimeException('Cash processing has started. Delivery charges and customer allocations are locked.',409);
 run('INSERT OR IGNORE INTO delivery_cash_invoices(delivery_id) VALUES(?)',[$id]);
 $frozen=array_column(query('SELECT * FROM delivery_cash_lines WHERE delivery_id=?',[$id]),null,'delivery_item_id');
 run('DELETE FROM delivery_cash_lines WHERE delivery_id=?',[$id]);
 foreach(query('SELECT di.*,i.account_id,i.bilty,i.party_to,i.bilty_amount,i.godown,i.advance FROM delivery_items di JOIN items i ON i.id=di.item_id WHERE di.delivery_id=?',[$id]) as $line){
  if(isset($frozen[$line['id']]))foreach(['account_id','bilty','party_to','bilty_amount','godown','advance'] as $key)$line[$key]=$frozen[$line['id']][$key];
  run('INSERT INTO delivery_cash_lines(delivery_item_id,delivery_id,account_id,bilty,party_to,bilty_due,service_due,bilty_amount,godown,advance) VALUES(?,?,?,?,?,?,?,?,?,?)',[$line['id'],$id,$line['account_id'],$line['bilty'],$line['party_to']??'',(int)$line['bilty_amount']+(int)$line['godown']-(int)$line['advance']-(int)$line['discount'],(int)$line['loading_charge']+(int)$line['suzuki_charge'],(int)$line['bilty_amount'],(int)$line['godown'],(int)$line['advance']]);
 }
}
function delivery_cash_invoice(int $id): array {
 $header=one('SELECT d.*,c.posted_voucher_id,c.accounting_model,c.legacy_services,c.reclassification_voucher_id,c.assessment_complete FROM delivery_cash_invoices c JOIN deliveries d ON d.id=c.delivery_id WHERE d.id=?',[$id]);if(!$header)throw new InvalidArgumentException('Delivery cash invoice not found.');
 $lines=array_map('goods_item_labels',query('SELECT b.*,a.name customer,di.discount,COALESCE(di.loading_charge,0) loading,COALESCE(di.suzuki_charge,0) suzuki,i.qty,i.detail,i.goods_category_id,i.goods_subcategory_id,i.goods_custom,s.dated arrival_date,s.reference arrival_reference,st.name station FROM delivery_cash_balances b JOIN accounts a ON a.id=b.account_id JOIN delivery_items di ON di.id=b.delivery_item_id JOIN items i ON i.id=di.item_id JOIN shipments s ON s.id=i.shipment_id LEFT JOIN stations st ON st.id=s.station_id WHERE b.delivery_id=? ORDER BY b.delivery_item_id',[$id]));
 if(function_exists('unified_enrich_lines')&&isset($header['accounting_model']))$lines=unified_enrich_lines($lines,$id);
 $receipts=query('SELECT r.*,a.name cash_account,(SELECT SUM(l.bilty_received+l.service_received) FROM delivery_cash_receipt_lines l WHERE l.receipt_id=r.id) amount FROM delivery_cash_receipts r LEFT JOIN accounts a ON a.id=r.cash_account_id WHERE r.delivery_id=? ORDER BY r.id',[$id]);
 $due=array_sum(array_column($lines,'bilty_due'))+array_sum(array_column($lines,'service_due'));$received=array_sum(array_column($lines,'bilty_received'))+array_sum(array_column($lines,'service_received'));$balance=$due-$received;
 // Balance status is per customer/bilty: a credit for one customer never settles another's debt.
 $outstanding=array_sum(array_map(fn($line)=>max(0,(int)$line['balance']),$lines));$credit=array_sum(array_map(fn($line)=>max(0,-(int)$line['balance']),$lines));
 if((int)$header['accounting_model']===2){$outstanding=array_sum(array_map(fn($l)=>max(0,$l['bilty_balance'])+$l['service_outstanding'],$lines));$credit=array_sum(array_map(fn($l)=>max(0,-$l['bilty_balance'])+$l['service_credit'],$lines));}
 $result=['header'=>$header,'lines'=>$lines,'receipts'=>$receipts,'due'=>$due,'received'=>$received,'balance'=>$balance,'outstanding'=>$outstanding,'credit'=>$credit,'status'=>!$receipts?'awaiting_cash':($outstanding>0?'customer_due':($credit>0?'customer_credit':'paid'))];
 $result['bilty_outstanding']=array_sum(array_map(fn($l)=>max(0,(int)$l['bilty_due']-(int)$l['bilty_received']),$lines));$result['service_outstanding']=array_sum(array_map(fn($l)=>$l['service_outstanding']??max(0,(int)$l['service_due']-(int)$l['service_received']),$lines));$result['customer_credit']=array_sum(array_map(fn($l)=>max(0,(int)$l['bilty_received']-(int)$l['bilty_due']),$lines));$result['service_credit']=array_sum(array_map(fn($l)=>$l['service_credit']??0,$lines));
 $result['version']=shipment_version($result);$result['pending_cash']=one("SELECT id,submitted_name,submitted_at FROM cash_collection_submissions WHERE delivery_id=? AND status='pending'",[$id]);if($result['pending_cash'])$result['status']='pending_approval';return $result;
}
function delivery_system_voucher(string $kind,string $dated,string $memo,array $entries): int {
 $entries=array_values(array_filter($entries,fn($row)=>$row[1]!==0||$row[2]!==0));
 if(array_sum(array_column($entries,1))!==array_sum(array_column($entries,2)))throw new RuntimeException('Delivery accounting entries do not balance.');
 run('INSERT INTO vouchers(reference,kind,dated,memo,created_by) VALUES(?,?,?,?,?)',['pending-'.bin2hex(random_bytes(8)),$kind,$dated,$memo,$_SESSION['username']??'migration']);$id=(int)db()->lastInsertId();run('UPDATE vouchers SET reference=? WHERE id=?',[$kind.'-'.str_pad((string)$id,6,'0',STR_PAD_LEFT),$id]);
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
 if(!$approvalId&&isset($user['id'])){
  $prior=one('SELECT * FROM cash_collection_submissions WHERE request_key=?',[(string)($p['request_key']??'')]);
  if($prior){if((int)$prior['submitted_by']!==(int)$user['id']||!hash_equals($prior['request_hash'],shipment_version($p)))throw new RuntimeException('This cash request key was already used for different values.',409);
   if($prior['status']==='approved')return ['id'=>$prior['receipt_id'],'delivery_id'=>$prior['delivery_id'],'pending'=>false,'replayed'=>true];
   if($prior['status']==='discarded')throw new RuntimeException('This collection was discarded. Submit a new request.',409);
  }
 }
 if((int)(one('SELECT accounting_model FROM delivery_cash_invoices WHERE delivery_id=?',[(int)($p['delivery_id']??0)])['accounting_model']??0)===2)return unified_record_cash($p,$user,$insideTransaction,$approvalId);
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
 if($action==='receive_delivery_cash'&&$method==='POST')response(record_delivery_cash($p,$user),201);
 delivery_cash_approval_routes($action,$method,$p,$user);
 // Walk-in cash submitted by an operator enters this workspace after first approval.
 $visible=" NOT(d.delivery_mode='walkin' AND NOT EXISTS(SELECT 1 FROM delivery_cash_receipts vr WHERE vr.delivery_id=d.id) AND EXISTS(SELECT 1 FROM cash_collection_submissions vs WHERE vs.delivery_id=d.id))";
 if($action==='delivery_customer_balances'&&$method==='GET'){
  $where=' WHERE '.$visible;$args=[];if(!empty($_GET['search'])){$where.=" AND (a.name LIKE ? ESCAPE '\\' OR a.id LIKE ? ESCAPE '\\' OR b.party_to LIKE ? ESCAPE '\\')";$args=array_fill(0,3,pattern());}
  response(['rows'=>query('SELECT b.account_id,a.name customer,b.party_to,COUNT(*) bilties,SUM(b.bilty_due+b.service_due) due,SUM(b.bilty_received+b.service_received) received,SUM(b.balance) balance,SUM(CASE WHEN c.posted_voucher_id IS NULL THEN b.balance ELSE 0 END) awaiting_cash FROM delivery_cash_balances b JOIN accounts a ON a.id=b.account_id JOIN delivery_cash_invoices c ON c.delivery_id=b.delivery_id JOIN deliveries d ON d.id=b.delivery_id'.$where.' GROUP BY b.account_id,b.party_to HAVING SUM(b.balance)<>0 ORDER BY balance DESC,a.name',$args)]);
 }
 if($action==='delivery_cash_list'&&$method==='GET'){
  $where=' WHERE '.$visible;$args=[];if(!empty($_GET['search'])){$where.=" AND (d.reference LIKE ? ESCAPE '\\' OR d.receiver LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM delivery_cash_lines l JOIN accounts a ON a.id=l.account_id WHERE l.delivery_id=d.id AND (l.bilty LIKE ? ESCAPE '\\' OR a.name LIKE ? ESCAPE '\\' OR l.party_to LIKE ? ESCAPE '\\')))";$args=array_fill(0,5,pattern());}$where.=rangeWhere('d.dated',$args);
  $base='WITH totals AS (SELECT delivery_id,COUNT(*) bilties,SUM(bilty_due+service_due) due,SUM(bilty_received+service_received) received,SUM(balance) balance,SUM(CASE WHEN balance>0 THEN balance ELSE 0 END) outstanding,SUM(CASE WHEN balance<0 THEN -balance ELSE 0 END) credit FROM delivery_cash_balances GROUP BY delivery_id), invoices AS (SELECT d.*,t.bilties,t.due,t.received,t.balance,t.outstanding,t.credit,(SELECT COUNT(*) FROM delivery_cash_receipts r WHERE r.delivery_id=d.id) receipts,(SELECT COUNT(*) FROM cash_collection_submissions s WHERE s.delivery_id=d.id AND s.status=\'pending\') pending_cash FROM deliveries d JOIN totals t ON t.delivery_id=d.id'.$where.') ';
  $mode=text($_GET,'status',20);$filter=match($mode){'awaiting'=>' WHERE receipts=0','outstanding'=>' WHERE outstanding>0','paid'=>' WHERE receipts>0 AND outstanding=0',default=>''};
  $stats=one($base.'SELECT COUNT(*) total,COALESCE(SUM(due),0) due,COALESCE(SUM(received),0) received,COALESCE(SUM(outstanding),0) outstanding,COALESCE(SUM(credit),0) credit FROM invoices'.$filter,$args);$page=max(0,min(max(0,(int)ceil($stats['total']/30)-1),(int)($_GET['page']??0)));
  $rows=query($base.'SELECT * FROM invoices'.$filter.' ORDER BY dated DESC,id DESC LIMIT 30 OFFSET '.($page*30),$args);$previews=[];
  if($rows){$ids=array_column($rows,'id');foreach(query('SELECT delivery_id,bilty FROM (SELECT delivery_id,bilty,ROW_NUMBER() OVER(PARTITION BY delivery_id ORDER BY delivery_item_id) position FROM delivery_cash_lines WHERE delivery_id IN ('.implode(',',array_fill(0,count($ids),'?')).')) WHERE position<=3 ORDER BY delivery_id,position',$ids) as $line)$previews[$line['delivery_id']][]=$line['bilty'];}
  foreach($rows as &$row)$row['bilty_preview']=$previews[$row['id']]??[];unset($row);
  response(['rows'=>$rows,'stats'=>$stats,'total'=>(int)$stats['total'],'page'=>$page,'page_size'=>30]);
 }
 fail('Method not allowed.',405);
}

function cash_submission_version(array $row): string {
 return shipment_version(['submission'=>$row,'invoice_version'=>delivery_cash_invoice((int)$row['delivery_id'])['version']]);
}
// Kept for older clients/callers; submitting cash no longer creates an approval.
function submit_delivery_cash(array $p,array $user,bool $insideTransaction=false): array {
 return record_delivery_cash($p,$user,$insideTransaction);
}

// Deployment transition only. Preserve original proposals and collector identity;
// append receipts once, using the same stable keys as the former approval route.
function settle_pending_delivery_cash(): array {
 $result=['posted'=>0,'errors'=>[]];
 foreach(query("SELECT id FROM cash_collection_submissions WHERE status='pending' ORDER BY id") as $candidate){
  try{$posted=transaction(function()use($candidate){
   $row=one("SELECT * FROM cash_collection_submissions WHERE id=? AND status='pending'",[$candidate['id']]);if(!$row)return false;
   $payload=json_decode($row['payload'],true,64,JSON_THROW_ON_ERROR);$invoice=delivery_cash_invoice((int)$row['delivery_id']);
   $payload['delivery_id']=(int)$row['delivery_id'];$payload['version']=$invoice['version'];$payload['request_key']='cash-approval-'.str_pad((string)$row['id'],16,'0',STR_PAD_LEFT);
   $receipt=record_delivery_cash($payload,['username'=>$row['submitted_name']],true,(int)$row['id']);
   $payload['automatic_posting_reason']='Operator cash approval requirement removed';
   run("UPDATE cash_collection_submissions SET status='approved',approved_by=NULL,approved_at=CURRENT_TIMESTAMP,receipt_id=?,approved_payload=? WHERE id=?",[$receipt['id'],json_encode($payload,JSON_THROW_ON_ERROR),$row['id']]);
   foreach(['delivery_unified_requests','walkin_delivery_requests'] as $table)foreach(query('SELECT request_key,result_json FROM '.$table) as $request){$saved=json_decode($request['result_json'],true,64,JSON_THROW_ON_ERROR);if((int)($saved['id']??0)!==(int)$row['delivery_id']||empty($saved['pending_cash'])||(int)($saved['cash_id']??0)!==(int)$row['id'])continue;$saved['pending_cash']=false;$saved['cash_recorded']=true;$saved['cash_id']=$receipt['id'];run('UPDATE '.$table.' SET result_json=? WHERE request_key=?',[json_encode($saved,JSON_THROW_ON_ERROR),$request['request_key']]);}
   audit('posted automatically after approval removal','cash_collection',$row['id']);return true;
  });if($posted)$result['posted']++;
  }catch(Throwable $error){$result['errors'][]=['id'=>$candidate['id'],'error'=>$error->getMessage()];}
 }
 $result['pending']=(int)one("SELECT COUNT(*) n FROM cash_collection_submissions WHERE status='pending'")['n'];return $result;
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
   $invoice=delivery_cash_invoice((int)$row['delivery_id']);$approved=['delivery_id'=>(int)$row['delivery_id'],'version'=>$invoice['version'],'request_key'=>'cash-approval-'.str_pad((string)$id,16,'0',STR_PAD_LEFT),'dated'=>day($p),'cash_account_id'=>text($p,'cash_account_id',40),'notes'=>text($p,'notes',500),'items'=>$p['items']??[],'initial'=>!empty(json_decode($row['payload'],true)['initial'])];
   $receipt=record_delivery_cash($approved,['username'=>$row['submitted_name']],true,$id);
   run("UPDATE cash_collection_submissions SET status='approved',approved_by=?,approved_at=CURRENT_TIMESTAMP,receipt_id=?,approved_payload=? WHERE id=?",[$user['id'],$receipt['id'],json_encode($approved,JSON_THROW_ON_ERROR),$id]);audit('approved','cash_collection',$id);return $receipt;
  });response($result,201);
 }
}

// Called inside the delivery transaction; any cash error rolls the handover back too.
function collect_walkin_delivery_cash(int $deliveryId,array $cash,array $user,string $dated): array {
 $invoice=delivery_cash_invoice($deliveryId);$map=[];foreach(query('SELECT id,item_id FROM delivery_items WHERE delivery_id=?',[$deliveryId]) as $line)$map[(int)$line['item_id']]=(int)$line['id'];
 $input=$cash['items']??[];if(!is_array($input)||count($input)!==count($map))throw new InvalidArgumentException('Include every invoice bilty once.');$items=[];$seen=[];
 foreach($input as $row){if(!is_array($row))throw new InvalidArgumentException('Include every invoice bilty once.');$source=filter_var($row['id']??0,FILTER_VALIDATE_INT);if(!$source||!isset($map[$source])||isset($seen[$source]))throw new InvalidArgumentException('A cash line does not belong to this delivery.');$seen[$source]=true;$items[]=['id'=>$map[$source],'bilty_received'=>$row['bilty_received']??'0','service_received'=>$row['service_received']??'0'];}
 $payload=['delivery_id'=>$deliveryId,'version'=>$invoice['version'],'request_key'=>text($cash,'request_key',100,true),'dated'=>$dated,'cash_account_id'=>text($cash,'cash_account_id',40),'notes'=>text($cash,'notes',500),'items'=>$items];
 return record_delivery_cash($payload,$user,true);
}

// Customer debt is read from its original delivery allocations, never reposted
// as a charge on the next delivery. Exclude that delivery when reviewing it.
function delivery_customer_dues(array $p): array {
 $input=$p['account_ids']??[];if(!is_array($input)||count($input)<1||count($input)>1000)throw new InvalidArgumentException('Choose between 1 and 1000 customers.');
 $ids=[];foreach($input as $id){if(!is_string($id)||trim($id)===''||mb_strlen($id)>40)throw new InvalidArgumentException('Choose valid customers.');$ids[trim($id)]=true;}$ids=array_keys($ids);$marks=implode(',',array_fill(0,count($ids),'?'));
 $accounts=query('SELECT id,name FROM accounts WHERE customer=1 AND id IN ('.$marks.') ORDER BY name',$ids);if(count($accounts)!==count($ids))throw new InvalidArgumentException('Choose valid customers.');
 $exclude=filter_var($p['exclude_delivery_id']??0,FILTER_VALIDATE_INT);if($exclude===false||$exclude<0)throw new InvalidArgumentException('Choose a valid delivery.');
 $where=" WHERE b.account_id IN ($marks) AND b.delivery_id<>? AND NOT(d.delivery_mode='walkin' AND NOT EXISTS(SELECT 1 FROM delivery_cash_receipts vr WHERE vr.delivery_id=d.id) AND EXISTS(SELECT 1 FROM cash_collection_submissions vs WHERE vs.delivery_id=d.id))";$args=[...$ids,$exclude];
 $from=' FROM (SELECT l.*,l.bilty_due-l.bilty_received customer_balance FROM delivery_unified_lines l) b JOIN deliveries d ON d.id=b.delivery_id';
 $summary=query('SELECT b.account_id,SUM(CASE WHEN b.customer_balance>0 THEN b.customer_balance ELSE 0 END) outstanding,SUM(CASE WHEN b.customer_balance<0 THEN -b.customer_balance ELSE 0 END) credit,SUM(CASE WHEN b.customer_balance>0 THEN 1 ELSE 0 END) bilties'.$from.$where.' GROUP BY b.account_id',$args);$map=array_column($summary,null,'account_id');
 $customers=[];foreach($accounts as $account){$sum=$map[$account['id']]??[];$customers[]=['account_id'=>$account['id'],'customer'=>$account['name'],'outstanding'=>(int)($sum['outstanding']??0),'credit'=>(int)($sum['credit']??0),'bilties'=>(int)($sum['bilties']??0)];}
 $result=['customers'=>$customers,'exclude_delivery_id'=>$exclude];
 if(!empty($p['details'])){
  if(count($ids)!==1)throw new InvalidArgumentException('Choose one customer to view details.');$total=$customers[0]['bilties'];$page=max(0,min(max(0,(int)ceil($total/50)-1),(int)($p['page']??0)));
  $result['rows']=query('SELECT b.delivery_id,b.delivery_item_id,b.bilty,b.party_to,b.bilty_amount,b.godown,b.advance,b.bilty_due+b.service_due due,b.bilty_received+b.service_received received,b.customer_balance balance,d.reference,d.dated,(SELECT COUNT(*) FROM cash_collection_submissions s WHERE s.delivery_id=d.id AND s.status=\'pending\') pending_cash'.$from.$where.' AND b.customer_balance>0 ORDER BY d.dated,b.delivery_id,b.delivery_item_id LIMIT 50 OFFSET '.($page*50),$args);$result['total']=$total;$result['page']=$page;$result['page_size']=50;
 }
 return $result;
}
