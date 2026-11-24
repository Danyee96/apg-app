<?php
declare(strict_types=1);

function migrate_temporary_customers(): void {
 if(one("SELECT value FROM meta WHERE key='temporary_customers_version'"))return;
 transaction(function(){
  if(one("SELECT value FROM meta WHERE key='temporary_customers_version'"))return;
  if(!in_array('temporary',array_column(query('PRAGMA table_info(accounts)'),'name'),true))run('ALTER TABLE accounts ADD COLUMN temporary INTEGER NOT NULL DEFAULT 0');
  run('CREATE INDEX IF NOT EXISTS idx_accounts_temporary ON accounts(customer,temporary,name COLLATE NOCASE)');
  run("INSERT INTO meta(key,value) VALUES('temporary_customers_version','1')");
 });
}

function validate_customer_phone(string $phone): void {
 if(!preg_match('/^\+?[0-9 ()-]+$/D',$phone) || strlen(preg_replace('/\D/','',$phone))<7 || strlen(preg_replace('/\D/','',$phone))>15)fail('Enter a valid phone number with 7 to 15 digits.');
}

function temporary_customer_routes(string $action,string $method,array $p,array $user): void {
 if($action==='incoming_customer_create'&&$method==='POST'){
  $offlineKey=$p['offline_request_id']??null;$offlineHash=null;
  if($offlineKey!==null){
   if(!is_string($offlineKey)||!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iD',$offlineKey))fail('Invalid offline request ID.');
   if(($p['mode']??null)!=='temporary')fail('Offline customer creation currently supports temporary customers only.');
   $offlineKey=strtolower($offlineKey);$offlineHash=hash('sha256',json_encode($p,JSON_THROW_ON_ERROR));
   run('CREATE TABLE IF NOT EXISTS offline_customer_requests(request_key TEXT PRIMARY KEY,actor_id INTEGER NOT NULL,request_hash TEXT NOT NULL,result_json TEXT NOT NULL)');
   $prior=offline_customer_replay($offlineKey,(int)$user['id'],$offlineHash);if($prior!==null)response($prior,201);
  }
  $name=text($p,'name',100,true);$mode=text($p,'mode',20,true);
  if(!in_array($mode,['temporary','full'],true))fail('Choose a customer type.');
  $area=$mode==='full'?text($p,'area',100,true):'';$phone=$mode==='full'?text($p,'mobile',40,true):'';
  if($mode==='full')validate_customer_phone($phone);
  $result=transaction(function()use($name,$mode,$area,$phone,$offlineKey,$offlineHash,$user){
   if($offlineKey!==null&&($prior=offline_customer_replay($offlineKey,(int)$user['id'],$offlineHash))!==null)return $prior;
   if($mode==='full'&&one('SELECT id FROM accounts WHERE customer=1 AND TRIM(name)=? COLLATE NOCASE',[$name]))throw new RuntimeException('A customer with this name already exists. Search for and select that customer.',409);
   $next=(int)one("SELECT max(CAST(substr(id,instr(substr(id,3),'-')+3) AS INTEGER)) n FROM accounts WHERE group_code='116'")['n']+1;
   do{$id='1-116-'.str_pad((string)$next++,3,'0',STR_PAD_LEFT);}while(one('SELECT id FROM accounts WHERE id=?',[$id]));
   run("INSERT INTO accounts(id,name,group_code,group_name,customer,status,area,mobile,temporary) VALUES(?,?,'116','CUSTOMERS-116',1,'A',?,?,?)",[$id,$name,$area,$phone,$mode==='temporary'?1:0]);
   audit('created',$mode==='temporary'?'temporary_customer':'customer',$id);$result=['id'=>$id];
   if($offlineKey!==null)run('INSERT INTO offline_customer_requests(request_key,actor_id,request_hash,result_json) VALUES(?,?,?,?)',[$offlineKey,$user['id'],$offlineHash,json_encode($result,JSON_THROW_ON_ERROR)]);
   return $result;
  });response($result,201);
 }
 if($action==='temporary_customers'&&$method==='GET'){
  $where=' WHERE a.customer=1 AND a.temporary=1';$args=[];
  if(!empty($_GET['search'])){$where.=" AND (a.name LIKE ? ESCAPE '\\' OR a.id LIKE ? ESCAPE '\\')";$args=[pattern(),pattern()];}
  response(paged('accounts a',$where,$args,"a.*,(SELECT COUNT(*) FROM items i JOIN shipments s ON s.id=i.shipment_id WHERE i.account_id=a.id AND s.kind='incoming') bilties,(SELECT COALESCE(SUM(i.qty),0) FROM items i JOIN shipments s ON s.id=i.shipment_id WHERE i.account_id=a.id AND s.kind='incoming') quantity",'a.name COLLATE NOCASE,a.id'));
 }
 if($action==='temporary_customer_goods'&&$method==='GET'){
  $id=text($_GET,'id',40,true);$account=one('SELECT id,name,version FROM accounts WHERE id=? AND customer=1 AND temporary=1',[$id]);if(!$account)fail('Temporary customer not found.',404);
  $result=paged('items i JOIN shipments s ON s.id=i.shipment_id LEFT JOIN stations st ON st.id=s.station_id LEFT JOIN goods_subcategories g ON g.id=i.goods_subcategory_id'," WHERE i.account_id=? AND s.kind='incoming'",[$id],"i.id,i.bilty,i.party_to,i.qty,i.detail,i.goods_custom,g.name goods_subcategory,i.bilty_amount,i.godown,i.total,i.loading,i.suzuki,i.advance,i.status,s.dated,s.reference,st.name station",'s.dated DESC,i.id DESC');
  response(['customer'=>$account]+$result);
 }
 if($action==='promote_temporary_customer'&&$method==='POST'){
  $id=text($p,'id',40,true);$area=text($p,'area',100,true);$mobile=text($p,'mobile',40,true);$version=(int)($p['version']??0);
  validate_customer_phone($mobile);
  transaction(function()use($id,$area,$mobile,$version){$old=one('SELECT id,version FROM accounts WHERE id=? AND customer=1 AND temporary=1',[$id]);if(!$old)throw new RuntimeException('This customer has already been converted or no longer exists.',409);if((int)$old['version']!==$version)throw new RuntimeException('This customer changed. Refresh and try again.',409);run('UPDATE accounts SET area=?,mobile=?,temporary=0,version=version+1 WHERE id=?',[$area,$mobile,$id]);audit('converted','temporary_customer',$id);});response(['ok'=>true,'id'=>$id]);
 }
}

function offline_customer_replay(string $key,int $actor,string $hash): ?array {
 $row=one('SELECT actor_id,request_hash,result_json FROM offline_customer_requests WHERE request_key=?',[$key]);
 if(!$row)return null;
 if((int)$row['actor_id']!==$actor||!hash_equals($row['request_hash'],$hash))throw new RuntimeException('This offline request ID was already used for a different customer.',409);
 return [...json_decode($row['result_json'],true,64,JSON_THROW_ON_ERROR),'replayed'=>true];
}
