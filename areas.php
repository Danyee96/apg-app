<?php
declare(strict_types=1);

function migrate_areas(): void {
 if(one("SELECT value FROM meta WHERE key='areas_catalog_version'"))return;
 transaction(function(){
  if(one("SELECT value FROM meta WHERE key='areas_catalog_version'"))return;
  run('CREATE TABLE IF NOT EXISTS workspace_areas(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL COLLATE NOCASE UNIQUE)');
  run("INSERT OR IGNORE INTO workspace_areas(name) SELECT TRIM(AREANAME) FROM legacy_AREAS WHERE TRIM(COALESCE(AREANAME,''))<>''");
  run("INSERT OR IGNORE INTO workspace_areas(name) SELECT TRIM(area) FROM accounts WHERE customer=1 AND TRIM(COALESCE(area,''))<>''");
  run("INSERT INTO meta(key,value) VALUES('areas_catalog_version','1')");
 });
}
function workspace_areas(): array {
 return query("SELECT MIN(area) area FROM (SELECT name area FROM workspace_areas UNION ALL SELECT TRIM(area) area FROM accounts WHERE customer=1 AND TRIM(COALESCE(area,''))<>'') GROUP BY area COLLATE NOCASE ORDER BY area COLLATE NOCASE");
}
function save_workspace_area(array $p): void {
 $name=text($p,'name',100,true);$original=text($p,'original',100);
 transaction(function()use($name,$original){
  if($original!==''&&!one("SELECT 1 FROM workspace_areas WHERE name=? COLLATE NOCASE UNION ALL SELECT 1 FROM accounts WHERE customer=1 AND TRIM(area)=? COLLATE NOCASE LIMIT 1",[$original,$original]))throw new RuntimeException('This area changed elsewhere. Refresh and try again.',409);
  if(mb_strtolower($name)!==mb_strtolower($original)&&one("SELECT 1 FROM workspace_areas WHERE name=? COLLATE NOCASE UNION ALL SELECT 1 FROM accounts WHERE customer=1 AND TRIM(area)=? COLLATE NOCASE LIMIT 1",[$name,$name]))throw new RuntimeException('This area already exists.',409);
  if($original!==''){
   run('DELETE FROM workspace_areas WHERE name=? COLLATE NOCASE',[$original]);
   run('UPDATE accounts SET area=?,version=version+1 WHERE customer=1 AND TRIM(area)=? COLLATE NOCASE',[$name,$original]);
  }
  run('INSERT INTO workspace_areas(name) VALUES(?)',[$name]);audit($original!==''?'renamed '.$original.' to '.$name:'created','area',$name);
 });
}
