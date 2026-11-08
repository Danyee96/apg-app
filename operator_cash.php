<?php
declare(strict_types=1);

function migrate_operator_cash(): void {
 if(one("SELECT value FROM meta WHERE key='operator_cash_version'"))return;
 transaction(function(){
  if(one("SELECT value FROM meta WHERE key='operator_cash_version'"))return;
  run('CREATE TABLE operator_cash_periods(id INTEGER PRIMARY KEY AUTOINCREMENT,operator_id INTEGER NOT NULL REFERENCES users(id),opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,closed_at TEXT,closed_by INTEGER REFERENCES users(id),settlement_amount INTEGER,settlement_note TEXT NOT NULL DEFAULT \'\',close_request_key TEXT UNIQUE,close_request_hash TEXT)');
  run('CREATE UNIQUE INDEX operator_cash_open_period ON operator_cash_periods(operator_id) WHERE closed_at IS NULL');
  run("CREATE TABLE operator_cash_entries(id INTEGER PRIMARY KEY AUTOINCREMENT,period_id INTEGER NOT NULL REFERENCES operator_cash_periods(id),operator_id INTEGER NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('collection','expense')),dated TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,amount INTEGER NOT NULL CHECK(amount>0),title TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',cash_account_id TEXT NOT NULL REFERENCES accounts(id),expense_account_id TEXT REFERENCES accounts(id),receipt_id INTEGER UNIQUE REFERENCES delivery_cash_receipts(id),voucher_id INTEGER UNIQUE REFERENCES vouchers(id),actor_id INTEGER REFERENCES users(id),actor_name TEXT NOT NULL,request_key TEXT UNIQUE,request_hash TEXT)");
  run('CREATE INDEX operator_cash_entries_period ON operator_cash_entries(period_id,id)');
  run('CREATE INDEX operator_cash_entries_owner ON operator_cash_entries(operator_id,dated,id)');
  run("CREATE TRIGGER operator_cash_immutable_update BEFORE UPDATE ON operator_cash_entries BEGIN SELECT RAISE(ABORT,'Munshi cash entries cannot be edited.'); END");
  run("CREATE TRIGGER operator_cash_immutable_delete BEFORE DELETE ON operator_cash_entries BEGIN SELECT RAISE(ABORT,'Munshi cash entries cannot be deleted.'); END");
  run("INSERT OR IGNORE INTO accounts(id,name,group_code,group_name,customer) VALUES('5-501-OPS','Munshi daily expenses','501','EXPENSE OFFICE',0)");
  run("INSERT INTO meta(key,value) VALUES('operator_cash_receipt_floor',?)",[(string)(one('SELECT MAX(id) n FROM delivery_cash_receipts')['n']??0)]);
  run("INSERT INTO meta(key,value) VALUES('operator_cash_enabled_at',?)",[gmdate('c')]);
  run("INSERT INTO meta(key,value) VALUES('operator_cash_version','1')");
  audit('enabled new collections only','operator_cash','1');
 });
}
function operator_cash_allowed(array $user): bool {return in_array($user['role'],['super_admin','operations'],true);}
function operator_cash_owner(array $user,array $p): ?array {
 $requested=(int)($p['operator_id']??0);
 if($user['role']==='operations'){
  if($requested&&$requested!==(int)$user['id'])throw new RuntimeException('You can only view your own cash ledger.',403);
  return $user;
 }
 if(!$requested)return null;
 $owner=one("SELECT * FROM users WHERE id=? AND (role='operations' OR EXISTS(SELECT 1 FROM operator_cash_periods p WHERE p.operator_id=users.id))",[$requested]);
 if(!$owner)throw new InvalidArgumentException('Choose a munshi.');return $owner;
}
function operator_cash_open(int $operator,bool $create=false): ?array {
 $period=one('SELECT * FROM operator_cash_periods WHERE operator_id=? AND closed_at IS NULL',[$operator]);
 if(!$period&&$create){run('INSERT INTO operator_cash_periods(operator_id) VALUES(?)',[$operator]);$period=one('SELECT * FROM operator_cash_periods WHERE id=?',[(int)db()->lastInsertId()]);}
 return $period;
}
function operator_cash_totals(?array $period): array {
 if(!$period)return ['received'=>0,'expenses'=>0,'balance'=>0,'count'=>0,'last_id'=>0];
 $totals=one("SELECT COALESCE(SUM(CASE WHEN kind='collection' THEN amount ELSE 0 END),0) received,COALESCE(SUM(CASE WHEN kind='expense' THEN amount ELSE 0 END),0) expenses,COUNT(*) count,COALESCE(MAX(id),0) last_id FROM operator_cash_entries WHERE period_id=?",[$period['id']]);
 $totals['balance']=(int)$totals['received']-(int)$totals['expenses'];return $totals;
}
function operator_cash_token(int $operator): string {
 $open=operator_cash_open($operator);if($open)return 'open:'.$open['id'];
 return 'new:'.(one('SELECT MAX(id) n FROM operator_cash_periods WHERE operator_id=? AND closed_at IS NOT NULL',[$operator])['n']??0);
}
function operator_cash_version(array $period): string {return shipment_version([$period,operator_cash_totals($period)]);}
// Called inside the existing delivery receipt transaction; never repost its cash.
function operator_cash_record_receipt(int $receipt,array $actor): void {
 $enabled=one("SELECT value FROM meta WHERE key='operator_cash_receipt_floor'");if(!$enabled||$receipt<=(int)$enabled['value'])return;
 if(one('SELECT id FROM operator_cash_entries WHERE receipt_id=?',[$receipt]))return;
 $operator=isset($actor['id'])?one('SELECT * FROM users WHERE id=?',[(int)$actor['id']]):one('SELECT * FROM users WHERE username=?',[$actor['username']??'']);
 if(!$operator||$operator['role']!=='operations')return;
 $r=one('SELECT r.*,d.reference,COALESCE(SUM(l.bilty_received+l.service_received),0) amount FROM delivery_cash_receipts r JOIN deliveries d ON d.id=r.delivery_id LEFT JOIN delivery_cash_receipt_lines l ON l.receipt_id=r.id WHERE r.id=? GROUP BY r.id',[$receipt]);
 if(!$r||(int)$r['amount']<=0)return;$period=operator_cash_open((int)$operator['id'],true);
 run("INSERT INTO operator_cash_entries(period_id,operator_id,kind,dated,amount,title,notes,cash_account_id,receipt_id,actor_id,actor_name) VALUES(?,?,'collection',?,?,?,?,?,?,?,?)",[$period['id'],$operator['id'],$r['dated'],$r['amount'],'Delivery '.$r['reference'],$r['notes'],$r['cash_account_id'],$receipt,$operator['id'],$r['created_by']]);
 audit('automatic delivery collection','operator_cash',$receipt);
}
function operator_cash_expense(array $p,array $user): array {
 if(!operator_cash_allowed($user))throw new RuntimeException('You cannot record ledger expenses.',403);
 $owner=operator_cash_owner($user,$p);if(!$owner)throw new InvalidArgumentException('Choose a munshi.');
 if(!empty($p['id'])||isset($p['receipt_id']))throw new RuntimeException('Saved ledger entries cannot be edited.',403);if(isset($p['kind'])&&$p['kind']!=='expense')throw new InvalidArgumentException('Incoming cash is recorded automatically from deliveries.');
 $key=text($p,'request_key',100,true);if(!preg_match('/^[a-zA-Z0-9-]{16,100}$/D',$key))throw new InvalidArgumentException('Invalid expense request key.');$hash=shipment_version($p);
 return transaction(function()use($p,$user,$owner,$key,$hash){
  $prior=one('SELECT * FROM operator_cash_entries WHERE request_key=?',[$key]);
  if($prior){if((int)$prior['operator_id']!==(int)$owner['id']||(int)$prior['actor_id']!==(int)$user['id']||!hash_equals($prior['request_hash'],$hash))throw new RuntimeException('This expense request was already used for different values.',409);return ['id'=>$prior['id'],'period_id'=>$prior['period_id'],'replayed'=>true];}
  if($user['role']==='operations'&&isset($p['operator_id'])&&(int)$p['operator_id']!==(int)$user['id'])throw new RuntimeException('You can only record your own expenses.',403);
  if(!hash_equals(operator_cash_token((int)$owner['id']),(string)($p['period_token']??'')))throw new RuntimeException('The ledger period changed. Refresh before adding the expense.',409);
  $amount=money($p,'amount');if(!$amount)throw new InvalidArgumentException('Expense amount must be greater than zero.');$dated=day($p);if($dated>date('Y-m-d'))throw new InvalidArgumentException('Expense date cannot be in the future.');
  $title=text($p,'title',150,true);$notes=text($p,'notes',1000);$cash=text($p,'cash_account_id',40,true);$expense=text($p,'expense_account_id',40)?:'5-501-OPS';
  if(!one("SELECT id FROM accounts WHERE id=? AND status='A' AND (id LIKE '1-101-%' OR id LIKE '1-106-%')",[$cash]))throw new InvalidArgumentException('Choose an active cash or bank account.');
  if(!one("SELECT id FROM accounts WHERE id=? AND status='A' AND id LIKE '5-%'",[$expense]))throw new InvalidArgumentException('Choose an active expense account.');
  $period=operator_cash_open((int)$owner['id'],true);$voucher=delivery_system_voucher('PV',$dated,'Munshi expense · '.$owner['username'].' · '.$title,[[$expense,$amount,0],[$cash,0,$amount]]);
  run("INSERT INTO operator_cash_entries(period_id,operator_id,kind,dated,amount,title,notes,cash_account_id,expense_account_id,voucher_id,actor_id,actor_name,request_key,request_hash) VALUES(?,?,'expense',?,?,?,?,?,?,?,?,?,?,?)",[$period['id'],$owner['id'],$dated,$amount,$title,$notes,$cash,$expense,$voucher,$user['id'],$user['username'],$key,$hash]);$id=(int)db()->lastInsertId();audit('recorded expense','operator_cash',$id);
  $balance=operator_cash_totals($period)['balance'];return ['id'=>$id,'period_id'=>$period['id'],'balance'=>$balance,'warning'=>$balance<0?'Expenses exceed collections. The munshi is owed the difference.':null];
 });
}
function operator_cash_manual_receipt(array $p,array $user): array {
 if(!operator_cash_allowed($user))throw new RuntimeException('You cannot record cash receipts.',403);
 $owner=operator_cash_owner($user,$p);if(!$owner)throw new InvalidArgumentException('Choose a munshi.');
 if(!empty($p['id'])||isset($p['receipt_id']))throw new RuntimeException('Saved ledger entries cannot be edited.',403);if(isset($p['kind'])&&$p['kind']!=='collection')throw new InvalidArgumentException('Choose manual cash received.');
 $key=text($p,'request_key',100,true);if(!preg_match('/^[a-zA-Z0-9-]{16,100}$/D',$key))throw new InvalidArgumentException('Invalid cash receipt request key.');$hash=shipment_version($p);
 return transaction(function()use($p,$user,$owner,$key,$hash){
  $prior=one('SELECT * FROM operator_cash_entries WHERE request_key=?',[$key]);
  if($prior){if((int)$prior['operator_id']!==(int)$owner['id']||(int)$prior['actor_id']!==(int)$user['id']||!hash_equals($prior['request_hash'],$hash))throw new RuntimeException('This cash receipt request was already used for different values.',409);return ['id'=>$prior['id'],'period_id'=>$prior['period_id'],'replayed'=>true];}
  if($user['role']==='operations'&&isset($p['operator_id'])&&(int)$p['operator_id']!==(int)$user['id'])throw new RuntimeException('You can only record your own cash receipts.',403);
  if(!hash_equals(operator_cash_token((int)$owner['id']),(string)($p['period_token']??'')))throw new RuntimeException('The ledger period changed. Refresh before adding cash received.',409);
  $amount=money($p,'amount');if(!$amount)throw new InvalidArgumentException('Received amount must be greater than zero.');$dated=day($p);if($dated>date('Y-m-d'))throw new InvalidArgumentException('Received date cannot be in the future.');
  $title=text($p,'title',150,true);$notes=text($p,'notes',1000);$cash=text($p,'cash_account_id',40,true);$expense='SYS-OTHER-CASH-CLEARING';
  if(!one("SELECT id FROM accounts WHERE id=? AND status='A' AND (id LIKE '1-101-%' OR id LIKE '1-106-%')",[$cash]))throw new InvalidArgumentException('Choose an active cash or bank account.');
  run("INSERT OR IGNORE INTO accounts(id,name,group_code,group_name,customer) VALUES('SYS-OTHER-CASH-CLEARING','Other cash receipts clearing','SYS-CASH','CASH CONTROLS',0)");
  $period=operator_cash_open((int)$owner['id'],true);$voucher=delivery_system_voucher('RV',$dated,'Manual cash received · '.$owner['username'].' · '.$title,[[$cash,$amount,0],[$expense,0,$amount]]);
  run("INSERT INTO operator_cash_entries(period_id,operator_id,kind,dated,amount,title,notes,cash_account_id,expense_account_id,voucher_id,actor_id,actor_name,request_key,request_hash) VALUES(?,?,'collection',?,?,?,?,?,?,?,?,?,?,?)",[$period['id'],$owner['id'],$dated,$amount,$title,$notes,$cash,null,$voucher,$user['id'],$user['username'],$key,$hash]);$id=(int)db()->lastInsertId();audit('recorded manual cash received','operator_cash',$id);
  $balance=operator_cash_totals($period)['balance'];return ['id'=>$id,'period_id'=>$period['id'],'balance'=>$balance,'warning'=>$balance<0?'Expenses exceed collections. The munshi is owed the difference.':null];
 });
}
function operator_cash_clear(array $p,array $user): array {
 if($user['role']!=='super_admin')throw new RuntimeException('Only super admin can clear a receivable.',403);
 $key=text($p,'request_key',100,true);if(!preg_match('/^[a-zA-Z0-9-]{16,100}$/D',$key))throw new InvalidArgumentException('Invalid clearance request key.');$hash=shipment_version($p);
 return transaction(function()use($p,$user,$key,$hash){
  $prior=one('SELECT * FROM operator_cash_periods WHERE close_request_key=?',[$key]);if($prior){if(!hash_equals($prior['close_request_hash'],$hash)||(int)$prior['closed_by']!==(int)$user['id'])throw new RuntimeException('This clearance request was already used for different values.',409);return ['id'=>$prior['id'],'amount'=>$prior['settlement_amount'],'replayed'=>true];}
  $period=one('SELECT * FROM operator_cash_periods WHERE id=? AND closed_at IS NULL',[(int)($p['period_id']??0)]);if(!$period)throw new RuntimeException('This period is already cleared or does not exist.',409);
  if(!hash_equals(operator_cash_version($period),(string)($p['version']??'')))throw new RuntimeException('New entries changed this receivable. Refresh and review before clearing.',409);
  $totals=operator_cash_totals($period);if(!$totals['count'])throw new InvalidArgumentException('There are no entries to clear.');
  run('UPDATE operator_cash_periods SET closed_at=CURRENT_TIMESTAMP,closed_by=?,settlement_amount=?,settlement_note=?,close_request_key=?,close_request_hash=? WHERE id=?',[$user['id'],$totals['balance'],text($p,'notes',1000),$key,$hash,$period['id']]);audit('cleared operator receivable','operator_cash_period',$period['id']);
  return ['id'=>$period['id'],'amount'=>$totals['balance']];
 });
}
function operator_cash_ledger(array $p,array $user): array {
 $operators=$user['role']==='super_admin'?query("SELECT u.id,u.username,u.full_name,u.active,u.role,COALESCE(t.balance,0) balance FROM users u LEFT JOIN (SELECT p.operator_id,SUM(CASE WHEN e.kind='collection' THEN e.amount ELSE -e.amount END) balance FROM operator_cash_periods p LEFT JOIN operator_cash_entries e ON e.period_id=p.id WHERE p.closed_at IS NULL GROUP BY p.operator_id) t ON t.operator_id=u.id WHERE u.role='operations' OR EXISTS(SELECT 1 FROM operator_cash_periods p WHERE p.operator_id=u.id) ORDER BY balance DESC,u.full_name,u.username"):[];
 $owner=operator_cash_owner($user,$p);if(!$owner&&$operators)$owner=one('SELECT * FROM users WHERE id=?',[$operators[0]['id']]);
 $result=['operators'=>$operators,'operator'=>$owner?['id'=>$owner['id'],'username'=>$owner['username'],'full_name'=>$owner['full_name'],'active'=>$owner['active']]:null,'enabled_at'=>one("SELECT value FROM meta WHERE key='operator_cash_enabled_at'")['value'],'all_receivable'=>array_sum(array_map(fn($row)=>max(0,(int)$row['balance']),$operators)),'period'=>null,'totals'=>operator_cash_totals(null),'rows'=>[],'total'=>0,'page'=>0,'page_size'=>30,'history'=>['rows'=>[],'total'=>0,'page'=>0,'page_size'=>15],'cash_accounts'=>[],'expense_accounts'=>[]];
 if(!$owner)return $result;
 $operator=(int)$owner['id'];$periodId=(int)($p['period_id']??0);$period=$periodId?one('SELECT p.*,u.full_name cleared_by_name FROM operator_cash_periods p LEFT JOIN users u ON u.id=p.closed_by WHERE p.id=? AND p.operator_id=?',[$periodId,$operator]):operator_cash_open($operator);if($periodId&&!$period)throw new RuntimeException('This ledger period is not available to your account.',403);
 $result['period_token']=operator_cash_token($operator);$result['period']=$period;$result['totals']=operator_cash_totals($period);$result['version']=$period?operator_cash_version($period):null;
 if($period){$args=[(int)$period['id']];$where=' WHERE 1=1';$where.=rangeWhere('dated',$args);$search=text($p,'search',250);if($search!==''){$where.=" AND (title LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\')";$pattern='%'.str_replace(['\\','%','_'],['\\\\','\\%','\\_'],$search).'%';$args[]=$pattern;$args[]=$pattern;}$kind=text($p,'kind',20);if(in_array($kind,['collection','expense'],true)){$where.=' AND kind=?';$args[]=$kind;}
  $base="WITH entries AS(SELECT e.*,SUM(CASE WHEN kind='collection' THEN amount ELSE -amount END) OVER(ORDER BY id ROWS UNBOUNDED PRECEDING) running_balance FROM operator_cash_entries e WHERE period_id=?) ";$filtered=one($base."SELECT COUNT(*) count,COALESCE(SUM(CASE WHEN kind='collection' THEN amount ELSE 0 END),0) received,COALESCE(SUM(CASE WHEN kind='expense' THEN amount ELSE 0 END),0) expenses FROM entries".$where,$args);$page=max(0,min(max(0,(int)ceil($filtered['count']/30)-1),(int)($p['page']??0)));
  $result['rows']=query($base.'SELECT entries.*,(SELECT name FROM accounts a WHERE a.id=entries.cash_account_id) cash_account FROM entries'.$where.' ORDER BY id DESC LIMIT 30 OFFSET '.($page*30),$args);$result['total']=(int)$filtered['count'];$result['filtered_totals']=$filtered;$result['page']=$page;
 }
 $count=(int)one('SELECT COUNT(*) n FROM operator_cash_periods WHERE operator_id=? AND closed_at IS NOT NULL',[$operator])['n'];$hp=max(0,min(max(0,(int)ceil($count/15)-1),(int)($p['history_page']??0)));$result['history']=['rows'=>query('SELECT p.*,u.full_name cleared_by_name,(SELECT COUNT(*) FROM operator_cash_entries e WHERE e.period_id=p.id) entries FROM operator_cash_periods p LEFT JOIN users u ON u.id=p.closed_by WHERE p.operator_id=? AND p.closed_at IS NOT NULL ORDER BY p.id DESC LIMIT 15 OFFSET '.($hp*15),[$operator]),'total'=>$count,'page'=>$hp,'page_size'=>15];
 if(operator_cash_allowed($user)){$result['cash_accounts']=query("SELECT id,name FROM accounts WHERE status='A' AND (id LIKE '1-101-%' OR id LIKE '1-106-%') ORDER BY id");$result['expense_accounts']=query("SELECT id,name FROM accounts WHERE status='A' AND id LIKE '5-%' ORDER BY CASE WHEN id='5-501-OPS' THEN 0 ELSE 1 END,name");}
 return $result;
}
function operator_cash_entry(int $id,array $user): array {
 $entry=one('SELECT e.*,a.name cash_account,x.name expense_account,v.reference voucher_reference FROM operator_cash_entries e JOIN accounts a ON a.id=e.cash_account_id LEFT JOIN accounts x ON x.id=e.expense_account_id LEFT JOIN vouchers v ON v.id=e.voucher_id WHERE e.id=?',[$id]);if(!$entry)throw new InvalidArgumentException('Entry not found.');if($user['role']!=='super_admin'&&(int)$entry['operator_id']!==(int)$user['id'])throw new RuntimeException('This entry is not available to your account.',403);
 $result=['entry'=>$entry,'items'=>[]];if($entry['receipt_id']){$result['receipt']=one('SELECT r.*,d.reference delivery_reference,d.receiver,d.mobile,d.cnic,d.remarks delivery_remarks FROM delivery_cash_receipts r JOIN deliveries d ON d.id=r.delivery_id WHERE r.id=?',[$entry['receipt_id']]);$result['items']=query('SELECT l.*,b.bilty,b.party_to,b.bilty_amount,b.godown,b.advance,b.bilty_due,b.service_due,a.name customer,di.discount,di.loading_charge,di.suzuki_charge,i.qty,i.detail,s.dated arrival_date,st.name station FROM delivery_cash_receipt_lines l JOIN delivery_cash_lines b ON b.delivery_item_id=l.delivery_item_id JOIN accounts a ON a.id=b.account_id JOIN delivery_items di ON di.id=b.delivery_item_id JOIN items i ON i.id=di.item_id JOIN shipments s ON s.id=i.shipment_id LEFT JOIN stations st ON st.id=s.station_id WHERE l.receipt_id=? ORDER BY l.delivery_item_id',[$entry['receipt_id']]);}return $result;
}
function operator_cash_routes(string $action,string $method,array $p,array $user): void {
 if(!in_array($action,['daily_expense','daily_expense_entry','save_daily_expense','save_daily_cash_received','clear_operator_receivable'],true))return;
 if(!operator_cash_allowed($user))fail('Daily expense is available only to munshis and super admin.',403);
 if($action==='daily_expense'&&$method==='GET')response(operator_cash_ledger($_GET,$user));
 if($action==='daily_expense_entry'&&$method==='GET')response(operator_cash_entry((int)($_GET['id']??0),$user));
 if($action==='save_daily_expense'&&$method==='POST')response(operator_cash_expense($p,$user),201);
 if($action==='save_daily_cash_received'&&$method==='POST')response(operator_cash_manual_receipt($p,$user),201);
 if($action==='clear_operator_receivable'&&$method==='POST')response(operator_cash_clear($p,$user),201);
 fail('Method not allowed.',405);
}
