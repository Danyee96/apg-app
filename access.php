<?php
declare(strict_types=1);

function permission_catalog(): array {
 return [
  'overview.view'=>['Dashboard & overview','View business-wide counts, shipment trends and recent activity.','Workspace'],
  'incoming.view'=>['View incoming goods','Search arrivals and incoming bilties.','Goods'],
  'incoming.create'=>['Record incoming goods','Create arrivals and their bilties.','Goods'],
  'incoming.edit'=>['Edit incoming goods','Correct saved arrivals, bilties and charges.','Goods'],
  'booking.view'=>['View bookings','Search outgoing bookings and bilties.','Goods'],
  'booking.create'=>['Create bookings','Record outgoing shipments.','Goods'],
  'booking.edit'=>['Edit bookings','Correct saved bookings, bilties and charges.','Goods'],
  'deliveries.view'=>['View deliveries','Read handover details and collected amounts.','Goods'],
  'deliveries.create'=>['Record deliveries','Hand over pending incoming goods.','Goods'],
  'deliveries.edit'=>['Edit deliveries','Correct saved receiver details, charges and collections.','Goods'],
  'customers.view'=>['View customers','Read customer names, contacts and addresses.','Customers'],
  'customers.manage'=>['Manage customers','Create and edit customer records.','Customers'],
  'vouchers.view'=>['View vouchers','Read accounting vouchers posted in this app.','Finance'],
  'vouchers.create'=>['Post vouchers','Create balanced receipts, payments and journals.','Finance'],
  'ledger.view'=>['View account ledgers','Read account heads, balances and transaction history.','Finance'],
  'accounts.create'=>['Create account heads','Create accounts and their opening balances.','Finance'],
  'reports.view'=>['View financial reports','Read calculated balances and accounting reports.','Finance'],
  'settings.view'=>['View workspace settings','Read station details and the workspace audit log.','Administration'],
  'stations.manage'=>['Manage stations','Add and edit stations.','Administration'],
  'backups.create'=>['Create database backups','Create a full snapshot in private server storage.','Administration'],
  'archive.view'=>['Browse imported backup','Read all original recovered source tables.','Administration'],
 ];
}
function permission_dependencies(): array {
 return ['deliveries.edit'=>['deliveries.view','incoming.view'],'incoming.edit'=>['incoming.view'],'booking.edit'=>['booking.view'],'incoming.create'=>['incoming.view'],'booking.create'=>['booking.view'],'deliveries.create'=>['deliveries.view','incoming.view'],'customers.manage'=>['customers.view'],'vouchers.create'=>['vouchers.view','ledger.view'],'accounts.create'=>['ledger.view'],'reports.view'=>['ledger.view'],'stations.manage'=>['settings.view'],'backups.create'=>['settings.view']];
}
function role_presets(): array {
 $goods=['incoming.view','incoming.create','booking.view','booking.create','deliveries.view','deliveries.create','customers.view'];
 return [
  'manager'=>['label'=>'Manager','permissions'=>array_values(array_diff(array_keys(permission_catalog()),['backups.create','archive.view']))],
  'accountant'=>['label'=>'Accountant','permissions'=>['customers.view','customers.manage','vouchers.view','vouchers.create','ledger.view','accounts.create','reports.view']],
  'operations'=>['label'=>'Munshi','permissions'=>['overview.view',...$goods,'customers.manage']],
  'viewer'=>['label'=>'Viewer','permissions'=>['overview.view','incoming.view','booking.view','deliveries.view','customers.view']],
  'custom'=>['label'=>'Custom','permissions'=>[]],
 ];
}
function migrate_access(): void {
 if(one("SELECT value FROM meta WHERE key='user_access_version'")['value']??null)return;
 transaction(function(){
  if(one("SELECT value FROM meta WHERE key='user_access_version'")['value']??null)return;
  $columns=array_column(query('PRAGMA table_info(users)'),'name');
  $additions=['full_name'=>"TEXT NOT NULL DEFAULT ''",'email'=>"TEXT NOT NULL DEFAULT ''",'phone'=>"TEXT NOT NULL DEFAULT ''",'job_title'=>"TEXT NOT NULL DEFAULT ''",'bio'=>"TEXT NOT NULL DEFAULT ''",'avatar'=>"TEXT NOT NULL DEFAULT ''",'role'=>"TEXT NOT NULL DEFAULT 'custom'",'permissions'=>"TEXT NOT NULL DEFAULT '[]'",'active'=>'INTEGER NOT NULL DEFAULT 1','auth_version'=>'INTEGER NOT NULL DEFAULT 1','version'=>'INTEGER NOT NULL DEFAULT 1','last_login'=>'TEXT','updated_at'=>'TEXT'];
  foreach($additions as $name=>$type){if(!in_array($name,$columns,true))run('ALTER TABLE users ADD COLUMN '.$name.' '.$type);}
  // Preserve the original account, username, password hash and logged-in session.
  if(!one("SELECT id FROM users WHERE role='super_admin'"))run("UPDATE users SET role='super_admin' WHERE id=(SELECT MIN(id) FROM users)");
  run("INSERT INTO audit(actor,action,entity,entity_id) VALUES('system','enabled user access','workspace','1')");
  run("INSERT OR REPLACE INTO meta(key,value) VALUES('user_access_version','1')");
 });
}
function effective_permissions(array $user): array {
 if($user['role']==='super_admin')return array_keys(permission_catalog());
 $permissions=array_values(array_intersect(array_keys(permission_catalog()),json_decode($user['permissions'],true)?:[]));
 return $user['role']==='operations'?array_values(array_diff($permissions,['incoming.edit','ledger.view','reports.view','backups.create','archive.view'])):$permissions;
}
function can_access(array $user,string $permission): bool {return $user['role']==='super_admin'||in_array($permission,effective_permissions($user),true);}
function require_permission(array $user,string $permission): void {if(!can_access($user,$permission))response(['error'=>'You do not have permission to perform this action. Ask your super admin for access.','code'=>'permission_denied'],403);}
function public_user(array $user): array {
 $keys=['id','username','full_name','email','phone','job_title','bio','avatar','role','active','version','created_at','last_login'];
 $result=array_intersect_key($user,array_flip($keys));$result['permissions']=effective_permissions($user);return $result;
}
function current_user(): ?array {
 $user=null;
 if(isset($_SESSION['user_id']))$user=one('SELECT * FROM users WHERE id=?',[(int)$_SESSION['user_id']]);
 elseif(isset($_SESSION['username'])){
  $legacy=one("SELECT * FROM users WHERE username=? AND role='super_admin'",[$_SESSION['username']]);
  if($legacy){$user=$legacy;$_SESSION['user_id']=(int)$user['id'];$_SESSION['auth_version']=(int)$user['auth_version'];}
 }
 if(!$user||!(int)$user['active']||(int)($_SESSION['auth_version']??0)!==(int)$user['auth_version']){
  unset($_SESSION['username'],$_SESSION['user_id'],$_SESSION['auth_version']);return null;
 }
 $_SESSION['username']=$user['username'];return $user;
}
function sign_in_user(array $user): void {session_regenerate_id(true);$_SESSION['username']=$user['username'];$_SESSION['user_id']=(int)$user['id'];$_SESSION['auth_version']=(int)$user['auth_version'];}
function valid_permissions(mixed $input): array {
 if(!is_array($input)||!array_is_list($input)||count($input)>count(permission_catalog()))fail('Choose valid permissions.');
 foreach($input as $key){if(!is_string($key)||!array_key_exists($key,permission_catalog()))fail('An unknown permission was selected.');}
 $result=array_values(array_unique($input));
 do{$before=count($result);foreach(permission_dependencies() as $key=>$dependencies){if(in_array($key,$result,true))$result=array_values(array_unique([...$result,...$dependencies]));}}while(count($result)>$before);
 return $result;
}
function new_password(array $p,string $key='password'): string {
 $value=$p[$key]??null;if(!is_string($value)||mb_strlen($value)<10||strlen($value)>72||str_contains($value,"\0")||trim($value)!==$value)fail('Use at least 10 characters and no more than 72 bytes, without leading or trailing spaces.');return $value;
}
function profile_fields(array $p): array {
 $email=text($p,'email',120);if($email&&!filter_var($email,FILTER_VALIDATE_EMAIL))fail('Enter a valid email address.');
 return [text($p,'full_name',100,true),$email,text($p,'phone',40),text($p,'job_title',80),text($p,'bio',500)];
}
function profile_avatar(array $p,string $existing): string {
 if(!array_key_exists('avatar',$p))return $existing;
 $data=$p['avatar'];if($data==='')return '';if(!is_string($data)||strlen($data)>180000||!preg_match('~^data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$~D',$data,$match))fail('Choose a JPEG, PNG or WebP profile photo.');
 $raw=base64_decode($match[2],true);if($raw===false)fail('The profile photo is invalid.');
 $info=@getimagesizefromstring($raw);if(!$info||!in_array($info['mime'],['image/jpeg','image/png','image/webp'],true)||$info[0]>2048||$info[1]>2048||$info[0]*$info[1]>4194304)fail('Choose an image no larger than 2048 × 2048 pixels.');
 if(!extension_loaded('gd'))fail('Profile photos require the GD image extension on this server.',503);
 $image=@imagecreatefromstring($raw);if(!$image)fail('This photo could not be read.');
 $size=min($info[0],$info[1]);$thumb=imagecreatetruecolor(256,256);$white=imagecolorallocate($thumb,255,255,255);imagefill($thumb,0,0,$white);
 imagecopyresampled($thumb,$image,0,0,(int)(($info[0]-$size)/2),(int)(($info[1]-$size)/2),256,256,$size,$size);
 ob_start();imagejpeg($thumb,null,85);$jpeg=ob_get_clean();imagedestroy($image);imagedestroy($thumb);
 return 'data:image/jpeg;base64,'.base64_encode($jpeg);
}
function access_routes(string $action,string $method,array $p,array $user): void {
 if($action==='profile'&&$method==='GET')response(public_user($user));
 if($action==='save_profile'&&$method==='POST'){
  foreach(['role','permissions','active','id','username','password','auth_version'] as $key){if(array_key_exists($key,$p))fail('Profile updates cannot change account access.',403);}
  $fields=profile_fields($p);$avatar=profile_avatar($p,$user['avatar']);
  transaction(function()use($fields,$avatar,$user){run('UPDATE users SET full_name=?,email=?,phone=?,job_title=?,bio=?,avatar=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?',[...$fields,$avatar,$user['id']]);audit('updated profile','user',$user['id']);});
  response(public_user(one('SELECT * FROM users WHERE id=?',[$user['id']])));
 }
 if($action==='change_password'&&$method==='POST'){
  $current=$p['current_password']??'';if(!is_string($current)||!password_verify($current,$user['password']))fail('Your current password is incorrect.');$password=new_password($p,'new_password');
  transaction(function()use($password,$user){run('UPDATE users SET password=?,auth_version=auth_version+1,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?',[password_hash($password,PASSWORD_DEFAULT),$user['id']]);audit('changed password','user',$user['id']);});
  $fresh=one('SELECT * FROM users WHERE id=?',[$user['id']]);sign_in_user($fresh);response(['ok'=>true]);
 }
 if(!in_array($action,['users','user','save_user'],true))return;
 if($user['role']!=='super_admin')fail('Only the super admin can manage users and permissions.',403);
 if($action==='users'&&$method==='GET'){
  $where='';$args=[];if(!empty($_GET['search'])){$where=" WHERE username LIKE ? ESCAPE '\\' OR full_name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\'";$args=[pattern(),pattern(),pattern()];}
  $r=paged('users',$where,$args,'*',"CASE WHEN role='super_admin' THEN 0 ELSE 1 END,full_name COLLATE NOCASE,username");$r['rows']=array_map('public_user',$r['rows']);$r['catalog']=permission_catalog();$r['roles']=role_presets();$r['dependencies']=permission_dependencies();$r['counts']=one("SELECT count(*) total,sum(active=1) active,sum(active=0) inactive FROM users");response($r);
 }
 if($action==='user'&&$method==='GET'){$target=one('SELECT * FROM users WHERE id=?',[(int)($_GET['id']??0)]);if(!$target)fail('User not found.',404);response(public_user($target));}
 if($action==='save_user'&&$method==='POST'){
  $id=(int)($p['id']??0);$old=$id?one('SELECT * FROM users WHERE id=?',[$id]):null;if($id&&!$old)fail('User not found.',404);
  $username=text($p,'username',40,true);if(!preg_match('/^[A-Za-z0-9][A-Za-z0-9_.@-]{2,39}$/D',$username)&&(!$old||$username!==$old['username']))fail('Use a username of 3–40 letters, numbers, dots, underscores, @ or hyphens.');
  if($old&&$username!==$old['username'])fail('Existing usernames cannot be changed.');
  $role=text($p,'role',24,true);$active=$p['active']??1;if(!in_array($active,[0,1,'0','1'],true))fail('Choose an account status.');$active=(int)$active;
  $permissions=valid_permissions($p['permissions']??[]);
  if($old&&$old['role']==='super_admin'){
   if($role!=='super_admin'||!$active||!empty($p['password']))fail('The super admin cannot be demoted, disabled or reset here. Use My profile to change your password.',403);
  }elseif(!array_key_exists($role,role_presets()))fail('Choose a valid role.');
  $fields=profile_fields($p);$avatar=profile_avatar($p,$old['avatar']??'');$password=null;
  if(!$old||!empty($p['password']))$password=password_hash(new_password($p),PASSWORD_DEFAULT);
  $result=transaction(function()use($id,$old,$username,$role,$active,$permissions,$fields,$avatar,$password,$p){
   if(one('SELECT id FROM users WHERE username=? AND id<>?',[$username,$id]))throw new InvalidArgumentException('This username is already in use.');
   if($old){
    $latest=one('SELECT version FROM users WHERE id=?',[$id]);if((int)($p['version']??0)!==(int)$latest['version'])throw new RuntimeException('This user was edited elsewhere. Reopen the user before saving.',409);
    run('UPDATE users SET full_name=?,email=?,phone=?,job_title=?,bio=?,avatar=?,role=?,permissions=?,active=?,password=COALESCE(?,password),auth_version=auth_version+?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?',[...$fields,$avatar,$role,json_encode($permissions),$active,$password,($password!==null||$active!==(int)$old['active'])?1:0,$id]);audit('updated access','user',$id);return $id;
   }
   run('INSERT INTO users(username,password,full_name,email,phone,job_title,bio,avatar,role,permissions,active) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[$username,$password,...$fields,$avatar,$role,json_encode($permissions),$active]);$new=(int)db()->lastInsertId();audit('created','user',$new);return $new;
  });response(['id'=>$result],$old?200:201);
 }
}
function authorize_action(string $action,string $method,array $p,array $user): void {
 if(in_array($action,['daily_expense','daily_expense_entry','save_daily_expense','save_daily_cash_received','clear_operator_receivable'],true)){if(!operator_cash_allowed($user))fail('Daily expense is available only to munshis and super admin.',403);if($action==='clear_operator_receivable'&&$user['role']!=='super_admin')fail('Only super admin can clear a receivable.',403);return;}
 if(in_array($action,['unified_deliveries','unified_delivery','unified_customer_balances'],true)){require_permission($user,'deliveries.view');return;}
 if($action==='save_unified_delivery'){if(can_access($user,'deliveries.create')||can_access($user,'deliveries.edit'))return;fail('You do not have permission to edit deliveries.',403);}
 if($action==='delivery_customer_dues'){if(can_access($user,'deliveries.create')||can_access($user,'deliveries.edit'))return;fail('You do not have permission to view delivery customer balances.',403);}
 if(in_array($action,['delivery_cash_list','delivery_cash_invoice','receive_delivery_cash','delivery_customer_balances','pending_cash_collections','cash_collection_submission','approve_cash_collection','discard_cash_collection'],true)){if($user['role']==='super_admin')return;if($user['role']==='operations'&&can_access($user,'deliveries.create')&&in_array($action,['delivery_cash_list','delivery_cash_invoice','receive_delivery_cash','pending_cash_collections','cash_collection_submission'],true))return;fail('Only the super admin can approve cash collections.',403);}
 if($action==='pending_deliveries'){if($user['role']==='super_admin'||($user['role']==='operations'&&can_access($user,'deliveries.view')))return;fail('Pending delivery goods is unavailable to this account.',403);}
 if(in_array($action,['delivery_submission','discard_delivery_submission'],true)){if($user['role']==='super_admin')return;fail('Only the super admin can review delivery submissions.',403);}
 if($action==='save_delivery'&&!empty($p['pending_id'])&&$user['role']!=='super_admin')fail('Only the super admin can approve delivery goods.',403);

 if($action==='workspace_changes'){if($user['role']!=='super_admin')fail('Only the super admin can monitor workspace changes.',403);return;}
 if($action==='backup_restore'){if($user['role']!=='super_admin')fail('Only the super admin can restore backups.',403);return;}
 if($action==='pending_incoming'){if($user['role']==='super_admin'||($user['role']==='operations'&&can_access($user,'incoming.view')))return;fail('Pending incoming goods is unavailable to this account.',403);}
 if(in_array($action,['save_goods_category','update_goods_category'],true)){if($user['role']==='super_admin')return;fail('Only the super admin can manage goods categories.',403);}
 if(in_array($action,['goods_catalog','goods_analytics'],true)){require_permission($user,'incoming.view');return;}
 if($action==='discard_incoming'){if($user['role']==='super_admin')return;fail('Only the super admin can discard pending incoming goods.',403);}
 if($action==='incoming_submission'){if($user['role']==='super_admin')return;fail('Only the super admin can review submitted entries.',403);}
 if($user['role']==='operations'){
  if(in_array($action,['imported_tables','imported_rows','backup','financial_report','ledger'],true))fail('Financial totals are restricted for Munshi.',403);
  if($action==='save_shipment'&&!empty($p['id'])&&($p['kind']??'')==='incoming')fail('Munshi incoming goods must go through approval.',403);
  if($action==='save_shipment'&&!empty($p['pending_id']))fail('Only the super admin can approve incoming goods.',403);
 }

 $map=['dashboard'=>'overview.view','customers'=>'customers.view','customer'=>'customers.view','save_customer'=>'customers.manage','deliveries'=>'deliveries.view','delivery'=>'deliveries.view','save_delivery'=>'deliveries.create','update_delivery'=>'deliveries.edit','vouchers'=>'vouchers.view','voucher'=>'vouchers.view','save_voucher'=>'vouchers.create','ledger'=>'ledger.view','financial_report'=>'reports.view','account_groups'=>'accounts.create','save_account'=>'accounts.create','save_station'=>'stations.manage','backup'=>'backups.create','backup_list'=>'backups.create','settings'=>'settings.view','imported_tables'=>'archive.view','imported_rows'=>'archive.view'];
 if(isset($map[$action])){require_permission($user,$map[$action]);return;}
 if($action==='lookups')return;
 if($action==='stations'){foreach(['overview.view','incoming.view','booking.view','deliveries.view','settings.view'] as $key){if(can_access($user,$key))return;}require_permission($user,'settings.view');return;}
 if(in_array($action,['shipments','save_shipment'],true)){
  $kind=$method==='POST'?($p['kind']??''):($_GET['kind']??'incoming');if(!in_array($kind,['incoming','booking'],true))fail('Invalid shipment type.');if($action==='save_shipment'&&!empty($p['id'])){$record=one('SELECT kind FROM shipments WHERE id=?',[(int)$p['id']]);if(!$record)fail('Shipment not found.',404);require_permission($user,$record['kind'].'.edit');if($record['kind']!==$kind)fail('Shipment type cannot be changed.');return;}require_permission($user,$kind.'.'.($action==='save_shipment'?'create':'view'));return;
 }
 if($action==='shipment'){$record=one('SELECT kind FROM shipments WHERE id=?',[(int)($_GET['id']??0)]);if(!$record)fail('Shipment not found.',404);require_permission($user,$record['kind'].'.view');return;}
 if($action==='bilties'){
  $kinds=array_values(array_filter(['incoming','booking'],fn($kind)=>can_access($user,$kind.'.view')));if(!$kinds)require_permission($user,'incoming.view');
  if(!empty($_GET['kind'])){if(!in_array($_GET['kind'],['incoming','booking'],true))fail('Invalid shipment type.');require_permission($user,$_GET['kind'].'.view');}
  elseif(count($kinds)===1)$_GET['kind']=$kinds[0];return;
 }
 fail('This action was not found.',404);
}
