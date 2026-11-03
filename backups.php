<?php
declare(strict_types=1);
function backup_directory(): string {global $storage;$path=$storage.'/backups';if(!is_dir($path)&&!mkdir($path,0700,true)&&!is_dir($path))throw new RuntimeException('Cannot create private backup storage.');return $path;}
function workspace_lock(bool $exclusive=false): mixed {global $storage;if(!is_dir($storage))return null;$handle=fopen($storage.'/workspace.lock','c');if(!$handle)throw new RuntimeException('Cannot lock workspace.',503);$until=microtime(true)+15;do{if(flock($handle,($exclusive?LOCK_EX:LOCK_SH)|LOCK_NB))return $handle;usleep(100000);}while(microtime(true)<$until);fclose($handle);throw new RuntimeException('The workspace is busy with a backup or restore. Try again shortly.',503);}
function backup_config(): array {global $storage;$file=$storage.'/backup-schedule.json';return is_file($file)?json_decode(file_get_contents($file),true,32,JSON_THROW_ON_ERROR):[];}
function backup_config_save(array $config): void {global $storage;$temp=$storage.'/backup-schedule-'.bin2hex(random_bytes(4)).'.tmp';file_put_contents($temp,json_encode($config,JSON_THROW_ON_ERROR),LOCK_EX);chmod($temp,0600);if(!rename($temp,$storage.'/backup-schedule.json'))throw new RuntimeException('Cannot save backup schedule.');}
function backup_entries(): array {$rows=[];foreach(glob(backup_directory().'/*.json')?:[] as $file){$row=json_decode(file_get_contents($file),true);if(is_array($row)&&isset($row['id'])&&preg_match('/^(manual|automatic)-[0-9TZ-]+-[a-f0-9]{12}$/D',$row['id'])&&is_file(backup_directory().'/'.$row['id'].'.sqlite'))$rows[]=$row;}usort($rows,fn($a,$b)=>strcmp($b['created_at'],$a['created_at']));return $rows;}
function validate_backup_database(string $file): void {$check=new PDO('sqlite:'.$file);$check->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);$check->exec('PRAGMA query_only=ON');if($check->query('PRAGMA integrity_check')->fetchColumn()!=='ok'||$check->query('PRAGMA foreign_key_check')->fetch())throw new RuntimeException('Backup validation failed.');foreach(['users','accounts','shipments','items','deliveries','vouchers','meta'] as $table){$stmt=$check->prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?");$stmt->execute([$table]);if(!$stmt->fetchColumn())throw new RuntimeException('This is not a compatible workspace backup.');}$check=null;}
function create_workspace_backup(string $kind='manual',string $reason='',?DateTimeImmutable $now=null): array {
 if(!in_array($kind,['manual','automatic'],true))throw new InvalidArgumentException('Invalid backup type.');
 $folder=backup_directory();$lock=fopen($folder.'/.backup.lock','c');if(!$lock||!flock($lock,LOCK_EX|LOCK_NB))throw new RuntimeException('Another backup is running. Try again shortly.',409);
 $partial=null;$final=null;
 try{
  $now=($now??new DateTimeImmutable())->setTimezone(new DateTimeZone('Asia/Karachi'));$slot=$now->format('Y-m-d');
  if($kind==='automatic')foreach(backup_entries() as $entry)if($entry['kind']==='automatic'&&($entry['slot']??'')===$slot)return ['created'=>false,'backup'=>$entry];
  global $storage;if(disk_free_space($folder)<filesize($storage.'/app.sqlite')*2+10485760)throw new RuntimeException('Not enough free space for a verified backup.',503);
  $id=$kind.'-'.$now->setTimezone(new DateTimeZone('UTC'))->format('Ymd\THis\Z').'-'.bin2hex(random_bytes(6));$partial=$folder.'/'.$id.'.partial';$final=$folder.'/'.$id.'.sqlite';
  db()->exec("VACUUM INTO '".str_replace("'","''",$partial)."'");chmod($partial,0600);validate_backup_database($partial);
  $row=['id'=>$id,'kind'=>$kind,'created_at'=>$now->setTimezone(new DateTimeZone('UTC'))->format('c'),'created_local'=>$now->format('d M Y h:i A'),'slot'=>$kind==='automatic'?$slot:null,'size'=>filesize($partial),'sha256'=>hash_file('sha256',$partial),'reason'=>$reason,'actor'=>$_SESSION['username']??'scheduled-backup','verified'=>true,'format_version'=>1];
  if(!rename($partial,$final))throw new RuntimeException('Cannot publish backup.');$partial=null;
  $manifest=$folder.'/'.$id.'.json.tmp';file_put_contents($manifest,json_encode($row,JSON_THROW_ON_ERROR),LOCK_EX);chmod($manifest,0600);if(!rename($manifest,$folder.'/'.$id.'.json'))throw new RuntimeException('Cannot publish backup manifest.');
  // Retain the newest 30 automatic snapshots; manual and pre-restore snapshots remain.
  $automatic=array_values(array_filter(backup_entries(),fn($r)=>$r['kind']==='automatic'));foreach(array_slice($automatic,30) as $old){unlink($folder.'/'.$old['id'].'.sqlite');unlink($folder.'/'.$old['id'].'.json');}
  audit('created '.$kind,'backup',$id);return ['created'=>true,'backup'=>$row];
 }finally{if($partial&&is_file($partial))unlink($partial);flock($lock,LOCK_UN);fclose($lock);}
}
function backup_dashboard(): array {$config=backup_config();return ['rows'=>backup_entries(),'schedule'=>['enabled'=>(bool)($config['enabled']??false),'driver'=>$config['driver']??'Not configured','time'=>'12:00 AM','timezone'=>'Asia/Karachi','next_run'=>(new DateTimeImmutable('tomorrow',new DateTimeZone('Asia/Karachi')))->format('c'),'last_success'=>$config['last_success']??null,'last_error'=>$config['last_error']??null,'retention'=>30]];}
function run_scheduled_backup(): array {set_time_limit(0);$config=backup_config();try{$result=create_workspace_backup('automatic');$config['last_success']=gmdate('c');unset($config['last_error']);backup_config_save($config);return $result;}catch(Throwable $e){$config['last_error']='Automatic backup failed at '.gmdate('c').'. Check server logs or run a manual backup.';backup_config_save($config);error_log('APG scheduled backup: '.$e->getMessage());throw $e;}}
function restore_workspace_backup(string $id,array $admin): array {
 if(!preg_match('/^(manual|automatic)-[0-9TZ-]+-[a-f0-9]{12}$/D',$id))throw new InvalidArgumentException('Choose a valid backup.');
 $row=null;foreach(backup_entries() as $entry)if($entry['id']===$id)$row=$entry;if(!$row)throw new RuntimeException('Backup not found.',404);
 $source=backup_directory().'/'.$id.'.sqlite';if(!hash_equals($row['sha256'],hash_file('sha256',$source)))throw new InvalidArgumentException('Backup checksum mismatch. Restore was stopped.');
 set_time_limit(0);validate_backup_database($source);global $storage;$temp=$storage.'/restore-'.bin2hex(random_bytes(8)).'.sqlite';
 try{
  if(!copy($source,$temp))throw new RuntimeException('Cannot prepare restore.');chmod($temp,0600);
  $candidate=new PDO('sqlite:'.$temp);$candidate->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);
  $stmt=$candidate->prepare("SELECT id FROM users WHERE username=? AND role='super_admin'");$stmt->execute([$admin['username']]);if(!$stmt->fetchColumn())throw new RuntimeException('This backup does not contain the protected super admin.');$stmt=null;
  $candidate->exec('UPDATE users SET auth_version='.random_int(100000000,2000000000));
  $stmt=$candidate->prepare("UPDATE users SET password=?,active=1 WHERE username=?");$stmt->execute([$admin['password'],$admin['username']]);$stmt=null;
  $stmt=$candidate->prepare("INSERT INTO audit(actor,action,entity,entity_id) VALUES(?,'restored','backup',?)");$stmt->execute([$admin['username'],$id]);$stmt=null;$candidate=null;
  validate_backup_database($temp);
  $safety=create_workspace_backup('manual','Before restoring '.$id);
  // The exclusive workspace lock ensures no application connection is using the old file.
  db()->exec('PRAGMA wal_checkpoint(TRUNCATE)');close_db();
  foreach(['-wal','-shm','-journal'] as $suffix)if(is_file($storage.'/app.sqlite'.$suffix))throw new RuntimeException('Database journal is still active; restore was stopped.');
  if(!rename($temp,$storage.'/app.sqlite'))throw new RuntimeException('Cannot replace the database. Current data was retained.');
  return ['ok'=>true,'safety_backup'=>$safety['backup']['id'],'message'=>'Backup restored. Sign in again.'];
 }finally{if(is_file($temp))unlink($temp);}
}
