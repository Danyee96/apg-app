<?php
declare(strict_types=1);
function unified_accounts(): void {
 foreach(['BILTY'=>'Bilty','LOADING'=>'Loading','SUZUKI'=>'Suzuki','LEGACY-SERVICE'=>'Legacy combined service'] as $key=>$name){
  run("INSERT OR IGNORE INTO accounts(id,name,group_code,group_name,customer) VALUES(?,?, 'SYS-DELIVERY','DELIVERY CONTROLS',0)",['SYS-'.$key.'-CLEARING',$name.' charges clearing']);
  if($key!=='BILTY')run("INSERT OR IGNORE INTO accounts(id,name,group_code,group_name,customer) VALUES(?,?, 'SYS-SERVICES','SERVICE RECEIVABLES',0)",['SYS-'.$key.'-RECEIVABLE',$name.' receivable']);
 }
}
function unified_journal(string $dated,string $memo,array $entries): ?int {
 $entries=array_values(array_filter($entries,fn($line)=>$line[1]||$line[2]));if(!$entries)return null;
 return delivery_system_voucher('JV',$dated,$memo,$entries);
}
function unified_entry(string $account,int $debit): array {return [$account,max(0,$debit),max(0,-$debit)];}
function unified_reclassify(int $id): void {
 $invoice=one('SELECT * FROM delivery_cash_invoices WHERE delivery_id=?',[$id]);if(!$invoice||(int)$invoice['accounting_model']===2)return;
 run('UPDATE delivery_cash_receipt_lines SET legacy_service_received=service_received WHERE receipt_id IN (SELECT id FROM delivery_cash_receipts WHERE delivery_id=?) AND loading_received=0 AND suzuki_received=0 AND legacy_service_received=0 AND service_received<>0',[$id]);
 $lines=query('SELECT b.*,di.loading_charge,di.suzuki_charge FROM delivery_cash_balances b JOIN delivery_items di ON di.id=b.delivery_item_id WHERE b.delivery_id=?',[$id]);
 $legacy=(bool)array_filter($lines,fn($l)=>(int)$l['service_received']!==0);$entries=[];
 if($invoice['posted_voucher_id']!==null){foreach($lines as $line){$service=(int)$line['service_due']-(int)$line['service_received'];if($legacy){$entries[]=unified_entry('SYS-LEGACY-SERVICE-RECEIVABLE',$service);}else{$entries[]=unified_entry('SYS-LOADING-RECEIVABLE',(int)$line['loading_charge']);$entries[]=unified_entry('SYS-SUZUKI-RECEIVABLE',(int)$line['suzuki_charge']);}$entries[]=unified_entry($line['account_id'],-$service);}}
 $journal=unified_journal(date('Y-m-d'),'Delivery service balance reclassification · '.$id,$entries);
 run('UPDATE delivery_cash_invoices SET accounting_model=2,legacy_services=?,reclassification_voucher_id=? WHERE delivery_id=?',[(int)$legacy,$journal,$id]);if($journal)audit('reclassified services','delivery',$id);
}
function migrate_delivery_unified(): void {
 $version=one("SELECT value FROM meta WHERE key='delivery_unified_version'")['value']??null;if($version==='6')return;if(in_array($version,['2','3','4','5'],true)){unified_date_migration();return;}
 if(!$version)transaction(function(){
  foreach(['accounting_model'=>'INTEGER NOT NULL DEFAULT 0','legacy_services'=>'INTEGER NOT NULL DEFAULT 0','reclassification_voucher_id'=>'INTEGER REFERENCES vouchers(id)'] as $key=>$definition)run('ALTER TABLE delivery_cash_invoices ADD COLUMN '.$key.' '.$definition);
  foreach(['loading_received','suzuki_received','legacy_service_received'] as $key)run('ALTER TABLE delivery_cash_receipt_lines ADD COLUMN '.$key.' INTEGER NOT NULL DEFAULT 0');
  run('UPDATE delivery_cash_receipt_lines SET legacy_service_received=service_received');
  run('ALTER TABLE delivery_cash_lines ADD COLUMN initial_bilty_received INTEGER NOT NULL DEFAULT 0');
  run('ALTER TABLE deliveries ADD COLUMN classification_auto INTEGER NOT NULL DEFAULT 0');
  run('CREATE TABLE delivery_unified_requests(request_key TEXT PRIMARY KEY,actor_id INTEGER NOT NULL,request_hash TEXT NOT NULL,result_json TEXT NOT NULL)');
  run('CREATE INDEX IF NOT EXISTS idx_legacy_ind_number ON legacy_IND(INDNO)');
  run('CREATE INDEX IF NOT EXISTS idx_legacy_delivery_header ON legacy_IND(INHNO,INTYPE)');
  run('CREATE INDEX IF NOT EXISTS idx_cash_submission_delivery ON cash_collection_submissions(delivery_id,status)');
  unified_accounts();foreach(query('SELECT delivery_id FROM delivery_cash_invoices ORDER BY delivery_id') as $row)unified_reclassify((int)$row['delivery_id']);
  run("INSERT INTO meta(key,value) VALUES('delivery_unified_version','1')");audit('migrated','unified_delivery','1');
 });
 unified_finish_migration();unified_date_migration();
}
function migrate_delivery_last_receipts(): void {
 if(one("SELECT value FROM meta WHERE key='delivery_last_receipts_version'"))return;
 transaction(function(){
  run('CREATE TABLE IF NOT EXISTS delivery_last_bilty_receipts(delivery_item_id INTEGER PRIMARY KEY REFERENCES delivery_items(id),amount INTEGER NOT NULL CHECK(amount>0),dated TEXT NOT NULL,receipt_floor INTEGER NOT NULL DEFAULT 0,recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  run("INSERT OR IGNORE INTO meta(key,value) VALUES('delivery_last_receipts_version','1')");
 });
}
function migrate_delivery_expenses(): void {
 if(one("SELECT value FROM meta WHERE key='delivery_expenses_version'"))return;
 transaction(function(){
  run('CREATE TABLE IF NOT EXISTS delivery_expenses(id INTEGER PRIMARY KEY AUTOINCREMENT,delivery_id INTEGER NOT NULL REFERENCES deliveries(id),operator_entry_id INTEGER NOT NULL UNIQUE REFERENCES operator_cash_entries(id))');
  run('CREATE INDEX IF NOT EXISTS idx_delivery_expenses_delivery ON delivery_expenses(delivery_id)');
  run("INSERT OR IGNORE INTO meta(key,value) VALUES('delivery_expenses_version','1')");
 });
}
function unified_enrich_lines(array $lines,int $id): array {
 $sums=array_column(query('SELECT l.delivery_item_id,SUM(l.loading_received) loading_received,SUM(l.suzuki_received) suzuki_received,SUM(l.legacy_service_received) legacy_service_received,MAX(CASE WHEN l.bilty_received>0 AND r.date_known=1 THEN COALESCE(l.bilty_received_date,r.dated) END) bilty_received_date,MAX(CASE WHEN l.loading_received>0 AND r.date_known=1 THEN COALESCE(l.loading_received_date,r.dated) END) loading_received_date,MAX(CASE WHEN l.suzuki_received>0 AND r.date_known=1 THEN COALESCE(l.suzuki_received_date,r.dated) END) suzuki_received_date,MAX(CASE WHEN l.legacy_service_received>0 AND r.date_known=1 THEN COALESCE(l.legacy_service_received_date,r.dated) END) legacy_received_date FROM delivery_cash_receipt_lines l JOIN delivery_cash_receipts r ON r.id=l.receipt_id WHERE r.delivery_id=? GROUP BY l.delivery_item_id',[$id]),null,'delivery_item_id');
 foreach($lines as &$line){$sum=$sums[$line['delivery_item_id']]??[];foreach(['loading_received','suzuki_received','legacy_service_received'] as $key)$line[$key]=(int)($sum[$key]??0);foreach(['bilty_received_date','loading_received_date','suzuki_received_date','legacy_received_date'] as $key)$line[$key]=$sum[$key]??null;
  $line['bilty_balance']=(int)$line['bilty_due']-(int)$line['bilty_received'];$line['service_balance']=(int)$line['service_due']-(int)$line['service_received'];$line['loading_balance']=$line['legacy_service_received']?null:(int)$line['loading']-$line['loading_received'];$line['suzuki_balance']=$line['legacy_service_received']?null:(int)$line['suzuki']-$line['suzuki_received'];
  $line['service_outstanding']=$line['legacy_service_received']?max(0,$line['service_balance']):max(0,(int)$line['loading_balance'])+max(0,(int)$line['suzuki_balance']);$line['service_credit']=$line['legacy_service_received']?max(0,-$line['service_balance']):max(0,-(int)$line['loading_balance'])+max(0,-(int)$line['suzuki_balance']);
  $line['payment_status']=unified_payment_status(max(0,$line['bilty_balance'])+$line['service_outstanding'],(int)$line['bilty_received']+(int)$line['service_received']);$line['walkin']=(int)($line['initial_bilty_received']??0)>0&&(int)$line['initial_bilty_received']>=max(0,(int)$line['bilty_due']);
 }unset($line);return $lines;
}
function unified_payment_status(int $outstanding,int $received): string {return $outstanding<=0?'fully_paid':($received>0?'partially_paid':'pending_payment');}
function unified_assess(int $id): void {
 $invoice=delivery_cash_invoice($id);if($invoice['header']['posted_voucher_id']!==null||!empty($invoice['header']['assessment_complete']))return;$entries=[];
 foreach($invoice['lines'] as $line){$entries[]=unified_entry($line['account_id'],(int)$line['bilty_due']);$entries[]=unified_entry('SYS-BILTY-CLEARING',-(int)$line['bilty_due']);
  foreach($invoice['header']['legacy_services']?['LEGACY-SERVICE'=>(int)$line['service_due']]:['LOADING'=>(int)$line['loading'],'SUZUKI'=>(int)$line['suzuki']] as $category=>$due){$entries[]=unified_entry('SYS-'.$category.'-RECEIVABLE',$due);$entries[]=unified_entry('SYS-'.$category.'-CLEARING',-$due);}
 }
 $voucher=unified_journal($invoice['header']['dated'],'Delivery assessment · '.$invoice['header']['reference'],$entries);
 run('UPDATE delivery_cash_invoices SET posted_voucher_id=?,assessment_complete=1 WHERE delivery_id=?',[$voucher,$id]);
}
function unified_cash_input(array $p,array $invoice,string $dated): array {
 $typed=[];$old=$p;$previous=array_column($invoice['lines'],null,'delivery_item_id');foreach($p['items']??[] as $row){if(!is_array($row))throw new InvalidArgumentException('Include every invoice bilty once.');$id=(int)($row['id']??0);$loading=money($row,'loading_received');$suzuki=money($row,'suzuki_received');$legacy=money($row,'legacy_service_received');
  if(!array_key_exists('loading_received',$row)&&!array_key_exists('suzuki_received',$row)&&!array_key_exists('legacy_service_received',$row))$legacy=money($row,'service_received');
  foreach(['bilty_received'=>money($row,'bilty_received'),'loading_received'=>$loading,'suzuki_received'=>$suzuki,'legacy_service_received'=>$legacy] as $field=>$value)if($value){$date=!empty($row[$field.'_date'])?day($row,$field.'_date'):$dated;$last=$previous[$id][$field==='legacy_service_received'?'legacy_received_date':$field.'_date']??null;if($date<$invoice['header']['dated']||($last&&$date<$last))throw new InvalidArgumentException('Cash receiving date cannot be earlier than delivery or a previous collection.');}
  $typed[$id]=[$loading,$suzuki,$legacy];}
 $old['items']=array_map(fn($row)=>['id'=>$row['id'],'bilty_received'=>$row['bilty_received']??'0','service_received'=>amount_decimal(array_sum($typed[(int)$row['id']]??[]))],$p['items']??[]);
 [$lines,$total,$account]=validate_delivery_cash_amounts($old,$invoice,$dated);return [$lines,$total,$account,$typed];
}
function amount_decimal(int $amount): string {return sprintf('%d.%02d',intdiv($amount,100),$amount%100);}
function unified_record_cash(array $p,array $user,bool $inside=false,int $approvalId=0): array {
 $save=function()use($p,$user,$approvalId){$id=(int)$p['delivery_id'];$key=text($p,'request_key',100,true);if(!preg_match('/^[a-zA-Z0-9-]{16,100}$/D',$key))throw new InvalidArgumentException('Invalid cash receipt request key.');$hash=shipment_version($p);
  $existing=one('SELECT * FROM delivery_cash_receipts WHERE request_key=?',[$key]);if($existing){if((int)$existing['delivery_id']!==$id||!hash_equals($existing['request_hash'],$hash))throw new RuntimeException('This cash request key was already used for different values.',409);return ['id'=>$existing['id'],'delivery_id'=>$id,'replayed'=>true];}
  $pending=one("SELECT id FROM cash_collection_submissions WHERE delivery_id=? AND status='pending'",[$id]);if($pending&&(int)$pending['id']!==$approvalId)throw new RuntimeException('A cash collection is already awaiting approval for this delivery.',409);
  if(!$approvalId&&one('SELECT id FROM cash_collection_submissions WHERE request_key=?',[$key]))throw new RuntimeException('This cash request key was already used for different values.',409);
  $invoice=delivery_cash_invoice($id);if(!hash_equals($invoice['version'],(string)($p['version']??'')))throw new RuntimeException('This cash invoice changed. Reopen it before collecting.',409);
  $dated=day($p);[$lines,$total,$cashAccount,$typed]=unified_cash_input($p,$invoice,$dated);
  $legacy=(bool)$invoice['header']['legacy_services'];if(!$legacy&&array_filter($typed,fn($v)=>$v[2]>0)){
   if($invoice['header']['posted_voucher_id']!==null){$entries=[];foreach($invoice['lines'] as $line){foreach(['LOADING'=>'loading_balance','SUZUKI'=>'suzuki_balance'] as $category=>$field){$due=(int)$line[$field];$entries[]=unified_entry('SYS-'.$category.'-RECEIVABLE',-$due);$entries[]=unified_entry('SYS-LEGACY-SERVICE-RECEIVABLE',$due);}}unified_journal($dated,'Legacy combined service collection · '.$invoice['header']['reference'],$entries);}
   run('UPDATE delivery_cash_invoices SET legacy_services=1 WHERE delivery_id=?',[$id]);$legacy=true;
  }
  unified_assess($id);$entries=$total?[[$cashAccount,$total,0]]:[];$transfers=[];
  foreach($invoice['lines'] as $line){$lineId=(int)$line['delivery_item_id'];[$bilty,$service]=$lines[$lineId];[$loading,$suzuki,$legacyCash]=$typed[$lineId];$entries[]=unified_entry($line['account_id'],-$bilty);if($legacy){$entries[]=unified_entry('SYS-LEGACY-SERVICE-RECEIVABLE',-$legacyCash);foreach(['LOADING'=>$loading,'SUZUKI'=>$suzuki] as $category=>$value){$transfers[]=unified_entry('SYS-'.$category.'-RECEIVABLE',$value);$transfers[]=unified_entry('SYS-LEGACY-SERVICE-RECEIVABLE',-$value);$entries[]=unified_entry('SYS-'.$category.'-RECEIVABLE',-$value);}}else{foreach(['LOADING'=>$loading,'SUZUKI'=>$suzuki] as $category=>$value)$entries[]=unified_entry('SYS-'.$category.'-RECEIVABLE',-$value);}}
  unified_journal($dated,'Assigned legacy service collection category · '.$invoice['header']['reference'],$transfers);
  $voucher=null;if($total)$voucher=delivery_system_voucher('RV',$dated,'Delivery collection · '.$invoice['header']['reference'],$entries);
  run('INSERT INTO delivery_cash_receipts(delivery_id,request_key,dated,cash_account_id,notes,created_by,voucher_id,request_hash) VALUES(?,?,?,?,?,?,?,?)',[$id,$key,$dated,$total?$cashAccount:null,text($p,'notes',500),$user['username'],$voucher,$hash]);$receipt=(int)db()->lastInsertId();
  foreach($lines as $lineId=>[$bilty,$service]){[$loading,$suzuki,$legacyCash]=$typed[$lineId];$dates=[];$source=null;foreach($p['items'] as $row)if((int)$row['id']===$lineId)$source=$row;foreach(['bilty_received'=>$bilty,'loading_received'=>$loading,'suzuki_received'=>$suzuki,'legacy_service_received'=>$legacyCash] as $field=>$value){$date=$value?(empty($source[$field.'_date'])?$dated:day($source,$field.'_date')):null;if($date&&$date<$invoice['header']['dated'])throw new InvalidArgumentException('Cash receiving date cannot be earlier than delivery or a previous collection.');$dates[]=$date;}
   run('INSERT INTO delivery_cash_receipt_lines(receipt_id,delivery_item_id,bilty_received,service_received,loading_received,suzuki_received,legacy_service_received,bilty_received_date,loading_received_date,suzuki_received_date,legacy_service_received_date) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[$receipt,$lineId,$bilty,$service,$loading,$suzuki,$legacyCash,...$dates]);run('UPDATE delivery_items SET bilty_received=bilty_received+?,service_received=service_received+? WHERE id=?',[$bilty,$service,$lineId]);if(!empty($p['initial']))run('UPDATE delivery_cash_lines SET initial_bilty_received=? WHERE delivery_item_id=?',[$bilty,$lineId]);}
  if(!empty($p['initial'])&&(int)$invoice['header']['classification_auto'])run("UPDATE deliveries SET delivery_mode=CASE WHEN EXISTS(SELECT 1 FROM delivery_cash_lines WHERE delivery_id=? AND initial_bilty_received>0 AND initial_bilty_received>=bilty_due) THEN 'walkin' ELSE 'standard' END WHERE id=?",[$id,$id]);
  operator_cash_record_receipt($receipt,$user);
  audit('received cash','delivery',$id);return ['id'=>$receipt,'delivery_id'=>$id,'voucher_id'=>$voucher];
 };return $inside?$save():transaction($save);
}
// Compatibility entry point: operator collections now post immediately.
function unified_submit_cash(array $p,array $user,bool $inside=false): array {
 return unified_record_cash($p,$user,$inside);
}

function unified_finish_migration(): void {
 transaction(function(){
 run(unified_view_sql());
 // Imported opening balances were already assessed historically. Move only the
 // outstanding service portion, leaving every original ledger row untouched.
 $entries=[];$total=0;foreach(query('SELECT l.account_id,SUM(l.service_due-l.service_received) balance FROM delivery_unified_lines l JOIN deliveries d ON d.id=l.delivery_id WHERE d.cash_workflow=0 GROUP BY l.account_id HAVING balance<>0') as $row){$balance=(int)$row['balance'];$entries[]=unified_entry($row['account_id'],-$balance);$total+=$balance;}
 $entries[]=unified_entry('SYS-LEGACY-SERVICE-RECEIVABLE',$total);$voucher=unified_journal(date('Y-m-d'),'Imported delivery service balances reclassification',$entries);
 run("INSERT OR REPLACE INTO meta(key,value) VALUES('unified_legacy_reclass_voucher',?)",[(string)($voucher??'')]);run("INSERT OR REPLACE INTO meta(key,value) VALUES('delivery_unified_version','2')");
 });
}
function unified_adopt(int $id): void {
 $header=one('SELECT * FROM deliveries WHERE id=?',[$id]);if(!$header)throw new InvalidArgumentException('Delivery not found.');
 if((int)$header['cash_workflow']){unified_reclassify($id);return;}
 $lines=query('SELECT * FROM delivery_unified_lines WHERE delivery_id=? ORDER BY delivery_item_id',[$id]);
 run('INSERT INTO delivery_cash_invoices(delivery_id,accounting_model,legacy_services,assessment_complete) VALUES(?,2,1,1)',[$id]);
 $legacyHeader=$header['legacy_id']?one("SELECT REC_DATE1 FROM legacy_INH WHERE INHNO=? AND INTYPE='GD'",[$header['legacy_id']]):null;$dated=substr((string)($legacyHeader['REC_DATE1']??$header['dated']),0,10);if(!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$dated))$dated=$header['dated'];
 $receipts=[];
 foreach($lines as $line){run('INSERT INTO delivery_cash_lines(delivery_item_id,delivery_id,account_id,bilty,party_to,bilty_due,service_due,bilty_amount,godown,advance) VALUES(?,?,?,?,?,?,?,?,?,?)',[$line['delivery_item_id'],$id,$line['account_id'],$line['bilty'],$line['party_to']??'',$line['bilty_due'],$line['service_due'],$line['bilty_amount'],$line['godown'],$line['advance']]);run('UPDATE delivery_items SET loading_charge=?,suzuki_charge=? WHERE id=?',[$line['loading'],$line['suzuki'],$line['delivery_item_id']]);
  if($line['bilty_received']||$line['service_received']){$original=substr((string)($line['legacy_received_date']?:($legacyHeader['REC_DATE1']??'')),0,10);$known=(bool)preg_match('/^\d{4}-\d{2}-\d{2}$/D',$original);$date=$known?$original:$header['dated'];$group=$date.'-'.(int)$known;
   if(!isset($receipts[$group])){run('INSERT INTO delivery_cash_receipts(delivery_id,request_key,dated,notes,created_by,request_hash,date_known) VALUES(?,?,?,?,?,?,?)',[$id,'legacy-opening-'.$id.'-'.$group,$date,'Opening collections retained from original delivery'.($known?'':'; receipt date not recorded'),'Legacy import',hash('sha256','legacy-'.$id.'-'.$group),(int)$known]);$receipts[$group]=(int)db()->lastInsertId();}
   run('INSERT INTO delivery_cash_receipt_lines(receipt_id,delivery_item_id,bilty_received,service_received,legacy_service_received) VALUES(?,?,?,?,?)',[$receipts[$group],$line['delivery_item_id'],$line['bilty_received'],$line['service_received'],$line['service_received']]);
  }
 }
 run('UPDATE deliveries SET cash_workflow=1 WHERE id=?',[$id]);audit('adopted legacy history','delivery',$id);
}
function unified_document(int $id): array {
 transaction(fn()=>unified_adopt($id));$invoice=delivery_cash_invoice($id);
 $invoice['delivery_expenses']=query('SELECT e.id,e.amount,e.notes,e.dated,e.actor_name,u.full_name operator_name,u.username FROM delivery_expenses x JOIN operator_cash_entries e ON e.id=x.operator_entry_id JOIN users u ON u.id=e.operator_id WHERE x.delivery_id=? ORDER BY e.id DESC',[$id]);
 $current=current_user();$invoice['expense_operators']=$current['role']==='super_admin'?query("SELECT id,username,full_name FROM users WHERE role='operations' AND active=1 ORDER BY full_name,username"):[];
 $invoice['expense_accounts']=query("SELECT id,name FROM accounts WHERE status='A' AND id LIKE '5-%' ORDER BY name,id");
 $last=array_column(query('SELECT x.* FROM delivery_last_bilty_receipts x JOIN delivery_items di ON di.id=x.delivery_item_id WHERE di.delivery_id=? AND NOT EXISTS(SELECT 1 FROM delivery_cash_receipt_lines newer WHERE newer.delivery_item_id=x.delivery_item_id AND newer.receipt_id>x.receipt_floor AND newer.bilty_received>0)',[$id]),null,'delivery_item_id');foreach($invoice['lines'] as &$line){$saved=$last[$line['delivery_item_id']]??null;if($saved){$line['last_bilty_received']=(int)$saved['amount'];$line['last_bilty_received_date']=$saved['dated'];}}unset($line);
 $invoice['cash_accounts']=query("SELECT id,name FROM accounts WHERE status='A' AND (id LIKE '1-101-%' OR id LIKE '1-106-%') ORDER BY id");
 foreach($invoice['receipts'] as &$receipt)$receipt['items']=query('SELECT * FROM delivery_cash_receipt_lines WHERE receipt_id=? ORDER BY delivery_item_id',[$receipt['id']]);unset($receipt);
 $invoice['previous_collections']=query('SELECT r.*,d.reference target_reference,c.amount amount,a.name cash_account FROM delivery_customer_collections c JOIN delivery_cash_receipts r ON r.id=c.receipt_id JOIN deliveries d ON d.id=r.delivery_id LEFT JOIN accounts a ON a.id=r.cash_account_id WHERE c.source_delivery_id=? ORDER BY r.dated,r.id',[$id]);foreach($invoice['previous_collections'] as &$receipt)$receipt['items']=query('SELECT r.*,b.bilty FROM delivery_cash_receipt_lines r JOIN delivery_cash_lines b ON b.delivery_item_id=r.delivery_item_id WHERE r.receipt_id=? ORDER BY r.delivery_item_id',[$receipt['id']]);unset($receipt);
 $invoice['previous_id']=one('SELECT id FROM deliveries WHERE id<? ORDER BY id DESC LIMIT 1',[$id])['id']??null;$invoice['next_id']=one('SELECT id FROM deliveries WHERE id>? ORDER BY id LIMIT 1',[$id])['id']??null;return $invoice;
}
function unified_list(): array {
 $args=[];$where=' WHERE 1=1';if(!empty($_GET['search'])){$where.=" AND (d.reference LIKE ? ESCAPE '\\' OR d.receiver LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM delivery_unified_lines x WHERE x.delivery_id=d.id AND (x.bilty LIKE ? ESCAPE '\\' OR x.customer LIKE ? ESCAPE '\\' OR x.party_to LIKE ? ESCAPE '\\')))";$args=array_fill(0,5,pattern());}$where.=rangeWhere('d.dated',$args);
 $base="WITH selected AS (SELECT d.id FROM deliveries d".$where."), totals AS (SELECT delivery_id,COUNT(*) bilties,SUM(qty) quantity,SUM(bilty_amount) bilty_amount,SUM(godown) godown,SUM(bilty_due) bilty_due,SUM(loading) loading,SUM(suzuki) suzuki,SUM(bilty_received) bilty_received,SUM(service_received) service_received,SUM(MAX(0,bilty_due-bilty_received)) bilty_outstanding,SUM(CASE WHEN legacy_service_received<>0 THEN MAX(0,service_due-service_received) ELSE MAX(0,loading-loading_received)+MAX(0,suzuki-suzuki_received) END) service_outstanding FROM delivery_unified_lines WHERE delivery_id IN (SELECT id FROM selected) GROUP BY delivery_id), docs AS (SELECT d.*,t.*,(t.bilty_received+t.service_received) collected,(t.bilty_outstanding+t.service_outstanding) outstanding,(SELECT COUNT(*) FROM cash_collection_submissions c WHERE c.delivery_id=d.id AND c.status='pending') pending_cash FROM deliveries d JOIN totals t ON t.delivery_id=d.id) ";
 $filter=match(text($_GET,'payment_status',30)){'fully_paid'=>' WHERE outstanding=0','partially_paid'=>' WHERE outstanding>0 AND collected>0','pending_payment'=>' WHERE outstanding>0 AND collected=0','cleared'=>' WHERE bilty_outstanding=0','walkin'=>" WHERE delivery_mode='walkin'",'pending_approval'=>' WHERE pending_cash>0',default=>''};
 if(isset($_GET['min_outstanding'])&&$_GET['min_outstanding']!==''){$filter.=($filter?' AND ':' WHERE ').'outstanding>=CAST(? AS INTEGER)';$args[]=money($_GET,'min_outstanding');}
 $stats=one($base.'SELECT COUNT(*) total,COALESCE(SUM(bilty_due),0) bilty_due,COALESCE(SUM(bilty_received),0) bilty_received,COALESCE(SUM(service_received),0) service_received,COALESCE(SUM(bilty_outstanding),0) customer_balance,COALESCE(SUM(service_outstanding),0) service_balance,COALESCE(SUM(bilties),0) bilties,COALESCE(SUM(quantity),0) quantity,COALESCE(SUM(loading+suzuki),0) service_due,COALESCE(SUM(collected),0) collected,COALESCE(SUM(outstanding),0) outstanding,COALESCE(SUM(outstanding=0),0) fully_paid,COALESCE(SUM(outstanding>0 AND collected>0),0) partially_paid,COALESCE(SUM(outstanding>0 AND collected=0),0) pending_payment FROM docs'.$filter,$args);$page=max(0,min(max(0,(int)ceil($stats['total']/30)-1),(int)($_GET['page']??0)));
 $order=match(text($_GET,'sort',30)){'oldest'=>'dated ASC,id ASC','balance_high'=>'outstanding DESC,dated DESC,id DESC','received_high'=>'collected DESC,dated DESC,id DESC',default=>'dated DESC,id DESC'};
 $rowBase=$base;$offset=$page*30;
 // With date ordering and no balance/status filter, aggregate only this page's documents.
 if(!$filter&&in_array(text($_GET,'sort',30),['','newest','oldest'],true)){
  $selected='SELECT d.id FROM deliveries d'.$where;
  $direction=text($_GET,'sort',30)==='oldest'?'ASC':'DESC';
  $rowBase=str_replace($selected.')',$selected.' AND EXISTS(SELECT 1 FROM delivery_items page_item WHERE page_item.delivery_id=d.id) ORDER BY d.dated '.$direction.',d.id '.$direction.' LIMIT 30 OFFSET '.$offset.')',$base);$offset=0;
 }
 $rows=query($rowBase.'SELECT * FROM docs'.$filter.' ORDER BY '.$order.' LIMIT 30 OFFSET '.$offset,$args);$previews=[];if($rows){$ids=array_column($rows,'id');$marks=implode(',',array_fill(0,count($ids),'?'));foreach(query('SELECT delivery_id,bilty FROM (SELECT delivery_id,bilty,ROW_NUMBER() OVER(PARTITION BY delivery_id ORDER BY delivery_item_id) position FROM delivery_unified_lines WHERE delivery_id IN ('.$marks.')) WHERE position<=3 ORDER BY delivery_id,position',$ids) as $item)$previews[$item['delivery_id']][]=$item['bilty'];}
 foreach($rows as &$row){$row['payment_status']=unified_payment_status((int)$row['outstanding'],(int)$row['collected']);$row['bilty_preview']=$previews[$row['id']]??[];}unset($row);
 return ['rows'=>$rows,'stats'=>$stats,'total'=>(int)$stats['total'],'page'=>$page,'page_size'=>30];
}
function unified_edit(int $id,array $p,array $user): void {
 $invoice=delivery_cash_invoice($id);if(!hash_equals($invoice['version'],(string)($p['version']??'')))throw new RuntimeException('This cash invoice changed. Reopen it before collecting.',409);
 $header=$invoice['header'];$dated=day($p);$receiver=text($p,'receiver',100,true);$changed=$dated!==$header['dated']||$receiver!==$header['receiver']||text($p,'mobile',30)!==(string)($header['mobile']??'')||text($p,'cnic',30)!==(string)($header['cnic']??'')||text($p,'remarks',500)!==(string)($header['remarks']??'');
 if($dated!==$header['dated']&&($invoice['receipts']||!empty($header['assessment_complete'])))throw new RuntimeException('Cash processing has started. The handover date is locked.',409);
 $input=$p['items']??[];if(count($input)!==count($invoice['lines']))throw new InvalidArgumentException('Keep the original bilties in this delivery.');$allowed=array_column($invoice['lines'],null,'delivery_item_id');$seen=[];$entries=[];
 foreach($input as $row){$lineId=(int)($row['id']??0);if(!isset($allowed[$lineId])||isset($seen[$lineId]))throw new InvalidArgumentException('Keep the original bilties in this delivery.');$seen[$lineId]=true;$old=$allowed[$lineId];$discount=money($row,'discount');$loading=money($row,'loading');$suzuki=money($row,'suzuki');
  if($discount!==$old['discount']||$loading!==$old['loading']||$suzuki!==$old['suzuki']){$changed=true;if(!can_access($user,'deliveries.edit'))throw new RuntimeException('You do not have permission to edit deliveries.',403);$delta=(int)$old['discount']-$discount;if($header['posted_voucher_id']!==null||!empty($header['assessment_complete'])){$entries[]=unified_entry($old['account_id'],$delta);$entries[]=unified_entry('SYS-BILTY-CLEARING',-$delta);foreach(['LOADING'=>$loading-(int)$old['loading'],'SUZUKI'=>$suzuki-(int)$old['suzuki']] as $category=>$difference){$control=$header['legacy_services']?'LEGACY-SERVICE':$category;$entries[]=unified_entry('SYS-'.$control.'-RECEIVABLE',$difference);$entries[]=unified_entry('SYS-'.$category.'-CLEARING',-$difference);}}
   run('UPDATE delivery_items SET discount=?,loading_charge=?,suzuki_charge=? WHERE id=?',[$discount,$loading,$suzuki,$lineId]);run('UPDATE delivery_cash_lines SET bilty_due=bilty_due+?,service_due=? WHERE delivery_item_id=?',[$delta,$loading+$suzuki,$lineId]);}
 }
 if($changed){if(!can_access($user,'deliveries.edit'))throw new RuntimeException('You do not have permission to edit deliveries.',403);unified_journal(date('Y-m-d'),'Delivery charge correction · '.$header['reference'],$entries);$before=delivery_snapshot($id);run('UPDATE deliveries SET dated=?,receiver=?,mobile=?,cnic=?,remarks=? WHERE id=?',[$dated,$receiver,text($p,'mobile',30),text($p,'cnic',30),text($p,'remarks',500),$id]);run('INSERT INTO delivery_revisions(delivery_id,actor,before_json,after_json) VALUES(?,?,?,?)',[$id,$user['username'],json_encode($invoice,JSON_THROW_ON_ERROR),json_encode(delivery_snapshot($id),JSON_THROW_ON_ERROR)]);audit('updated','delivery',$id);}
}
// One service cash entry; allocate against unpaid loading first, then Suzuki.
// Historical combined service accounts retain their existing classification.
function unified_service_allocation(array $line,int $received,bool $legacy): array {
 if($legacy)return [0,0,$received];
 $loading=min($received,max(0,(int)$line['loading']-(int)$line['loading_received']));
 return [$loading,$received-$loading,0];
}
function unified_save(array $p,array $user): array {
 $key=text($p,'request_key',100,true);if(!preg_match('/^[a-zA-Z0-9-]{16,100}$/D',$key))throw new InvalidArgumentException('Invalid cash receipt request key.');$hash=shipment_version($p);
 return transaction(function()use($p,$user,$key,$hash){$existing=one('SELECT * FROM delivery_unified_requests WHERE request_key=?',[$key]);if($existing){if((int)$existing['actor_id']!==(int)$user['id']||!hash_equals($existing['request_hash'],$hash))throw new RuntimeException('This cash request key was already used for different values.',409);return [...json_decode($existing['result_json'],true,64,JSON_THROW_ON_ERROR),'replayed'=>true];}
  $id=(int)($p['id']??0);$initial=!$id;$input=$p['items']??[];if(!is_array($input)||!$input||count($input)>1000)throw new InvalidArgumentException('Select between 1 and 1000 pending bilties.');
  if(!$id){require_permission($user,'deliveries.create');$handover=$p;unset($handover['walkin_cash']);$handover['delivery_mode']='standard';$handover['items']=array_map(function($row){$row['bilty_received']='0';$row['service_received']='0';return $row;},$input);$result=create_delivery_entry($handover,$user,true);$id=(int)$result['id'];run('UPDATE deliveries SET classification_auto=1 WHERE id=?',[$id]);run('UPDATE delivery_cash_invoices SET accounting_model=2 WHERE delivery_id=?',[$id]);}
  else{unified_adopt($id);unified_edit($id,$p,$user);}
  if($initial)unified_assess($id);
  $invoice=delivery_cash_invoice($id);$map=$initial?array_column(query('SELECT item_id,id FROM delivery_items WHERE delivery_id=?',[$id]),'id','item_id'):[];$cashItems=[];$total=0;$cashLines=array_column($invoice['lines'],null,'delivery_item_id');
  foreach($input as $row){$lineId=$initial?($map[(int)$row['id']]??0):(int)$row['id'];$item=['id'=>$lineId];
   if(array_key_exists('service_received',$row)){
    foreach(['loading_received','suzuki_received','legacy_service_received'] as $field)if(money($row,$field)>0)throw new InvalidArgumentException('Enter service cash once in REC S AMT.');
    $line=$cashLines[$lineId]??null;if(!$line)throw new InvalidArgumentException('A cash line does not belong to this delivery.');
    $allocated=unified_service_allocation($line,money($row,'service_received'),(bool)$invoice['header']['legacy_services']);
    foreach(['loading_received','suzuki_received','legacy_service_received'] as $index=>$field){$row[$field]=amount_decimal($allocated[$index]);$row[$field.'_date']=$row['service_received_date']??null;}
   }
foreach(['bilty_received','loading_received','suzuki_received','legacy_service_received'] as $field){$value=money($row,$field);$item[$field]=amount_decimal($value);$total+=$value;$item[$field.'_date']=!empty($row[$field.'_date'])?day($row,$field.'_date'):null;}$cashItems[]=$item;}
  $pending=one("SELECT id FROM cash_collection_submissions WHERE delivery_id=? AND status='pending'",[$id]);if($pending&&($total||$initial))throw new RuntimeException('A cash collection is already awaiting approval for this delivery.',409);
  $result=['id'=>$id,'reference'=>$invoice['header']['reference'],'pending_cash'=>false];
  if(!empty($p['include_previous_balances'])){if($user['role']!=='super_admin'&&!can_submit_delivery_cash($user))throw new RuntimeException('Cash receiving access is required.',403);$allocation=unified_collect_previous($p,$invoice,$cashItems,$user);$cashItems=$allocation['items'];$result['previous_collected']=$allocation['previous_collected'];$result['previous_receipts']=$allocation['previous_receipts'];$total=array_sum(array_map(fn($item)=>money($item,'bilty_received')+money($item,'loading_received')+money($item,'suzuki_received')+money($item,'legacy_service_received'),$cashItems));}
  if($total>0&&!$pending){if($user['role']!=='super_admin'&&!can_submit_delivery_cash($user))throw new RuntimeException('Walk-in delivery requires cash receiving access.',403);$cash=['delivery_id'=>$id,'version'=>$invoice['version'],'request_key'=>'unified-cash-'.hash('sha256',$key),'dated'=>!empty($p['received_date'])?day($p,'received_date'):date('Y-m-d'),'cash_account_id'=>text($p,'cash_account_id',40),'notes'=>text($p,'notes',500),'items'=>$cashItems,'initial'=>$initial];$recorded=unified_record_cash($cash,$user,true);$result['pending_cash']=!empty($recorded['pending']);$result['cash_id']=$recorded['id'];}
  $expense=money($p,'delivery_expense');if($expense){
   if($initial||!operator_cash_allowed($user))throw new RuntimeException('Only a munshi or super admin can add expenses to an existing delivery.',403);
   $operatorId=(int)($p['expense_operator_id']??0);if($user['role']==='super_admin'&&!$operatorId){$operators=query("SELECT id FROM users WHERE role='operations' AND active=1 LIMIT 2");if(count($operators)===1)$operatorId=(int)$operators[0]['id'];}
   $owner=operator_cash_owner($user,['operator_id'=>$operatorId]);if(!$owner||empty($owner['active']))throw new InvalidArgumentException('Choose an active munshi for this expense.');
   $note=text($p,'expense_note',500,true);$cash=text($p,'cash_account_id',40,true);$dated=!empty($p['received_date'])?day($p,'received_date'):date('Y-m-d');if($dated>date('Y-m-d'))throw new InvalidArgumentException('Expense date cannot be in the future.');
   if(!one("SELECT id FROM accounts WHERE id=? AND status='A' AND (id LIKE '1-101-%' OR id LIKE '1-106-%')",[$cash]))throw new InvalidArgumentException('Choose an active cash or bank account.');
   $expenseAccount=text($p,'expense_account_id',40,true);if(!one("SELECT id FROM accounts WHERE id=? AND status='A' AND id LIKE '5-%'",[$expenseAccount]))throw new InvalidArgumentException('Choose an active expense account.');
   $period=operator_cash_open((int)$owner['id'],true);$title='Delivery expense · '.$invoice['header']['reference'];$voucher=delivery_system_voucher('PV',$dated,$title,[[$expenseAccount,$expense,0],[$cash,0,$expense]]);
   run("INSERT INTO operator_cash_entries(period_id,operator_id,kind,dated,amount,title,notes,cash_account_id,expense_account_id,voucher_id,actor_id,actor_name) VALUES(?,?,'expense',?,?,?,?,?,?,?,?,?)",[$period['id'],$owner['id'],$dated,$expense,$title,$note,$cash,$expenseAccount,$voucher,$user['id'],$user['username']]);$expenseId=(int)db()->lastInsertId();run('INSERT INTO delivery_expenses(delivery_id,operator_entry_id) VALUES(?,?)',[$id,$expenseId]);audit('recorded delivery expense','operator_cash',$expenseId);$result['expense_id']=$expenseId;
  }
  // Preserve the amount actually entered, including cash allocated to older bilties.
  // Zero-value saves must not erase the last genuine collection.
  if(empty($result['pending_cash']))foreach($input as $row){$received=money($row,'bilty_received');if($received>0){$lineId=$initial?($map[(int)$row['id']]??0):(int)$row['id'];$date=!empty($row['bilty_received_date'])?day($row,'bilty_received_date'):(!empty($p['received_date'])?day($p,'received_date'):date('Y-m-d'));run('INSERT INTO delivery_last_bilty_receipts(delivery_item_id,amount,dated,receipt_floor) VALUES(?,?,?,?) ON CONFLICT(delivery_item_id) DO UPDATE SET amount=excluded.amount,dated=excluded.dated,receipt_floor=excluded.receipt_floor,recorded_at=CURRENT_TIMESTAMP',[$lineId,$received,$date,(int)(one('SELECT MAX(id) id FROM delivery_cash_receipts')['id']??0)]);}}
  run('INSERT INTO delivery_unified_requests(request_key,actor_id,request_hash,result_json) VALUES(?,?,?,?)',[$key,$user['id'],$hash,json_encode($result,JSON_THROW_ON_ERROR)]);return $result;
 });
}
function delivery_unified_routes(string $action,string $method,array $p,array $user): void {
 if($action==='unified_customer_balances'&&$method==='GET'){$args=[];$where='';if(!empty($_GET['search'])){$where=" WHERE a.name LIKE ? ESCAPE '\\' OR a.id LIKE ? ESCAPE '\\'";$args=[pattern(),pattern()];}$base='WITH balances AS(SELECT l.account_id,a.name customer,SUM(CASE WHEN l.bilty_due-l.bilty_received>0 THEN 1 ELSE 0 END) bilties,SUM(MAX(0,l.bilty_due-l.bilty_received)) outstanding,SUM(MAX(0,l.bilty_received-l.bilty_due)) credit FROM delivery_unified_lines l JOIN accounts a ON a.id=l.account_id'.$where.' GROUP BY l.account_id HAVING outstanding>0 OR credit>0) ';$total=(int)one($base.'SELECT COUNT(*) n FROM balances',$args)['n'];$page=max(0,min(max(0,(int)ceil($total/30)-1),(int)($_GET['page']??0)));response(['rows'=>query($base.'SELECT * FROM balances ORDER BY outstanding DESC LIMIT 30 OFFSET '.($page*30),$args),'total'=>$total,'page'=>$page,'page_size'=>30]);}
 if($action==='unified_deliveries'&&$method==='GET')response(unified_list());
 if($action==='unified_delivery'&&$method==='GET')response(unified_document((int)($_GET['id']??0)));
 if($action==='save_unified_delivery'&&$method==='POST')response(unified_save($p,$user),201);
}

function unified_date_migration(): void {
 transaction(function(){
  $columns=array_column(query('PRAGMA table_info(delivery_cash_receipt_lines)'),'name');
  $invoiceColumns=array_column(query('PRAGMA table_info(delivery_cash_invoices)'),'name');if(!in_array('assessment_complete',$invoiceColumns,true))run('ALTER TABLE delivery_cash_invoices ADD COLUMN assessment_complete INTEGER NOT NULL DEFAULT 0');run('UPDATE delivery_cash_invoices SET assessment_complete=1 WHERE posted_voucher_id IS NOT NULL');
  $receiptColumns=array_column(query('PRAGMA table_info(delivery_cash_receipts)'),'name');if(!in_array('date_known',$receiptColumns,true))run('ALTER TABLE delivery_cash_receipts ADD COLUMN date_known INTEGER NOT NULL DEFAULT 1');
  run('DROP VIEW IF EXISTS delivery_unified_lines');run(unified_view_sql());
  foreach(['bilty_received_date','loading_received_date','suzuki_received_date','legacy_service_received_date'] as $key)if(!in_array($key,$columns,true))run('ALTER TABLE delivery_cash_receipt_lines ADD COLUMN '.$key.' TEXT');
  foreach(['bilty_received','loading_received','suzuki_received','legacy_service_received'] as $key)run('UPDATE delivery_cash_receipt_lines SET '.$key.'_date=(SELECT dated FROM delivery_cash_receipts WHERE id=receipt_id) WHERE '.$key.'<>0 AND '.$key.'_date IS NULL');
  run("UPDATE meta SET value='6' WHERE key='delivery_unified_version'");
 });
}

function unified_view_sql(): string {return "CREATE VIEW IF NOT EXISTS delivery_unified_lines AS WITH base AS (SELECT d.id delivery_id,di.id delivery_item_id,di.item_id,COALESCE(b.account_id,i.account_id) account_id,a.name customer,COALESCE(b.bilty,CAST(li.BILLTYNO AS TEXT),i.bilty) bilty,COALESCE(b.party_to,li.PARTY_TO,i.party_to) party_to,COALESCE(li.QTY,i.qty) qty,i.detail,i.goods_category_id,i.goods_subcategory_id,i.goods_custom,s.dated arrival_date,st.name station,li.REC_DATE legacy_received_date,COALESCE(b.bilty_amount,CAST(ROUND(li.BILLTY_AMT*100) AS INTEGER),i.bilty_amount) bilty_amount,COALESCE(b.godown,CAST(ROUND(li.GODOWN_CHG*100) AS INTEGER),i.godown) godown,CASE WHEN d.legacy_id IS NOT NULL THEN 0 ELSE COALESCE(b.advance,i.advance) END advance,di.discount,COALESCE(di.loading_charge,CAST(ROUND(li.LOADING_AMT*100) AS INTEGER),i.loading) loading,COALESCE(di.suzuki_charge,CAST(ROUND(li.SUZUKI_KIRAYA*100) AS INTEGER),i.suzuki) suzuki,di.bilty_received,di.service_received,COALESCE(rr.loading_received,0) loading_received,COALESCE(rr.suzuki_received,0) suzuki_received,CASE WHEN d.cash_workflow=0 THEN di.service_received ELSE COALESCE(rr.legacy_service_received,0) END legacy_service_received FROM deliveries d JOIN delivery_items di ON di.delivery_id=d.id JOIN items i ON i.id=di.item_id LEFT JOIN delivery_cash_lines b ON b.delivery_item_id=di.id LEFT JOIN (SELECT delivery_item_id,SUM(loading_received) loading_received,SUM(suzuki_received) suzuki_received,SUM(legacy_service_received) legacy_service_received FROM delivery_cash_receipt_lines GROUP BY delivery_item_id) rr ON rr.delivery_item_id=di.id LEFT JOIN legacy_IND li ON li.INDNO=di.legacy_id LEFT JOIN accounts a ON a.id=COALESCE(b.account_id,i.account_id) JOIN shipments s ON s.id=i.shipment_id LEFT JOIN stations st ON st.id=s.station_id) SELECT *,bilty_amount+godown-advance-discount bilty_due,loading+suzuki service_due FROM base";}

function migrate_delivery_customer_collections(): void {
 if(one("SELECT value FROM meta WHERE key='delivery_customer_collections_version'"))return;
 transaction(function(){
  run('CREATE TABLE IF NOT EXISTS delivery_customer_collections(id INTEGER PRIMARY KEY AUTOINCREMENT,source_delivery_id INTEGER NOT NULL REFERENCES deliveries(id),source_request_key TEXT NOT NULL,receipt_id INTEGER NOT NULL UNIQUE REFERENCES delivery_cash_receipts(id),amount INTEGER NOT NULL CHECK(amount>0),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  run('CREATE INDEX IF NOT EXISTS idx_customer_collection_source ON delivery_customer_collections(source_delivery_id)');
  run("INSERT OR IGNORE INTO meta(key,value) VALUES('delivery_customer_collections_version','1')");
 });
}
function delivery_customer_debts(array $accounts,int $exclude): array {
 $marks=implode(',',array_fill(0,count($accounts),'?'));
 return query("SELECT l.delivery_id,l.delivery_item_id,l.account_id,l.bilty_due-l.bilty_received balance,d.dated,(SELECT COUNT(*) FROM cash_collection_submissions s WHERE s.delivery_id=d.id AND s.status='pending') pending_cash FROM delivery_unified_lines l JOIN deliveries d ON d.id=l.delivery_id WHERE l.account_id IN ($marks) AND l.delivery_id<>? AND l.bilty_due>l.bilty_received AND NOT(d.delivery_mode='walkin' AND NOT EXISTS(SELECT 1 FROM delivery_cash_receipts vr WHERE vr.delivery_id=d.id) AND EXISTS(SELECT 1 FROM cash_collection_submissions vs WHERE vs.delivery_id=d.id)) ORDER BY l.account_id,d.dated,l.delivery_id,l.delivery_item_id",[...$accounts,$exclude]);
}
// Runs inside unified_save's transaction. Cash stays on the original bill/ledger;
// only a link is added to the entry where the operator collected the money.
function unified_collect_previous(array $p,array $invoice,array $items,array $user): array {
 $accounts=array_values(array_unique(array_column($invoice['lines'],'account_id')));$debts=delivery_customer_debts($accounts,(int)$invoice['header']['id']);
 if(!hash_equals(shipment_version($debts),(string)($p['previous_balance_version']??'')))throw new RuntimeException('Customer balances changed. Refresh balances and try again.',409);
 $lines=array_column($invoice['lines'],null,'delivery_item_id');$overflow=[];
 foreach($items as $index=>&$item){$line=$lines[$item['id']]??null;if(!$line)throw new InvalidArgumentException('A cash line does not belong to this delivery.');$entered=money($item,'bilty_received');$current=min($entered,max(0,(int)$line['bilty_due']-(int)$line['bilty_received']));$item['bilty_received']=amount_decimal($current);if($entered>$current)$overflow[$line['account_id']][]=['index'=>$index,'remaining'=>$entered-$current,'date'=>$item['bilty_received_date']??null];}unset($item);
 $groups=[];
 foreach($debts as $debt){$account=$debt['account_id'];if(empty($overflow[$account]))continue;$owing=(int)$debt['balance'];foreach($overflow[$account] as &$source){$take=min($owing,$source['remaining']);if(!$take)continue;$target=(int)$debt['delivery_id'];$line=(int)$debt['delivery_item_id'];$groups[$target][$line]??=['received'=>0,'date'=>null];$groups[$target][$line]['received']+=$take;if($source['date'])$groups[$target][$line]['date']=max($groups[$target][$line]['date']??'',$source['date']);$source['remaining']-=$take;$owing-=$take;if(!$owing)break;}unset($source);}
 // Retain supported overpayments as credit only after this customer's old debt.
 foreach($overflow as $sources)foreach($sources as $source)if($source['remaining'])$items[$source['index']]['bilty_received']=amount_decimal(money($items[$source['index']],'bilty_received')+$source['remaining']);
 $receipts=[];$previousTotal=0;
 foreach($groups as $target=>$allocated){unified_adopt((int)$target);$old=delivery_cash_invoice((int)$target);$receiptItems=[];$total=0;foreach($old['lines'] as $line){$part=$allocated[$line['delivery_item_id']]??['received'=>0,'date'=>null];$total+=$part['received'];$receiptItems[]=['id'=>$line['delivery_item_id'],'bilty_received'=>amount_decimal($part['received']),'bilty_received_date'=>$part['date'],'loading_received'=>'0','suzuki_received'=>'0','legacy_service_received'=>'0'];}
  $cash=['delivery_id'=>(int)$target,'version'=>$old['version'],'request_key'=>'unified-prior-'.hash('sha256',$p['request_key'].'-'.$target),'dated'=>!empty($p['received_date'])?day($p,'received_date'):date('Y-m-d'),'cash_account_id'=>text($p,'cash_account_id',40),'notes'=>mb_substr('Previous balance collected with '.$invoice['header']['reference'].'. '.text($p,'notes',500),0,500),'items'=>$receiptItems];
  $receipt=unified_record_cash($cash,$user,true);run('INSERT INTO delivery_customer_collections(source_delivery_id,source_request_key,receipt_id,amount) VALUES(?,?,?,?)',[$invoice['header']['id'],$p['request_key'],$receipt['id'],$total]);$receipts[]=$receipt['id'];$previousTotal+=$total;
 }
 return ['items'=>$items,'previous_collected'=>$previousTotal,'previous_receipts'=>$receipts];
}

// Read-only print figures: current customer debt, not historical/as-of balances.
function delivery_print_balances(int $id,array $user): array {
 $lines=query('SELECT l.*,di.legacy_id print_source_id FROM delivery_unified_lines l JOIN delivery_items di ON di.id=l.delivery_item_id WHERE l.delivery_id=? ORDER BY l.delivery_item_id',[$id]);
 $canRead=can_access($user,'deliveries.create')||can_access($user,'deliveries.edit');$accounts=array_values(array_unique(array_filter(array_column($lines,'account_id'))));$previous=[];
 if($canRead&&$accounts)foreach(delivery_customer_debts($accounts,$id) as $debt)$previous[$debt['account_id']]=($previous[$debt['account_id']]??0)+(int)$debt['balance'];
 $items=[];$source=[];foreach($lines as $line){$prior=$canRead?(int)($previous[$line['account_id']]??0):null;$current=max(0,(int)$line['bilty_due']-(int)$line['bilty_received']);$figures=['balance_customer_key'=>$line['account_id'],'previous_balance'=>$prior,'current_bilty_receivable'=>$current,'total_receivable'=>$prior===null?null:$current+$prior];$items[$line['item_id']]=$figures;if($line['print_source_id']!==null)$source[$line['print_source_id']]=$figures;}
 return ['items'=>$items,'source'=>$source];
}
