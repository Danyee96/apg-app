<?php
declare(strict_types=1);
date_default_timezone_set('Asia/Karachi');
$storage=getenv('APG_STORAGE') ?: __DIR__.'/storage';
function db(): PDO {global $storage;static $db;if(!$db){if(!is_file($storage.'/app.sqlite'))throw new RuntimeException('The workspace database is unavailable. Ask your administrator to finish uploading the database, then try again.',503);$db=new PDO('sqlite:'.$storage.'/app.sqlite');$db->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);$db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE,PDO::FETCH_ASSOC);$db->exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');}return $db;}
function query(string $sql,array $args=[]): array {$s=db()->prepare($sql);$s->execute($args);return $s->fetchAll();}
function one(string $sql,array $args=[]): ?array {return query($sql,$args)[0]??null;}
function run(string $sql,array $args=[]): void {$s=db()->prepare($sql);$s->execute($args);}
function response(mixed $data,int $status=200): never {global $current;if(($current['role']??'')==='operations')$data=operations_response($data);http_response_code($status);header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');echo json_encode($data,JSON_INVALID_UTF8_SUBSTITUTE|JSON_THROW_ON_ERROR);exit;}
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

function shipment_snapshot(int $id): array {
 return ['header'=>one('SELECT * FROM shipments WHERE id=?',[$id]),'items'=>query('SELECT * FROM items WHERE shipment_id=? ORDER BY id',[$id])];
}
function shipment_version(array $snapshot): string {return hash('sha256',json_encode($snapshot,JSON_THROW_ON_ERROR));}

function migrate_incoming_approvals(): void {
 if(one("SELECT value FROM meta WHERE key='incoming_approvals_version'"))return;
 transaction(function(){run("CREATE TABLE IF NOT EXISTS incoming_submissions(id INTEGER PRIMARY KEY AUTOINCREMENT,submitted_by INTEGER NOT NULL,submitted_name TEXT NOT NULL,submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,status TEXT NOT NULL DEFAULT 'pending',payload TEXT NOT NULL,approved_by INTEGER,approved_at TEXT,shipment_id INTEGER UNIQUE)");run("INSERT OR IGNORE INTO meta(key,value) VALUES('incoming_approvals_version','1')");});
}
function operations_response(mixed $data,?string $kind=null): mixed {
 if(!is_array($data))return $data;
 $kind=$data['kind']??$kind??'incoming';
 if(isset($data['bilty'])||(($data['kind']??'')==='incoming'&&isset($data['reference']))){
  if($kind==='incoming'){foreach(['godown','total','stored_total'] as $key)if(array_key_exists($key,$data))$data[$key]=null;$data['charges_restricted']=true;}
 }
 foreach($data as $key=>$value)if(is_array($value))$data[$key]=operations_response($value,$kind);
 return $data;
}

function migrate_incoming_bonuses(): void {
 if(one("SELECT value FROM meta WHERE key='incoming_bonuses_version'"))return;
 transaction(function(){
  $columns=array_column(query('PRAGMA table_info(shipments)'),'name');
  foreach(['labour_bonus','munshi_bonus'] as $column)if(!in_array($column,$columns,true))run('ALTER TABLE shipments ADD COLUMN '.$column.' INTEGER NOT NULL DEFAULT 0');
  run("INSERT OR IGNORE INTO meta(key,value) VALUES('incoming_bonuses_version','1')");
 });
}
