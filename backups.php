<?php
declare(strict_types=1);
function backup_directory(): string {global $storage;$path=$storage.'/backups';if(!is_dir($path)&&!mkdir($path,0700,true)&&!is_dir($path))throw new RuntimeException('Cannot create private backup storage.');return $path;}
function workspace_lock(bool $exclusive=false): mixed {global $storage;if(!is_dir($storage))return null;$handle=fopen($storage.'/workspace.lock','c');if(!$handle)throw new RuntimeException('Cannot lock workspace.',503);$until=microtime(true)+15;do{if(flock($handle,($exclusive?LOCK_EX:LOCK_SH)|LOCK_NB))return $handle;usleep(100000);}while(microtime(true)<$until);fclose($handle);throw new RuntimeException('The workspace is busy with a backup or restore. Try again shortly.',503);}
function backup_config(): array {global $storage;$file=$storage.'/backup-schedule.json';return is_file($file)?json_decode(file_get_contents($file),true,32,JSON_THROW_ON_ERROR):[];}
function backup_config_save(array $config): void {global $storage;$temp=$storage.'/backup-schedule-'.bin2hex(random_bytes(4)).'.tmp';file_put_contents($temp,json_encode($config,JSON_THROW_ON_ERROR),LOCK_EX);chmod($temp,0600);if(!rename($temp,$storage.'/backup-schedule.json'))throw new RuntimeException('Cannot save backup schedule.');}
function backup_valid_id(string $id): bool {return (bool)preg_match('/^(manual|automatic)-[0-9TZ-]+-[a-f0-9]{12}$/D',$id);}
function backup_filename(array $row): string {return $row['id'].(($row['format_version']??1)===2?'.sqlite.gz':'.sqlite');}
function backup_path(array $row): string {if(!backup_valid_id((string)($row['id']??'')))throw new InvalidArgumentException('Choose a valid backup.');return backup_directory().'/'.backup_filename($row);}
function backup_entries(): array {
 $rows=[];foreach(glob(backup_directory().'/*.json')?:[] as $file){$row=json_decode(file_get_contents($file),true);if(!is_array($row)||!backup_valid_id((string)($row['id']??''))||basename($file)!==$row['id'].'.json')continue;
  if(!in_array($row['format_version']??1,[1,2],true))continue;
  if(!preg_match('/^[a-f0-9]{64}$/D',(string)($row['sha256']??''))||!is_int($row['size']??null)||$row['size']<1)continue;
  if(($row['format_version']??1)===2&&(($row['compression']??'')!=='gzip'||!preg_match('/^[a-f0-9]{64}$/D',(string)($row['database_sha256']??''))||!is_int($row['database_size']??null)||$row['database_size']<1))continue;
  if(is_file(backup_path($row)))$rows[]=$row;
 }usort($rows,fn($a,$b)=>strcmp($b['created_at'],$a['created_at']));return $rows;
}
function backup_write_all($stream,string $bytes): void {for($offset=0,$size=strlen($bytes);$offset<$size;){$written=fwrite($stream,substr($bytes,$offset));if($written===false||$written===0)throw new RuntimeException('Cannot write backup data.');$offset+=$written;}}
function backup_compress_file(string $source,string $target): void {
 $input=fopen($source,'rb');$output=null;try{if(!$input)throw new RuntimeException('Cannot read backup data.');$output=fopen($target,'xb');if(!$output)throw new RuntimeException('Cannot create compressed backup.');chmod($target,0600);$context=deflate_init(ZLIB_ENCODING_GZIP,['level'=>6]);if($context===false)throw new RuntimeException('Backup compression is unavailable.');
  while(!feof($input)){$chunk=fread($input,1048576);if($chunk===false)throw new RuntimeException('Cannot read backup data.');$encoded=deflate_add($context,$chunk,ZLIB_NO_FLUSH);if($encoded===false)throw new RuntimeException('Backup compression failed.');backup_write_all($output,$encoded);}
  $encoded=deflate_add($context,'',ZLIB_FINISH);if($encoded===false)throw new RuntimeException('Backup compression failed.');backup_write_all($output,$encoded);if(!fflush($output))throw new RuntimeException('Cannot finish compressed backup.');
 }finally{if(is_resource($input))fclose($input);if(is_resource($output))fclose($output);}
}
function backup_expand_file(string $source,string $target,array $row): void {
 $input=fopen($source,'rb');$output=null;try{if(!$input)throw new InvalidArgumentException('Cannot read compressed backup.');$output=fopen($target,'xb');if(!$output)throw new RuntimeException('Cannot prepare restore.');chmod($target,0600);$context=inflate_init(ZLIB_ENCODING_GZIP);if($context===false)throw new RuntimeException('Backup decompression is unavailable.');$hash=hash_init('sha256');$size=0;$ended=false;
  while(!feof($input)){$chunk=fread($input,4096);if($chunk===false)throw new InvalidArgumentException('Cannot read compressed backup.');if($chunk==='')continue;if($ended)throw new InvalidArgumentException('Compressed backup has unexpected trailing data.');$decoded=@inflate_add($context,$chunk,ZLIB_NO_FLUSH);if($decoded===false)throw new InvalidArgumentException('Compressed backup is damaged. Restore was stopped.');$size+=strlen($decoded);if($size>$row['database_size'])throw new InvalidArgumentException('Decompressed backup size does not match. Restore was stopped.');hash_update($hash,$decoded);backup_write_all($output,$decoded);$ended=inflate_get_status($context)===ZLIB_STREAM_END;if($ended&&inflate_get_read_len($context)!==ftell($input))throw new InvalidArgumentException('Compressed backup has unexpected trailing data.');}
  if(!$ended||$size!==$row['database_size']||!hash_equals($row['database_sha256'],hash_final($hash)))throw new InvalidArgumentException('Decompressed backup checksum mismatch. Restore was stopped.');if(!fflush($output))throw new RuntimeException('Cannot prepare restore.');
 }finally{if(is_resource($input))fclose($input);if(is_resource($output))fclose($output);}
}
function backup_publish_manifest(array $row): void {
 $path=backup_directory().'/'.$row['id'].'.json';$temp=$path.'.'.bin2hex(random_bytes(5)).'.tmp';try{if(file_put_contents($temp,json_encode($row,JSON_THROW_ON_ERROR),LOCK_EX)===false)throw new RuntimeException('Cannot publish backup manifest.');chmod($temp,0600);if(!rename($temp,$path))throw new RuntimeException('Cannot publish backup manifest.');}finally{if(is_file($temp))unlink($temp);}
}
function backup_pack_verified(string $source,string $target,array $row): array {
 $verification=backup_directory().'/verify-'.bin2hex(random_bytes(8)).'.sqlite';
 try{$row['database_size']=filesize($source);$row['database_sha256']=hash_file('sha256',$source);backup_compress_file($source,$target);$row['format_version']=2;$row['compression']='gzip';$row['size']=filesize($target);$row['sha256']=hash_file('sha256',$target);
  backup_expand_file($target,$verification,$row);validate_backup_database($verification);$row['verified']=true;return $row;
 }finally{if(is_file($verification))unlink($verification);}
}
function backup_materialize(array $row,string $target): void {
 $source=backup_path($row);clearstatcache(true,$source);if(filesize($source)!==$row['size']||!hash_equals($row['sha256'],hash_file('sha256',$source)))throw new InvalidArgumentException('Backup checksum mismatch. Restore was stopped.');
 global $storage;$expanded=($row['format_version']??1)===2?$row['database_size']:$row['size'];if(disk_free_space($storage)<$expanded+16777216)throw new RuntimeException('Not enough free space to verify and restore this backup.',503);
 if(($row['format_version']??1)===2)backup_expand_file($source,$target,$row);
 else{if(!copy($source,$target))throw new RuntimeException('Cannot prepare restore.');chmod($target,0600);if(!hash_equals($row['sha256'],hash_file('sha256',$target)))throw new InvalidArgumentException('Backup checksum mismatch. Restore was stopped.');}
 validate_backup_database($target);
}
function compress_existing_backup(string $id): array {
 $lock=fopen(backup_directory().'/.backup.lock','c');if(!$lock||!flock($lock,LOCK_EX|LOCK_NB))throw new RuntimeException('Another backup is running. Try again shortly.',409);
 $partial=null;try{$row=null;foreach(backup_entries() as $entry)if($entry['id']===$id)$row=$entry;if(!$row)throw new InvalidArgumentException('Backup not found.');if(($row['format_version']??1)===2)return ['converted'=>false,'backup'=>$row];
  $source=backup_path($row);if(filesize($source)!==$row['size']||!hash_equals($row['sha256'],hash_file('sha256',$source)))throw new InvalidArgumentException('Backup checksum mismatch. Compression was stopped.');
  if(disk_free_space(backup_directory())<$row['size']*2+16777216)throw new RuntimeException('Not enough free space for a verified backup.',503);
  validate_backup_database($source);$partial=backup_directory().'/'.$id.'.'.bin2hex(random_bytes(5)).'.gzip.partial';$converted=backup_pack_verified($source,$partial,$row);$final=backup_path($converted);if(!rename($partial,$final))throw new RuntimeException('Cannot publish backup.');$partial=null;
  // Switch the manifest only after a full, byte-identical round trip and database validation.
  // A crash before this switch keeps the original backup selectable and restorable.
  backup_publish_manifest($converted);if(!unlink($source))error_log('APG: compressed backup verified, original file cleanup pending for '.$id);return ['converted'=>true,'backup'=>$converted];
 }finally{if($partial&&is_file($partial))unlink($partial);flock($lock,LOCK_UN);fclose($lock);}
}
function validate_backup_database(string $file): void {$check=new PDO('sqlite:'.$file);$check->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);$check->exec('PRAGMA query_only=ON');if($check->query('PRAGMA integrity_check')->fetchColumn()!=='ok'||$check->query('PRAGMA foreign_key_check')->fetch())throw new RuntimeException('Backup validation failed.');foreach(['users','accounts','shipments','items','deliveries','vouchers','meta'] as $table){$stmt=$check->prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?");$stmt->execute([$table]);if(!$stmt->fetchColumn())throw new RuntimeException('This is not a compatible workspace backup.');}$check=null;}
function create_workspace_backup(string $kind='manual',string $reason='',?DateTimeImmutable $now=null): array {
 if(!in_array($kind,['manual','automatic'],true))throw new InvalidArgumentException('Invalid backup type.');
 $folder=backup_directory();$lock=fopen($folder.'/.backup.lock','c');if(!$lock||!flock($lock,LOCK_EX|LOCK_NB))throw new RuntimeException('Another backup is running. Try again shortly.',409);
 $raw=null;$partial=null;
 try{
  $now=($now??new DateTimeImmutable())->setTimezone(new DateTimeZone('Asia/Karachi'));$slot=$now->format('Y-m-d');
  if($kind==='automatic')foreach(backup_entries() as $entry)if($entry['kind']==='automatic'&&($entry['slot']??'')===$slot)return ['created'=>false,'backup'=>$entry];
  global $storage;if(disk_free_space($folder)<filesize($storage.'/app.sqlite')*3+16777216)throw new RuntimeException('Not enough free space for a verified backup.',503);
  $id=$kind.'-'.$now->setTimezone(new DateTimeZone('UTC'))->format('Ymd\THis\Z').'-'.bin2hex(random_bytes(6));$raw=$folder.'/'.$id.'.raw.partial';$partial=$folder.'/'.$id.'.gzip.partial';
  db()->exec("VACUUM INTO '".str_replace("'","''",$raw)."'");chmod($raw,0600);validate_backup_database($raw);
  $row=['id'=>$id,'kind'=>$kind,'created_at'=>$now->setTimezone(new DateTimeZone('UTC'))->format('c'),'created_local'=>$now->format('d M Y h:i A'),'slot'=>$kind==='automatic'?$slot:null,'reason'=>$reason,'actor'=>$_SESSION['username']??'scheduled-backup'];
  $row=backup_pack_verified($raw,$partial,$row);if(!rename($partial,backup_path($row)))throw new RuntimeException('Cannot publish backup.');$partial=null;backup_publish_manifest($row);
  $automatic=array_values(array_filter(backup_entries(),fn($r)=>$r['kind']==='automatic'));foreach(array_slice($automatic,30) as $old){unlink(backup_path($old));unlink($folder.'/'.$old['id'].'.json');}
  audit('created '.$kind,'backup',$id);return ['created'=>true,'backup'=>$row];
 }finally{foreach([$raw,$partial] as $file)if($file&&is_file($file))unlink($file);flock($lock,LOCK_UN);fclose($lock);}
}
function backup_dashboard(): array {$config=backup_config();return ['rows'=>backup_entries(),'schedule'=>['enabled'=>(bool)($config['enabled']??false),'driver'=>$config['driver']??'Not configured','time'=>'12:00 AM','timezone'=>'Asia/Karachi','next_run'=>(new DateTimeImmutable('tomorrow',new DateTimeZone('Asia/Karachi')))->format('c'),'last_success'=>$config['last_success']??null,'last_error'=>$config['last_error']??null,'retention'=>30]];}
function run_scheduled_backup(): array {set_time_limit(0);$config=backup_config();try{$result=create_workspace_backup('automatic');$config['last_success']=gmdate('c');unset($config['last_error']);backup_config_save($config);return $result;}catch(Throwable $e){$config['last_error']='Automatic backup failed at '.gmdate('c').'. Check server logs or run a manual backup.';backup_config_save($config);error_log('APG scheduled backup: '.$e->getMessage());throw $e;}}
function restore_workspace_backup(string $id,array $admin): array {
 if(!preg_match('/^(manual|automatic)-[0-9TZ-]+-[a-f0-9]{12}$/D',$id))throw new InvalidArgumentException('Choose a valid backup.');
 $row=null;foreach(backup_entries() as $entry)if($entry['id']===$id)$row=$entry;if(!$row)throw new RuntimeException('Backup not found.',404);
 set_time_limit(0);global $storage;$temp=$storage.'/restore-'.bin2hex(random_bytes(8)).'.sqlite';
 try{
  backup_materialize($row,$temp);
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
