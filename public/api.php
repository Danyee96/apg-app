<?php
declare(strict_types=1);
require __DIR__.'/../bootstrap.php';
require __DIR__.'/../access.php';
require __DIR__.'/../backups.php';
header('X-Content-Type-Options: nosniff');
ini_set('session.use_strict_mode','1');session_name('APGSESSION');session_set_cookie_params(['httponly'=>true,'samesite'=>'Strict','secure'=>!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off','path'=>'/']);session_start();
$_SESSION['csrf']??=bin2hex(random_bytes(24));
try {
 $action=$_GET['action']??'session';$method=$_SERVER['REQUEST_METHOD'];
 $workspaceLock=workspace_lock($action==='backup_restore');
 if($action==='scheduled_backup'){if($method!=='POST')fail('Method not allowed.',405);$config=backup_config();$token=$_SERVER['HTTP_X_APG_BACKUP_TOKEN']??'';if(empty($config['token'])||!hash_equals($config['token'],$token))fail('Not authorized.',403);response(run_scheduled_backup());}

 if($method==='POST'){
  if(!hash_equals($_SESSION['csrf'],$_SERVER['HTTP_X_CSRF_TOKEN']??''))fail('Your session changed. Refresh and try again.',403);
  if((int)($_SERVER['CONTENT_LENGTH']??0)>200000)fail('Request too large.',413);
  $p=json_decode(file_get_contents('php://input'),true,64,JSON_THROW_ON_ERROR);if(!is_array($p))fail('Invalid request.');
 }elseif($method!=='GET')fail('Method not allowed.',405);
 migrate_access();migrate_incoming_approvals();migrate_incoming_bonuses();migrate_delivery_edits();migrate_goods_catalog();migrate_goods_names();
 $current=current_user();
 $hasUser=(bool)one('SELECT id FROM users LIMIT 1');
 if($action==='session'&&$method==='GET')response(['setup'=>!$hasUser,'user'=>$current['username']??null,'profile'=>$current?public_user($current):null,'permissions'=>$current?effective_permissions($current):[],'csrf'=>$_SESSION['csrf'],'backup_date'=>one("SELECT value FROM meta WHERE key='backup_date'")['value']??'2026-10-31','history_start'=>one("SELECT value FROM meta WHERE key='history_start'")['value']??'2017-10-28']);
 if($action==='setup'&&$method==='POST'){
  if($hasUser)fail('An administrator already exists.',409);
  if(!in_array($_SERVER['REMOTE_ADDR'],['127.0.0.1','::1'],true))fail('Create the administrator on the local computer before uploading this app.',403);
  $username=text($p,'username',40,true);$password=new_password($p);
  transaction(function()use($username,$password){if(one('SELECT id FROM users LIMIT 1'))fail('An administrator already exists.',409);run("INSERT INTO users(username,password,full_name,role) VALUES(?,?,?,'super_admin')",[$username,password_hash($password,PASSWORD_DEFAULT),$username]);});
  sign_in_user(one('SELECT * FROM users WHERE username=?',[$username]));audit('created','user',$username);response(['ok'=>true]);
 }
 if($action==='login'&&$method==='POST'){
  run('CREATE TABLE IF NOT EXISTS auth_attempts(ip TEXT,created_at INTEGER)');$ip=$_SERVER['REMOTE_ADDR'];$cut=time()-600;run('DELETE FROM auth_attempts WHERE created_at<?',[$cut]);
  if((int)one('SELECT count(*) n FROM auth_attempts WHERE ip=?',[$ip])['n']>=10)fail('Too many attempts. Try again in 10 minutes.',429);
  $u=one('SELECT * FROM users WHERE username=?',[text($p,'username',40,true)]);if(!$u||!(int)$u['active']||!password_verify(text($p,'password',128,true),$u['password'])){run('INSERT INTO auth_attempts VALUES(?,?)',[$ip,time()]);fail('Username or password is incorrect.',401);}
  sign_in_user($u);run('UPDATE users SET last_login=CURRENT_TIMESTAMP WHERE id=?',[$u['id']]);run('DELETE FROM auth_attempts WHERE ip=?',[$ip]);response(['ok'=>true]);
 }
 if($action==='logout'&&$method==='POST'){$_SESSION=[];session_destroy();response(['ok'=>true]);}
 if(!$current)fail('Please sign in.',401);
 access_routes($action,$method,$p??[],$current);
 authorize_action($action,$method,$p??[],$current);
 if($action==='dashboard'&&$method==='GET'){
  $asof=text($_GET,'date',10)?:date('Y-m-d');day(['dated'=>$asof]);
  $start=(new DateTimeImmutable($asof))->modify('-6 days');$trend=[];
  $counts=query("SELECT dated,kind,count(*) n FROM shipments WHERE dated>=? AND dated<=? GROUP BY dated,kind",[$start->format('Y-m-d'),$asof]);
  for($i=0;$i<7;$i++){$dated=$start->modify('+'.$i.' days')->format('Y-m-d');$entry=['dated'=>$dated,'incoming'=>0,'booking'=>0];foreach($counts as $count){if($count['dated']===$dated)$entry[$count['kind']]=(int)$count['n'];}$trend[]=$entry;}

  response(['trend'=>$trend,'date'=>$asof,'customers'=>(int)one('SELECT count(*) n FROM accounts WHERE customer=1')['n'],'incoming'=>(int)one("SELECT count(*) n FROM shipments WHERE kind='incoming' AND dated=?",[$asof])['n'],'bookings'=>(int)one("SELECT count(*) n FROM shipments WHERE kind='booking' AND dated=?",[$asof])['n'],'deliveries'=>(int)one('SELECT count(*) n FROM deliveries WHERE dated=?',[$asof])['n'],'pending'=>(int)one("SELECT count(*) n FROM items i JOIN shipments s ON s.id=i.shipment_id WHERE i.status='pending' AND s.kind='incoming'")['n'],'recent'=>query("SELECT s.*,st.name station,(SELECT count(*) FROM items i WHERE i.shipment_id=s.id) item_count FROM shipments s LEFT JOIN stations st ON st.id=s.station_id ORDER BY s.dated DESC,s.id DESC LIMIT 6"),'stations'=>query("SELECT st.name,count(i.id) count FROM items i JOIN shipments s ON s.id=i.shipment_id LEFT JOIN stations st ON st.id=s.station_id WHERE i.status='pending' AND s.kind='incoming' GROUP BY st.id ORDER BY count DESC"),'activity'=>query('SELECT * FROM audit ORDER BY id DESC LIMIT 5')]);
 }
 if($action==='lookups'&&$method==='GET'){
  $finance=can_access($current,'ledger.view')||can_access($current,'vouchers.view');
  $customers=can_access($current,'customers.view');
  $goods=can_access($current,'incoming.edit')||can_access($current,'booking.edit')||can_access($current,'incoming.create')||can_access($current,'booking.create')||can_access($current,'deliveries.create');
  $select=$customers||can_access($current,'ledger.view')?'id,name,customer,group_code,status,mobile,phone,address,area':"id,name,customer,group_code,status,'' mobile,'' phone,'' address,'' area";
  $stationAccess=can_access($current,'overview.view')||can_access($current,'incoming.view')||can_access($current,'booking.view')||can_access($current,'deliveries.view')||can_access($current,'settings.view');
  response(['goods_catalog'=>$goods||$customers||$stationAccess||$current['role']==='super_admin'?goods_catalog():['categories'=>[],'subcategories'=>[]],'stations'=>$stationAccess?query('SELECT * FROM stations ORDER BY name'):[],'accounts'=>($finance||$customers||$goods)?query('SELECT '.$select.' FROM accounts'.($finance?'':' WHERE customer=1').' ORDER BY name COLLATE NOCASE'):[],'areas'=>$customers?query("SELECT DISTINCT area FROM accounts WHERE area IS NOT NULL AND area<>'' ORDER BY area"):[]]);
 }

 if($action==='customers'&&$method==='GET'){
  $where=' WHERE a.customer=1';$args=[];if(!empty($_GET['search'])){$where.=" AND (a.name LIKE ? ESCAPE '\' OR a.id LIKE ? ESCAPE '\' OR a.mobile LIKE ? ESCAPE '\' OR a.phone LIKE ? ESCAPE '\' OR a.address LIKE ? ESCAPE '\')";$args=array_fill(0,5,pattern());}
  if(!empty($_GET['group'])){$where.=' AND a.group_code=?';$args[]=text($_GET,'group',3);}
  response(paged('accounts a',$where,$args,'a.*','a.name COLLATE NOCASE,a.id'));
 }
 if($action==='customer'&&$method==='GET'){$r=one('SELECT * FROM accounts WHERE id=? AND customer=1',[text($_GET,'id',40,true)]);if(!$r)fail('Customer not found.',404);response($r);}
 if($action==='save_customer'&&$method==='POST'){
  $id=text($p,'id',40);$name=text($p,'name',100,true);$group=text($p,'group_code',3,true);if(!in_array($group,['115','116','117','118'],true))fail('Choose a customer group.');
  $status=text($p,'status',1)?:'A';if(!in_array($status,['A','I'],true))fail('Invalid status.');$email=text($p,'email',100);if($email&&!filter_var($email,FILTER_VALIDATE_EMAIL))fail('Enter a valid email address.');
  $fields=['name','status','address','area','contact','phone','phone2','mobile','mobile2','email','cnic','urdu_name','urdu_address'];$values=[];foreach($fields as $f)$values[]=match($f){'name'=>$name,'status'=>$status,'email'=>$email,default=>text($p,$f,$f==='urdu_address'?500:200)};
  $result=transaction(function()use($id,$group,$p,$fields,$values){
   if($id){$old=one('SELECT * FROM accounts WHERE id=? AND customer=1',[$id]);if(!$old)throw new InvalidArgumentException('Customer not found.');if((int)($p['version']??0)!==(int)$old['version'])throw new RuntimeException('This customer was edited elsewhere. Reopen the record before saving.',409);if($old['group_code']!==$group)throw new InvalidArgumentException('An existing customer’s account group cannot be changed.');run('UPDATE accounts SET '.implode(',',array_map(fn($f)=>$f.'=?',$fields)).',version=version+1 WHERE id=?',[...$values,$id]);audit('updated','customer',$id);return $id;}
   $next=(int)one('SELECT max(CAST(substr(id,instr(substr(id,3),\'-\')+3) AS INTEGER)) n FROM accounts WHERE group_code=?',[$group])['n']+1;
   do{$id='1-'.$group.'-'.str_pad((string)$next++,3,'0',STR_PAD_LEFT);}while(one('SELECT id FROM accounts WHERE id=?',[$id]));
   run('INSERT INTO accounts(id,group_code,group_name,customer,'.implode(',',$fields).') VALUES('.implode(',',array_fill(0,4+count($fields),'?')).')',[$id,$group,'CUSTOMERS-'.$group,1,...$values]);audit('created','customer',$id);return $id;
  });response(['id'=>$result]);
 }
 if($action==='goods_catalog'&&$method==='GET')response(goods_catalog());
 if($action==='save_goods_category'&&$method==='POST'){
  $name=text($p,'name',100,true);$parent=filter_var($p['category_id']??0,FILTER_VALIDATE_INT);if($parent===false||$parent<0)fail('Choose a valid main category.');
  $id=transaction(function()use($name,$parent){
   if($parent){if(!one('SELECT id FROM goods_categories WHERE id=?',[$parent]))throw new InvalidArgumentException('Choose a main category.');if(one('SELECT id FROM goods_subcategories WHERE category_id=? AND name=?',[$parent,$name]))throw new InvalidArgumentException('This subcategory already exists.');run('INSERT INTO goods_subcategories(category_id,name) VALUES(?,?)',[$parent,$name]);}
   else{if(one('SELECT id FROM goods_categories WHERE name=?',[$name]))throw new InvalidArgumentException('This category already exists.');run('INSERT INTO goods_categories(name) VALUES(?)',[$name]);}
   $id=(int)db()->lastInsertId();audit('created',$parent?'goods_subcategory':'goods_category',$id);return $id;
  });response(['id'=>$id],201);
 }
 if($action==='update_goods_category'&&$method==='POST'){
  $kind=text($p,'kind',20,true);if(!in_array($kind,['category','subcategory'],true))fail('Choose a category or subcategory.');
  $id=filter_var($p['id']??null,FILTER_VALIDATE_INT);if(!$id||$id<1)fail('Choose a valid category.');$name=text($p,'name',100,true);$original=text($p,'original_name',100,true);
  transaction(function()use($id,$kind,$name,$original){
   $table=$kind==='category'?'goods_categories':'goods_subcategories';$old=one('SELECT * FROM '.$table.' WHERE id=?',[$id]);if(!$old)throw new InvalidArgumentException('Category not found.');
   if($old['name']!==$original)throw new RuntimeException('This name changed elsewhere. Refresh and try again.',409);
   $args=[$name,$id];$where='name=? AND id<>?';if($kind==='subcategory'){$where.=' AND category_id=?';$args[]=$old['category_id'];}
   if(one('SELECT id FROM '.$table.' WHERE '.$where,$args))throw new InvalidArgumentException('That name already exists.');
   run('UPDATE '.$table.' SET name=? WHERE id=?',[$name,$id]);audit('renamed '.$old['name'].' to '.$name,'goods_'.$kind,$id);
  });response(['ok'=>true,'id'=>$id]);
 }
 if($action==='goods_analytics'&&$method==='GET'){
  $args=[];$where=" WHERE s.kind='incoming'".rangeWhere('s.dated',$args);
  $status=text($_GET,'status',20);if(in_array($status,['pending','delivered'],true)){$where.=' AND i.status=?';$args[]=$status;}
  $rows=query("SELECT i.goods_category_id,i.goods_subcategory_id,i.goods_custom,COALESCE(c.name,CASE WHEN i.goods_custom<>'' THEN 'Other / custom' ELSE 'Uncategorised' END) category,COALESCE(g.name,NULLIF(i.goods_custom,''),'Uncategorised') subcategory,COUNT(*) bilties,COALESCE(SUM(i.qty),0) quantity,COUNT(DISTINCT s.id) shipments FROM items i JOIN shipments s ON s.id=i.shipment_id LEFT JOIN goods_categories c ON c.id=i.goods_category_id LEFT JOIN goods_subcategories g ON g.id=i.goods_subcategory_id".$where." GROUP BY i.goods_category_id,i.goods_subcategory_id,i.goods_custom ORDER BY quantity DESC",$args);
  response(['rows'=>$rows,'totals'=>one('SELECT COUNT(*) bilties,COALESCE(SUM(i.qty),0) quantity,COUNT(DISTINCT s.id) shipments FROM items i JOIN shipments s ON s.id=i.shipment_id'.$where,$args)]);
 }
 if($action==='pending_incoming'&&$method==='GET'){
  $where=" WHERE status='pending'";$args=[];if($current['role']!=='super_admin'){$where.=' AND submitted_by=?';$args[]=$current['id'];}
  $result=paged('incoming_submissions',$where,$args,'id,submitted_name,submitted_at,status,payload','id DESC');
  foreach($result['rows'] as &$row){$data=json_decode($row['payload'],true,64,JSON_THROW_ON_ERROR);unset($row['payload']);$row['dated']=$data['dated'];$row['truck']=$data['truck'];$row['item_count']=count($data['items']);$row['station']=one('SELECT name FROM stations WHERE id=?',[$data['station_id']])['name']??'';}
  unset($row);response($result);
 }
 if($action==='discard_incoming'&&$method==='POST'){
  $id=filter_var($p['id']??null,FILTER_VALIDATE_INT);if(!$id||$id<1)fail('Choose a valid pending entry.');
  transaction(function()use($id){
   if(!one("SELECT id FROM incoming_submissions WHERE id=? AND status='pending'",[$id]))throw new RuntimeException('This entry has already been approved, discarded or is unavailable.',409);
   run("UPDATE incoming_submissions SET status='discarded' WHERE id=? AND status='pending'",[$id]);audit('discarded','incoming_submission',$id);
  });response(['ok'=>true,'id'=>$id]);
 }
 if($action==='incoming_submission'&&$method==='GET'){
  $row=one("SELECT * FROM incoming_submissions WHERE id=? AND status='pending'",[(int)($_GET['id']??0)]);if(!$row)fail('Pending entry not found.',404);$payload=json_decode($row['payload'],true,64,JSON_THROW_ON_ERROR);$payload['items']=array_map(fn($item)=>goods_item_labels([...$item,...goods_classification($item)]),$payload['items']);response(['id'=>$row['id'],'submitted_name'=>$row['submitted_name'],'submitted_at'=>$row['submitted_at'],'payload'=>$payload]);
 }
 if($action==='shipments'&&$method==='GET'){
  $kind=text($_GET,'kind',10)?:'incoming';if(!in_array($kind,['incoming','booking'],true))fail('Invalid shipment type.');$where=' WHERE s.kind=?';$args=[$kind];
  if(!empty($_GET['search'])){$where.=" AND (s.reference LIKE ? ESCAPE '\' OR s.truck LIKE ? ESCAPE '\' OR s.driver LIKE ? ESCAPE '\' OR EXISTS(SELECT 1 FROM items x WHERE x.shipment_id=s.id AND (x.bilty LIKE ? ESCAPE '\' OR x.party_to LIKE ? ESCAPE '\')))";$args=[...$args,...array_fill(0,5,pattern())];}
  $where.=rangeWhere('s.dated',$args);response(paged('shipments s LEFT JOIN stations st ON st.id=s.station_id',$where,$args,'s.*,st.name station,(SELECT count(*) FROM items i WHERE i.shipment_id=s.id) item_count,(SELECT COALESCE(SUM(CASE WHEN s.kind=\'incoming\' THEN i.bilty_amount+i.godown ELSE i.rent+i.loading+i.bilty_amount+i.local_charge END),0) FROM items i WHERE i.shipment_id=s.id) total','s.dated DESC,s.id DESC'));
 }
 if($action==='shipment'&&$method==='GET'){$id=(int)($_GET['id']??0);$s=one('SELECT s.*,st.name station,st.address station_address FROM shipments s LEFT JOIN stations st ON st.id=s.station_id WHERE s.id=?',[$id]);if(!$s)fail('Shipment not found.',404);$s['version']=shipment_version(shipment_snapshot($id));$s['items']=array_map(fn($item)=>goods_item($item,$s['kind']),query('SELECT i.*,a.name customer FROM items i LEFT JOIN accounts a ON a.id=i.account_id WHERE shipment_id=? ORDER BY i.id',[$id]));response($s);}
 if($action==='save_shipment'&&$method==='POST'){
  $kind=text($p,'kind',10,true);if(!in_array($kind,['incoming','booking'],true))fail('Choose a valid shipment type.');$dated=day($p);$station=(int)($p['station_id']??0);if(!one("SELECT id FROM stations WHERE id=? AND status='A'",[$station]))fail('Choose a station.');
  $truck=text($p,'truck',30,true);$driver=text($p,'driver',100);$lines=$p['items']??[];if(!is_array($lines)||count($lines)<1||count($lines)>100)fail('Add between 1 and 100 bilties.');
  $warnings=[];$clean=[];$seen=[];foreach($lines as $l){if(!is_array($l))fail('Invalid bilty.');$bilty=text($l,'bilty',40,true);if(isset($seen[$bilty]))fail('Bilty numbers must be unique within this shipment.');$seen[$bilty]=true;$account=text($l,'account_id',40,true);if(!one("SELECT id FROM accounts WHERE id=? AND customer=1 AND status='A'",[$account]))fail('Choose an active customer for each bilty.');$qty=filter_var($l['qty']??null,FILTER_VALIDATE_INT);if($qty===false||$qty<1||$qty>999999)fail('Quantity must be a whole number greater than zero.');
   $v=['account_id'=>$account,'bilty'=>$bilty,'party_from'=>text($l,'party_from',100),'party_to'=>text($l,'party_to',100),'city'=>text($l,'city',80),'contact'=>text($l,'contact',40),'qty'=>$qty,'detail'=>text($l,'detail',250),'remarks'=>text($l,'remarks',250),...goods_classification($l)];if($v['detail']==='')$v['detail']=text($l,'goods_type',100)?:text($l,'goods_custom',100);foreach(['bilty_amount','godown','loading','suzuki','rent','local_charge','advance'] as $f)$v[$f]=money($l,$f);
   $v['total']=goods_total($v,$kind);if($v['advance']>$v['total'])$warnings[]='Bilty '.$bilty.': advance is greater than the bilty total.';if($kind==='incoming'&&($v['rent']||$v['local_charge']))fail('Rent and local charges belong to bookings.');$v['_id']=filter_var($l['id']??0,FILTER_VALIDATE_INT);if($v['_id']===false||$v['_id']<0)fail('Invalid bilty identifier.');$clean[]=$v;
  }
  if($kind==='incoming'&&$current['role']==='operations'){
   if(!empty($p['id'])||!empty($p['pending_id']))fail('Operations can submit new incoming goods for approval only.',403);
   $pendingLines=[];foreach($lines as $index=>$line){$classified=goods_item_labels($clean[$index]);$pendingLines[]=[...$line,'goods_category_id'=>$classified['goods_category_id'],'goods_subcategory_id'=>$classified['goods_subcategory_id'],'goods_custom'=>$classified['goods_custom'],'goods_type'=>$classified['goods_type'],'detail'=>$classified['detail']];}
   $payload=['kind'=>'incoming','dated'=>$dated,'station_id'=>$station,'truck'=>$truck,'driver'=>$driver,'driver_mobile'=>text($p,'driver_mobile',30),'driver_cnic'=>text($p,'driver_cnic',30),'challan'=>text($p,'challan',40),'truck_amount'=>text($p,'truck_amount',20),'commission'=>'0','labour_bonus'=>text($p,'labour_bonus',20),'munshi_bonus'=>text($p,'munshi_bonus',20),'remarks'=>text($p,'remarks',500),'items'=>$pendingLines];money($p,'truck_amount');money($p,'labour_bonus');money($p,'munshi_bonus');
   $id=transaction(function()use($payload,$current){run('INSERT INTO incoming_submissions(submitted_by,submitted_name,payload) VALUES(?,?,?)',[$current['id'],$current['username'],json_encode($payload,JSON_THROW_ON_ERROR)]);$id=(int)db()->lastInsertId();audit('submitted','incoming_submission',$id);return $id;});
   response(['id'=>$id,'reference'=>'PENDING-'.$id,'pending'=>true,'warnings'=>[]],201);
  }
  if(!empty($p['pending_id'])&&($current['role']!=='super_admin'||$kind!=='incoming'||!empty($p['id'])))fail('Only the super admin can approve incoming goods.',403);
  $result=transaction(function()use($p,$kind,$dated,$station,$truck,$driver,$clean){
   if(!empty($p['pending_id'])){if(!one("SELECT id FROM incoming_submissions WHERE id=? AND status='pending'",[(int)$p['pending_id']]))throw new RuntimeException('This submission was already approved or is unavailable.',409);}
   if(!empty($p['id'])){
    $id=filter_var($p['id'],FILTER_VALIDATE_INT);if(!$id)throw new InvalidArgumentException('Invalid shipment identifier.');
    $before=shipment_snapshot($id);if(!$before['header'])throw new RuntimeException('Shipment not found.',404);
    if($before['header']['kind']!==$kind)throw new InvalidArgumentException('Shipment type cannot be changed.');
    if(!hash_equals(shipment_version($before),(string)($p['version']??'')))throw new RuntimeException('This shipment changed after you opened it. Reopen it before editing.',409);
    $existing=array_column($before['items'],null,'id');$seenIds=[];
    foreach($clean as $line){$itemId=$line['_id'];if($itemId){if(!isset($existing[$itemId])||isset($seenIds[$itemId]))throw new InvalidArgumentException('A bilty does not belong to this shipment or was repeated.');$seenIds[$itemId]=true;}}
    if(count($seenIds)!==count($existing))throw new InvalidArgumentException('Existing bilties must remain in the shipment. Edit their details instead of removing them.');
    $earliest=one('SELECT MIN(d.dated) dated FROM deliveries d JOIN delivery_items di ON di.delivery_id=d.id JOIN items i ON i.id=di.item_id WHERE i.shipment_id=?',[$id])['dated']??null;
    if($earliest&&$dated>$earliest)throw new InvalidArgumentException('Arrival date cannot be later than an existing delivery.');
    run('UPDATE shipments SET dated=?,station_id=?,truck=?,driver=?,driver_mobile=?,driver_cnic=?,challan=?,truck_amount=?,commission=?,labour_bonus=?,munshi_bonus=?,remarks=? WHERE id=?',[$dated,$station,$truck,$driver,text($p,'driver_mobile',30),text($p,'driver_cnic',30),text($p,'challan',40),money($p,'truck_amount'),money($p,'commission'),$kind==='incoming'?money($p,'labour_bonus'):0,$kind==='incoming'?money($p,'munshi_bonus'):0,text($p,'remarks',500),$id]);
    foreach($clean as $line){$itemId=$line['_id'];unset($line['_id']);$keys=array_keys($line);if($itemId){run('UPDATE items SET '.implode(',',array_map(fn($key)=>$key.'=?',$keys)).' WHERE id=? AND shipment_id=?',[...array_values($line),$itemId,$id]);}else{run('INSERT INTO items(shipment_id,'.implode(',',$keys).') VALUES('.implode(',',array_fill(0,count($keys)+1,'?')).')',[$id,...array_values($line)]);}}
    run('CREATE TABLE IF NOT EXISTS shipment_revisions(id INTEGER PRIMARY KEY,shipment_id INTEGER NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,before_json TEXT NOT NULL,after_json TEXT NOT NULL)');
    run('INSERT INTO shipment_revisions(shipment_id,actor,before_json,after_json) VALUES(?,?,?,?)',[$id,$_SESSION['username'],json_encode($before,JSON_THROW_ON_ERROR),json_encode(shipment_snapshot($id),JSON_THROW_ON_ERROR)]);
    audit('updated',$kind,$id);return ['id'=>$id,'reference'=>$before['header']['reference']];
   }
   run('INSERT INTO shipments(kind,reference,dated,station_id,truck,driver,driver_mobile,driver_cnic,challan,truck_amount,commission,labour_bonus,munshi_bonus,remarks,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[$kind,'pending',$dated,$station,$truck,$driver,text($p,'driver_mobile',30),text($p,'driver_cnic',30),text($p,'challan',40),money($p,'truck_amount'),money($p,'commission'),$kind==='incoming'?money($p,'labour_bonus'):0,$kind==='incoming'?money($p,'munshi_bonus'):0,text($p,'remarks',500),$_SESSION['username']]);$id=(int)db()->lastInsertId();$ref=($kind==='incoming'?'IN-':'BK-').str_pad((string)$id,6,'0',STR_PAD_LEFT);run('UPDATE shipments SET reference=? WHERE id=?',[$ref,$id]);foreach($clean as $line){unset($line['_id']);$keys=array_keys($line);run('INSERT INTO items(shipment_id,'.implode(',',$keys).') VALUES('.implode(',',array_fill(0,count($keys)+1,'?')).')',[$id,...array_values($line)]);}if(!empty($p['pending_id'])){run("UPDATE incoming_submissions SET status='approved',approved_by=?,approved_at=CURRENT_TIMESTAMP,shipment_id=? WHERE id=? AND status='pending'",[$_SESSION['user_id'],$id,(int)$p['pending_id']]);audit('approved','incoming_submission',(int)$p['pending_id']);}audit('created',$kind,$id);return ['id'=>$id,'reference'=>$ref];});$result['warnings']=$warnings;response($result,201);
 }
 if($action==='bilties'&&$method==='GET'){
  $where=' WHERE 1=1';$args=[];if(isset($_GET['bilty_exact'])){$where.=' AND i.bilty=?';$args[]=text($_GET,'bilty_exact',40,true);}$status=text($_GET,'status',20);if(in_array($status,['pending','delivered'],true)){$where.=' AND i.status=?';$args[]=$status;}
  if(!empty($_GET['kind'])){$where.=' AND s.kind=?';$args[]=text($_GET,'kind',10);}
  if(!empty($_GET['station_id'])){$where.=' AND s.station_id=?';$args[]=(int)$_GET['station_id'];}
  if(!empty($_GET['account_id'])){$where.=' AND i.account_id=?';$args[]=text($_GET,'account_id',40);}
  if(!empty($_GET['search'])){$where.=" AND (i.bilty LIKE ? ESCAPE '\' OR a.name LIKE ? ESCAPE '\' OR i.party_to LIKE ? ESCAPE '\' OR i.contact LIKE ? ESCAPE '\')";$args=[...$args,...array_fill(0,4,pattern())];}
  $where.=rangeWhere('s.dated',$args);$result=paged('items i JOIN shipments s ON s.id=i.shipment_id LEFT JOIN accounts a ON a.id=i.account_id LEFT JOIN stations st ON st.id=s.station_id',$where,$args,'i.*,s.reference,s.dated,s.kind,st.name station,a.name customer','s.dated DESC,i.id DESC');$result['rows']=array_map(fn($item)=>goods_item($item,$item['kind']),$result['rows']);response($result);
 }
 if($action==='deliveries'&&$method==='GET'){$args=[];$where=' WHERE 1=1';if(!empty($_GET['search'])){$where.=" AND (d.reference LIKE ? ESCAPE '\' OR d.receiver LIKE ? ESCAPE '\' OR d.mobile LIKE ? ESCAPE '\')";$args=array_fill(0,3,pattern());}$where.=rangeWhere('d.dated',$args);response(paged('deliveries d',$where,$args,'d.*,(SELECT count(*) FROM delivery_items di WHERE di.delivery_id=d.id) item_count,(SELECT sum(bilty_received+service_received) FROM delivery_items di WHERE di.delivery_id=d.id) collected','d.dated DESC,d.id DESC'));}
 if($action==='delivery'&&$method==='GET'){$id=(int)($_GET['id']??0);$d=one('SELECT * FROM deliveries WHERE id=?',[$id]);if(!$d)fail('Delivery not found.',404);$d['version']=shipment_version(delivery_snapshot($id));$d['items']=array_map(fn($item)=>goods_item($item,'incoming'),query('SELECT i.*,COALESCE(di.loading_charge,i.loading) loading,COALESCE(di.suzuki_charge,i.suzuki) suzuki,di.loading_charge delivery_loading,di.suzuki_charge delivery_suzuki,di.legacy_id delivery_source_id,di.discount,di.bilty_received,di.service_received,s.dated,s.reference,st.name station,a.name customer FROM delivery_items di JOIN items i ON i.id=di.item_id JOIN shipments s ON s.id=i.shipment_id LEFT JOIN stations st ON st.id=s.station_id LEFT JOIN accounts a ON a.id=i.account_id WHERE di.delivery_id=?',[$id]));
  if($d['legacy_id']!==null){
   $h=one("SELECT DOCNO,DATED,REC_DATE1,REC_NAME1,REC_CNIC1,REC_MOBILE1 FROM legacy_INH WHERE INHNO=? AND INTYPE='GD'",[$d['legacy_id']]);
   if($h){
    $d['print_header']=['reference'=>$h['DOCNO'],'dated'=>$h['DATED'],'received_date'=>$h['REC_DATE1'],'receiver'=>$h['REC_NAME1'],'cnic'=>$h['REC_CNIC1'],'mobile'=>$h['REC_MOBILE1']];
    $source=query("SELECT l.INDNO,l.BILLTYNO,l.PARTY_TO,l.QTY,l.BILLTY_AMT,l.GODOWN_CHG,l.LOADING_AMT,l.SUZUKI_KIRAYA,l.REC_BAMT,l.REC_SAMT,l.DISC_AMT,w.WTITLE customer FROM legacy_IND l JOIN legacy_WORKING w ON l.PLCODE=w.WLCODE AND l.PMCODE=w.WMCODE AND l.PWCODE=w.WCODE WHERE l.INHNO=? ORDER BY l.INDNO",[$d['legacy_id']]);
    $d['print_items']=array_map(function($r){$line=['bilty'=>(string)$r['BILLTYNO'],'party_to'=>$r['PARTY_TO'],'qty'=>$r['QTY'],'customer'=>$r['customer'],'source_id'=>$r['INDNO']];foreach(['bilty_amount'=>'BILLTY_AMT','godown'=>'GODOWN_CHG','loading'=>'LOADING_AMT','suzuki'=>'SUZUKI_KIRAYA','bilty_received'=>'REC_BAMT','service_received'=>'REC_SAMT','discount'=>'DISC_AMT'] as $key=>$column)$line[$key]=(int)round((float)($r[$column]??0)*100);return $line;},$source);
   }
  }
  if(isset($d['print_items'])){
   foreach($d['print_items'] as &$printLine){foreach($d['items'] as &$item){if((string)$item['delivery_source_id']!==(string)$printLine['source_id'])continue;
    foreach(['discount','bilty_received','service_received'] as $key)$printLine[$key]=$item[$key];
    if($item['delivery_loading']!==null)$printLine['loading']=(int)$item['delivery_loading'];
    if($item['delivery_suzuki']!==null)$printLine['suzuki']=(int)$item['delivery_suzuki'];
   }unset($item);}unset($printLine);
   if(one("SELECT id FROM delivery_revisions WHERE delivery_id=? LIMIT 1",[$id]))$d['print_header']=['reference'=>$d['reference'],'dated'=>$d['dated'],'received_date'=>$d['dated'],'receiver'=>$d['receiver'],'cnic'=>$d['cnic'],'mobile'=>$d['mobile']];
  }
  response($d);}
 if($action==='update_delivery'&&$method==='POST'){
  $id=(int)($p['id']??0);$dated=day($p);$receiver=text($p,'receiver',100,true);$lines=$p['items']??[];
  if(!is_array($lines)||count($lines)<1||count($lines)>1000)fail('Keep between 1 and 1000 bilties in the delivery.');
  $clean=[];foreach($lines as $line){$itemId=filter_var($line['id']??null,FILTER_VALIDATE_INT);if(!$itemId||isset($clean[$itemId]))fail('Each delivery bilty must appear once.');$clean[$itemId]=['discount'=>money($line,'discount'),'bilty_received'=>money($line,'bilty_received'),'service_received'=>money($line,'service_received'),'loading'=>array_key_exists('loading',$line)?money($line,'loading'):null,'suzuki'=>array_key_exists('suzuki',$line)?money($line,'suzuki'):null];}
  $warnings=[];$result=transaction(function()use($p,$id,$dated,$receiver,$clean,&$warnings){
   $before=delivery_snapshot($id);if(!$before['header'])throw new InvalidArgumentException('Delivery not found.');
   if(!hash_equals(shipment_version($before),(string)($p['version']??'')))throw new RuntimeException('This delivery changed after you opened it. Reopen it before editing.',409);
   $existing=array_column($before['items'],null,'item_id');if(array_diff_key($existing,$clean)||array_diff_key($clean,$existing))throw new InvalidArgumentException('Keep the original bilties in this delivery.');
   foreach($clean as $itemId=>$line){$item=one('SELECT i.*,s.dated FROM items i JOIN shipments s ON s.id=i.shipment_id WHERE i.id=?',[$itemId]);if($dated<$item['dated'])throw new InvalidArgumentException('Delivery date cannot be earlier than arrival.');if($line['discount']+$line['bilty_received']>max(0,goods_total($item,'incoming')-(int)$item['advance']))$warnings[]='Bilty '.$item['bilty'].': cash plus discount is above the remaining bilty amount.';if($line['service_received']>($line['loading']??$existing[$itemId]['loading_charge']??$item['loading'])+($line['suzuki']??$existing[$itemId]['suzuki_charge']??$item['suzuki']))$warnings[]='Bilty '.$item['bilty'].': service cash is greater than loading plus Suzuki charges.';}
   run('UPDATE deliveries SET dated=?,receiver=?,mobile=?,cnic=?,remarks=? WHERE id=?',[$dated,$receiver,text($p,'mobile',30),text($p,'cnic',30),text($p,'remarks',500),$id]);
   foreach($clean as $itemId=>$line)run('UPDATE delivery_items SET discount=?,bilty_received=?,service_received=?,loading_charge=COALESCE(?,loading_charge),suzuki_charge=COALESCE(?,suzuki_charge) WHERE delivery_id=? AND item_id=?',[$line['discount'],$line['bilty_received'],$line['service_received'],$line['loading'],$line['suzuki'],$id,$itemId]);
   run('INSERT INTO delivery_revisions(delivery_id,actor,before_json,after_json) VALUES(?,?,?,?)',[$id,$_SESSION['username'],json_encode($before,JSON_THROW_ON_ERROR),json_encode(delivery_snapshot($id),JSON_THROW_ON_ERROR)]);audit('updated','delivery',$id);
   return ['id'=>$id,'reference'=>$before['header']['reference']];
  });$result['warnings']=$warnings;response($result);
 }
 if($action==='save_delivery'&&$method==='POST'){
  $dated=day($p);$receiver=text($p,'receiver',100,true);$lines=$p['items']??[];if(!is_array($lines)||count($lines)<1||count($lines)>1000)fail('Select between 1 and 1000 pending bilties.');$ids=[];$clean=[];
  foreach($lines as $l){$id=filter_var($l['id']??0,FILTER_VALIDATE_INT);if(!$id||isset($ids[$id]))fail('Select each bilty once.');$ids[$id]=true;$clean[]=['id'=>$id,'discount'=>money($l,'discount'),'bilty_received'=>money($l,'bilty_received'),'service_received'=>money($l,'service_received'),'loading'=>array_key_exists('loading',$l)?money($l,'loading'):null,'suzuki'=>array_key_exists('suzuki',$l)?money($l,'suzuki'):null];}
  $warnings=[];$result=transaction(function()use($p,$dated,$receiver,$clean,&$warnings){foreach($clean as $l){$item=one("SELECT i.*,s.kind,s.dated FROM items i JOIN shipments s ON s.id=i.shipment_id WHERE i.id=? AND i.status='pending' AND s.kind='incoming'",[$l['id']]);if(!$item||one('SELECT id FROM delivery_items WHERE item_id=?',[$l['id']]))throw new RuntimeException('A selected bilty is no longer pending. Refresh the list.',409);if($dated<$item['dated'])throw new InvalidArgumentException('Delivery date cannot be earlier than the arrival date.');$remaining=max(0,goods_total($item,'incoming')-(int)$item['advance']);if($l['discount']+$l['bilty_received']>$remaining)$warnings[]='Bilty '.$item['bilty'].': cash plus discount is greater than the remaining bilty amount.';if($l['service_received']>max(0,($l['loading']??(int)$item['loading'])+($l['suzuki']??(int)$item['suzuki'])))$warnings[]='Bilty '.$item['bilty'].': service cash is greater than loading plus Suzuki charges.';}
   run('INSERT INTO deliveries(reference,dated,receiver,mobile,cnic,remarks) VALUES(?,?,?,?,?,?)',['pending-'.bin2hex(random_bytes(8)),$dated,$receiver,text($p,'mobile',30),text($p,'cnic',30),text($p,'remarks',500)]);$id=(int)db()->lastInsertId();$ref='DL-'.str_pad((string)$id,6,'0',STR_PAD_LEFT);run('UPDATE deliveries SET reference=? WHERE id=?',[$ref,$id]);foreach($clean as $l){if($l['loading']!==null||$l['suzuki']!==null){run('UPDATE items SET loading=COALESCE(?,loading),suzuki=COALESCE(?,suzuki) WHERE id=?',[$l['loading'],$l['suzuki'],$l['id']]);audit('delivery_charges','item',$l['id']);}run('INSERT INTO delivery_items(delivery_id,item_id,discount,bilty_received,service_received,loading_charge,suzuki_charge) VALUES(?,?,?,?,?,(SELECT loading FROM items WHERE id=?),(SELECT suzuki FROM items WHERE id=?))',[$id,$l['id'],$l['discount'],$l['bilty_received'],$l['service_received'],$l['id'],$l['id']]);run("UPDATE items SET status='delivered' WHERE id=?",[$l['id']]);}audit('created','delivery',$id);return ['id'=>$id,'reference'=>$ref];});$result['warnings']=$warnings;response($result,201);
 }
 if($action==='vouchers'&&$method==='GET'){$args=[];$w=' WHERE 1=1';if(!empty($_GET['search'])){$w.=" AND (v.reference LIKE ? ESCAPE '\' OR v.memo LIKE ? ESCAPE '\')";$args=[pattern(),pattern()];}$w.=rangeWhere('v.dated',$args);response(paged('vouchers v',$w,$args,'v.*,(SELECT sum(debit) FROM voucher_lines l WHERE l.voucher_id=v.id) amount','v.dated DESC,v.id DESC'));}
 if($action==='voucher'&&$method==='GET'){$v=one('SELECT * FROM vouchers WHERE id=?',[(int)($_GET['id']??0)]);if(!$v)fail('Voucher not found.',404);$v['lines']=query('SELECT l.*,a.name account FROM voucher_lines l JOIN accounts a ON a.id=l.account_id WHERE voucher_id=?',[$v['id']]);response($v);}
 if($action==='save_voucher'&&$method==='POST'){
  $kind=text($p,'kind',2,true);if(!in_array($kind,['RV','PV','JV'],true))fail('Invalid voucher type.');$dated=day($p);$memo=text($p,'memo',500,true);$lines=$p['lines']??[];if(!is_array($lines)||count($lines)<2||count($lines)>50)fail('A voucher needs between 2 and 50 account lines.');$debit=0;$credit=0;$clean=[];
  foreach($lines as $l){$a=text($l,'account_id',40,true);if(!one("SELECT id FROM accounts WHERE id=? AND status='A'",[$a]))fail('Select an active account.');$dr=money($l,'debit');$cr=money($l,'credit');if(($dr>0)==($cr>0))fail('Each line needs either a debit or a credit.');$debit+=$dr;$credit+=$cr;$clean[]=[$a,$dr,$cr];}if($debit!==$credit||$debit===0)fail('Debits and credits must balance.');
  if($kind!=='JV'){$cash=array_filter($clean,fn($l)=>str_starts_with($l[0],'1-101-')||str_starts_with($l[0],'1-106-'));if(!$cash)fail('Receipt and payment vouchers need a cash or bank account.');$net=array_sum(array_column($cash,1))-array_sum(array_column($cash,2));if(($kind==='RV'&&$net<=0)||($kind==='PV'&&$net>=0))fail('The cash/bank direction does not match the voucher type.');}
  $r=transaction(function()use($kind,$dated,$memo,$clean){run('INSERT INTO vouchers(reference,kind,dated,memo,created_by) VALUES(?,?,?,?,?)',['pending-'.bin2hex(random_bytes(8)),$kind,$dated,$memo,$_SESSION['username']]);$id=(int)db()->lastInsertId();$ref=$kind.'-'.str_pad((string)$id,6,'0',STR_PAD_LEFT);run('UPDATE vouchers SET reference=? WHERE id=?',[$ref,$id]);foreach($clean as $l)run('INSERT INTO voucher_lines(voucher_id,account_id,debit,credit) VALUES(?,?,?,?)',[$id,...$l]);audit('posted','voucher',$id);return ['id'=>$id,'reference'=>$ref];});response($r,201);
 }
 if($action==='ledger'&&$method==='GET'){
  $account=one('SELECT * FROM accounts WHERE id=?',[text($_GET,'account_id',40,true)]);if(!$account)fail('Account not found.',404);
  $historyStart=one("SELECT value FROM meta WHERE key='history_start'")['value']??'2017-10-28';
  $from=day(['dated'=>$_GET['from']??$historyStart]);$to=day(['dated'=>$_GET['to']??date('Y-m-d')]);if($from>$to)fail('Start date must be before end date.');
  $until=(new DateTimeImmutable($to))->modify('+1 day')->format('Y-m-d');
  $entries="SELECT dated,kind,reference,memo,debit,credit,COALESCE(sequence,source_rowid) seq,source_rowid row_id,'Original' source,0 source_order FROM historical_ledger WHERE account_id=? UNION ALL SELECT v.dated,v.kind,v.reference,v.memo,l.debit,l.credit,l.id seq,l.id row_id,'New app' source,1 source_order FROM voucher_lines l JOIN vouchers v ON v.id=l.voucher_id WHERE l.account_id=?";
  $ids=[$account['id'],$account['id']];
  $stats=one('WITH entries AS ('.$entries.') SELECT count(*) all_time_count,min(dated) first_date,max(dated) last_date,coalesce(sum(CASE WHEN dated<? THEN debit-credit ELSE 0 END),0) prior_net,coalesce(sum(CASE WHEN dated>=? AND dated<? THEN debit ELSE 0 END),0) debit,coalesce(sum(CASE WHEN dated>=? AND dated<? THEN credit ELSE 0 END),0) credit,sum(CASE WHEN dated>=? AND dated<? THEN 1 ELSE 0 END) period_count FROM entries',[...$ids,$from,$from,$until,$from,$until,$from,$until]);
  $opening=(int)$account['opening_dr']-(int)$account['opening_cr']+(int)$stats['prior_net'];$total=(int)$stats['period_count'];$page=max(0,min(max(0,(int)ceil($total/30)-1),(int)($_GET['page']??0)));
  $rows=query('WITH entries AS ('.$entries.'), period AS (SELECT * FROM entries WHERE dated>=? AND dated<?), running AS (SELECT *,?+SUM(debit-credit) OVER(ORDER BY dated,source_order,seq,row_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) balance FROM period) SELECT * FROM running ORDER BY dated,source_order,seq,row_id LIMIT 30 OFFSET '.($page*30),[...$ids,$from,$until,$opening]);
  response(['account'=>$account,'from'=>$from,'to'=>$to,'history_start'=>$historyStart,'first_date'=>$stats['first_date'],'last_date'=>$stats['last_date'],'all_time_count'=>(int)$stats['all_time_count'],'opening'=>$opening,'closing'=>$opening+(int)$stats['debit']-(int)$stats['credit'],'debit'=>(int)$stats['debit'],'credit'=>(int)$stats['credit'],'rows'=>$rows,'total'=>$total,'page'=>$page,'page_size'=>30,'notice'=>'Original ledger entries are stored in this application database alongside new vouchers. Historical balances still need reconciliation. Goods and delivery entries do not post accounting vouchers automatically.']);
 }
 if($action==='financial_report'&&$method==='GET'){
  $report=text($_GET,'report',24,true);if(!in_array($report,['trial','balances','daybook','journal','vouchers'],true))fail('Choose an available report.');
  $from=day(['dated'=>$_GET['from']??one("SELECT value FROM meta WHERE key='history_start'")['value']??'2017-10-28']);$to=day(['dated'=>$_GET['to']??date('Y-m-d')]);if($from>$to)fail('Start date must be before end date.');
  $until=(new DateTimeImmutable($to))->modify('+1 day')->format('Y-m-d');
  $entries="SELECT account_id,dated,kind,reference,memo,debit,credit,source_rowid row_id,'Original' source FROM historical_ledger UNION ALL SELECT l.account_id,v.dated,v.kind,v.reference,v.memo,l.debit,l.credit,l.id row_id,'New app' source FROM voucher_lines l JOIN vouchers v ON v.id=l.voucher_id";
  if(in_array($report,['trial','balances'],true)){
   $where=$report==='balances'?' WHERE a.customer=1':' WHERE 1=1';$args=[$from,$from,$until,$from,$until,$until];
   if(!empty($_GET['search'])){$where.=" AND (a.name LIKE ? ESCAPE '\\' OR a.id LIKE ? ESCAPE '\\')";$args[] = pattern();$args[] = pattern();}
   $base='WITH entries AS ('.$entries.'), totals AS (SELECT account_id,SUM(CASE WHEN dated<? THEN debit-credit ELSE 0 END) prior_net,SUM(CASE WHEN dated>=? AND dated<? THEN debit ELSE 0 END) debit,SUM(CASE WHEN dated>=? AND dated<? THEN credit ELSE 0 END) credit FROM entries WHERE dated<? GROUP BY account_id), balances AS (SELECT a.id,a.name,a.group_code,a.customer,a.opening_dr-a.opening_cr+COALESCE(t.prior_net,0) opening,COALESCE(t.debit,0) debit,COALESCE(t.credit,0) credit,a.opening_dr-a.opening_cr+COALESCE(t.prior_net,0)+COALESCE(t.debit,0)-COALESCE(t.credit,0) closing FROM accounts a LEFT JOIN totals t ON t.account_id=a.id'.$where.') ';
   $stats=one($base.'SELECT count(*) total,COALESCE(SUM(opening),0) opening,COALESCE(SUM(debit),0) debit,COALESCE(SUM(credit),0) credit,COALESCE(SUM(CASE WHEN closing>0 THEN closing ELSE 0 END),0) closing_dr,COALESCE(SUM(CASE WHEN closing<0 THEN -closing ELSE 0 END),0) closing_cr FROM balances',$args);
   $page=max(0,min(max(0,(int)ceil((int)$stats['total']/30)-1),(int)($_GET['page']??0)));
   $rows=query($base.'SELECT * FROM balances ORDER BY name COLLATE NOCASE,id LIMIT 30 OFFSET '.($page*30),$args);
   response(['report'=>$report,'from'=>$from,'to'=>$to,'rows'=>$rows,'stats'=>$stats,'total'=>(int)$stats['total'],'page'=>$page,'page_size'=>30]);
  }
  $where=' WHERE e.dated>=? AND e.dated<?';$args=[$from,$until];if($report==='journal')$where.=" AND e.kind='JV'";if($report==='vouchers')$where.=" AND e.source='New app'";
  if(!empty($_GET['search'])){$where.=" AND (e.reference LIKE ? ESCAPE '\\' OR e.memo LIKE ? ESCAPE '\\' OR a.name LIKE ? ESCAPE '\\' OR e.account_id LIKE ? ESCAPE '\\')";$args=[...$args,...array_fill(0,4,pattern())];}
  $base='WITH entries AS ('.$entries.') ';$join=' FROM entries e LEFT JOIN accounts a ON a.id=e.account_id'.$where;
  $stats=one($base.'SELECT count(*) total,COALESCE(SUM(e.debit),0) debit,COALESCE(SUM(e.credit),0) credit'.$join,$args);
  $page=max(0,min(max(0,(int)ceil((int)$stats['total']/30)-1),(int)($_GET['page']??0)));
  $rows=query($base.'SELECT e.*,a.name account'.$join.' ORDER BY e.dated DESC,e.source,e.row_id DESC LIMIT 30 OFFSET '.($page*30),$args);
  response(['report'=>$report,'from'=>$from,'to'=>$to,'rows'=>$rows,'stats'=>$stats,'total'=>(int)$stats['total'],'page'=>$page,'page_size'=>30]);
 }
 if($action==='imported_tables'&&$method==='GET'){
  $tables=query("SELECT name FROM sqlite_master WHERE type='table' AND name GLOB 'legacy_*' ORDER BY name");
  foreach($tables as &$t){$t['count']=(int)one('SELECT count(*) n FROM "'.$t['name'].'"')['n'];$t['label']=substr($t['name'],7);}unset($t);
  response(['tables'=>$tables,'ledger_rows'=>(int)one('SELECT count(*) n FROM historical_ledger')['n'],'incomplete_account_rows'=>(int)one('SELECT count(*) n FROM historical_ledger WHERE account_id IS NULL')['n'],'undated_ledger_rows'=>(int)one('SELECT count(*) n FROM historical_ledger WHERE dated IS NULL')['n'],'source_archive'=>one("SELECT value FROM meta WHERE key='source_archive'")['value']??'']);
 }
 if($action==='imported_rows'&&$method==='GET'){
  $table=text($_GET,'table',60,true);if(!preg_match('/^legacy_[A-Z_]+$/D',$table)||!one("SELECT name FROM sqlite_master WHERE type='table' AND name=?",[$table]))fail('Choose an imported table.');
  $cols=query('PRAGMA table_info("'.$table.'")');$where='';$params=[];
  if(!empty($_GET['search'])){$where=' WHERE '.implode(' OR ',array_map(fn($c)=>"CAST(\"".$c['name']."\" AS TEXT) LIKE ? ESCAPE '!'",$cols));$term='%'.str_replace(['!','%','_'],['!!','!%','!_'],mb_substr((string)$_GET['search'],0,120)).'%';$params=array_fill(0,count($cols),$term);}
  $r=paged('"'.$table.'"',$where,$params,'rowid _source_row,*','rowid');$r['columns']=array_column($cols,'name');response($r);
 }
 if($action==='account_groups'&&$method==='GET')response(query('SELECT MLCODE,MCODE,MTITLE FROM legacy_MAIN ORDER BY MLCODE,MCODE'));
 if($action==='save_account'&&$method==='POST'){
  $name=text($p,'name',100,true);$group=text($p,'group',12,true);$parts=explode('-',$group);if(count($parts)!==2)fail('Choose an account group.');
  $statement=db()->prepare('SELECT * FROM legacy_MAIN WHERE MLCODE=? AND MCODE=?');$statement->execute($parts);$groupRow=$statement->fetch();if(!$groupRow)fail('Choose an existing account group.');
  $dr=money($p,'opening_dr');$cr=money($p,'opening_cr');if($dr&&$cr)fail('Enter an opening balance on one side only.');
  $id=transaction(function()use($p,$name,$parts,$groupRow,$dr,$cr){$prefix=$parts[0].'-'.$parts[1].'-';$next=(int)one('SELECT max(CAST(substr(id,?) AS INTEGER)) n FROM accounts WHERE group_code=?',[strlen($prefix)+1,$parts[1]])['n']+1;do{$id=$prefix.str_pad((string)$next++,3,'0',STR_PAD_LEFT);}while(one('SELECT id FROM accounts WHERE id=?',[$id]));run('INSERT INTO accounts(id,name,group_code,group_name,customer,address,mobile,opening_dr,opening_cr) VALUES(?,?,?,?,?,?,?,?,?)',[$id,$name,$parts[1],$groupRow['MTITLE'],str_starts_with($groupRow['MTITLE'],'CUSTOMERS')?1:0,text($p,'address',200),text($p,'mobile',40),$dr,$cr]);audit('created','account',$id);return $id;});response(['id'=>$id],201);
 }
 if($action==='stations'&&$method==='GET')response(query('SELECT * FROM stations ORDER BY name'));
 if($action==='save_station'&&$method==='POST'){$name=text($p,'name',100,true);$id=(int)($p['id']??0);transaction(function()use($p,$name,$id){if($id){if(!one('SELECT id FROM stations WHERE id=?',[$id]))throw new InvalidArgumentException('Station not found.');run('UPDATE stations SET name=?,address=? WHERE id=?',[$name,text($p,'address',300),$id]);}else{run('INSERT INTO stations(name,address) VALUES(?,?)',[$name,text($p,'address',300)]);$id=(int)db()->lastInsertId();}audit('saved','station',$id);});response(['ok'=>true]);}
 if($action==='backup_list'&&$method==='GET')response(backup_dashboard());
 if($action==='backup'&&$method==='POST'){set_time_limit(0);$result=create_workspace_backup();response([...$result,'filename'=>$result['backup']['id'].'.sqlite','message'=>'Verified backup saved.']);}
 if($action==='backup_restore'&&$method==='POST'){
  if(text($p,'confirmation',20)!=='RESTORE')fail('Type RESTORE to confirm.');
  if(!password_verify(text($p,'password',128,true),$current['password']))fail('Current password is incorrect.');
  $result=restore_workspace_backup(text($p,'backup_id',100,true),$current);$_SESSION=[];session_destroy();response($result);
 }
 if($action==='settings'&&$method==='GET')response(['user'=>$_SESSION['username'],'backup_date'=>one("SELECT value FROM meta WHERE key='backup_date'")['value']??'2026-10-31','meta'=>query('SELECT * FROM meta'),'audit'=>query('SELECT * FROM audit ORDER BY id DESC LIMIT 20')]);
 fail('This action was not found.',404);
}catch(JsonException){fail('Invalid JSON request.',400);}catch(InvalidArgumentException $e){fail($e->getMessage());}catch(RuntimeException $e){if(in_array($e->getCode(),[409,503],true))fail($e->getMessage(),$e->getCode());error_log('APG: '.$e->getMessage());fail('Unable to complete the request. No changes were saved.',500);}catch(Throwable $e){error_log('APG: '.$e->getMessage());fail('Unable to complete the request. No changes were saved.',500);}
