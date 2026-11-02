<?php
declare(strict_types=1);
date_default_timezone_set('Asia/Karachi');
$storage=getenv('APG_STORAGE') ?: __DIR__.'/storage';
function db(): PDO {global $storage;static $db;if(!$db){if(!is_file($storage.'/app.sqlite'))throw new RuntimeException('The workspace database is unavailable. Ask your administrator to finish uploading the database, then try again.',503);$db=new PDO('sqlite:'.$storage.'/app.sqlite');$db->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);$db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE,PDO::FETCH_ASSOC);$db->exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');}return $db;}
function query(string $sql,array $args=[]): array {$s=db()->prepare($sql);$s->execute($args);return $s->fetchAll();}
function one(string $sql,array $args=[]): ?array {return query($sql,$args)[0]??null;}
function run(string $sql,array $args=[]): void {$s=db()->prepare($sql);$s->execute($args);}
function response(mixed $data,int $status=200): never {http_response_code($status);header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');echo json_encode($data,JSON_INVALID_UTF8_SUBSTITUTE|JSON_THROW_ON_ERROR);exit;}
function fail(string $message,int $status=422): never {response(['error'=>$message],$status);}
function text(array $p,string $k,int $max=250,bool $required=false): string {$v=$p[$k]??'';if(!is_string($v)&&!is_numeric($v))fail('Invalid '.$k);$v=trim((string)$v);if($required&&$v==='')fail(ucfirst(str_replace('_',' ',$k)).' is required.');if(mb_strlen($v)>$max)fail(ucfirst($k).' is too long.');return $v;}
function money(array $p,string $k): int {$v=trim((string)($p[$k]??'0'));if($v==='')$v='0';if(!preg_match('/^\d{1,10}(\.\d{1,2})?$/D',$v))fail('Enter a valid non-negative amount for '.str_replace('_',' ',$k).'.');$parts=explode('.',$v);return (int)$parts[0]*100+(int)str_pad($parts[1]??'',2,'0');}
function day(array $p,string $k='dated'): string {$v=text($p,$k,10,true);$d=DateTimeImmutable::createFromFormat('!Y-m-d',$v);if(!$d||$d->format('Y-m-d')!==$v)fail('Choose a valid date.');return $v;}
function audit(string $action,string $entity,mixed $id): void {run('INSERT INTO audit(actor,action,entity,entity_id) VALUES(?,?,?,?)',[$_SESSION['username']??'setup',$action,$entity,(string)$id]);}
function transaction(callable $fn): mixed {db()->exec('BEGIN IMMEDIATE');try{$r=$fn();db()->exec('COMMIT');return $r;}catch(Throwable $e){if(db()->inTransaction())db()->rollBack();else {try{db()->exec('ROLLBACK');}catch(Throwable){}}throw $e;}}
function paged(string $from,string $where,array $params,string $select,string $order): array {$page=max(0,min(100000,(int)($_GET['page']??0)));$total=(int)one('SELECT COUNT(*) AS n FROM '.$from.$where,$params)['n'];$page=min($page,max(0,(int)ceil($total/30)-1));return ['rows'=>query('SELECT '.$select.' FROM '.$from.$where.' ORDER BY '.$order.' LIMIT 30 OFFSET '.($page*30),$params),'total'=>$total,'page'=>$page,'page_size'=>30];}
function rangeWhere(string $column,array &$args): string {if(!empty($_GET['from'])&&!empty($_GET['to'])&&day($_GET,'from')>day($_GET,'to'))fail('Start date must be before end date.');$s='';foreach(['from'=>'>=','to'=>'<='] as $k=>$op){if(!empty($_GET[$k])){$d=day($_GET,$k);$s.=' AND '.$column.$op.'?';$args[]=$d;}}return $s;}
function pattern(): string {return '%'.str_replace(['\\','%','_'],['\\\\','\\%','\\_'],mb_substr((string)($_GET['search']??''),0,120)).'%';}

// Original R071/R156 totals are derived from charges, not nullable imported TOTAL.
function goods_total(array $item,string $kind): int {
 $fields=$kind==='booking'?['rent','loading','bilty_amount','local_charge']:['bilty_amount','godown'];
 return array_sum(array_map(fn($field)=>(int)($item[$field]??0),$fields));
}
function goods_item(array $item,string $kind): array {
 $item['stored_total']=$item['total']??null;
 $item['total']=goods_total($item,$kind);
 return $item;
}
