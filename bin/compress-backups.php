<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit(1);
require __DIR__.'/../bootstrap.php';require __DIR__.'/../backups.php';set_time_limit(0);
try{
 $entries=backup_entries();$converted=0;$before=0;$after=0;
 foreach($entries as $entry){if(($entry['format_version']??1)!==1)continue;$workspace=workspace_lock();try{$result=compress_existing_backup($entry['id']);}finally{flock($workspace,LOCK_UN);fclose($workspace);}
  if($result['converted']){$converted++;$before+=$entry['size'];$after+=$result['backup']['size'];echo json_encode(['id'=>$entry['id'],'before'=>$entry['size'],'after'=>$result['backup']['size'],'verified'=>$result['backup']['verified']],JSON_THROW_ON_ERROR).PHP_EOL;}
 }
 echo json_encode(['converted'=>$converted,'before'=>$before,'after'=>$after,'saved_bytes'=>$before-$after],JSON_THROW_ON_ERROR).PHP_EOL;
}catch(Throwable $error){fwrite(STDERR,$error->getMessage().PHP_EOL);exit(1);}
