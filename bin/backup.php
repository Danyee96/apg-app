<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit(1);
require __DIR__.'/../bootstrap.php';require __DIR__.'/../backups.php';
try{$lock=workspace_lock();echo json_encode(run_scheduled_backup(),JSON_THROW_ON_ERROR).PHP_EOL;}catch(Throwable $e){fwrite(STDERR,$e->getMessage().PHP_EOL);exit(1);}
