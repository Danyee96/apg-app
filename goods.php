<?php
declare(strict_types=1);
function migrate_goods_catalog(): void {
 if((one("SELECT value FROM meta WHERE key='goods_catalog_version'")['value']??'')==='2')return;
 transaction(function(){
  run('CREATE TABLE IF NOT EXISTS goods_categories(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL COLLATE NOCASE UNIQUE)');
  run('CREATE TABLE IF NOT EXISTS goods_subcategories(id INTEGER PRIMARY KEY AUTOINCREMENT,category_id INTEGER NOT NULL REFERENCES goods_categories(id),name TEXT NOT NULL COLLATE NOCASE,UNIQUE(category_id,name))');
  $columns=array_column(query('PRAGMA table_info(items)'),'name');
  foreach(['goods_category_id'=>'INTEGER REFERENCES goods_categories(id)','goods_subcategory_id'=>'INTEGER REFERENCES goods_subcategories(id)',"goods_custom"=>"TEXT NOT NULL DEFAULT ''"] as $name=>$type)if(!in_array($name,$columns,true))run('ALTER TABLE items ADD COLUMN '.$name.' '.$type);
  $seeds=['Cotton'=>['Cotton Shoes','Cotton Oil','Cotton Cosmetics','Cotton Chamak','Cotton Med','Cotton Toys','Cotton Soap','Cotton valvo','Cotton bulb'],'Bundle'=>['Bundle Rubber','Bundle Chamra','Bundle Juice','Bundle Pipe','Bndl bardana'],'Roll'=>['Roll Ragsein'],'Bag'=>['Bag Niswar','Bag Tea','Bag Green Tea','Bag Mehndi','Bag Books','Bag laise','Bag shoes'],'Drumi'=>['Drumi roghan'],'Packet'=>['Packet Pampur']];
  foreach($seeds as $category=>$names){run('INSERT OR IGNORE INTO goods_categories(name) VALUES(?)',[$category]);$id=one('SELECT id FROM goods_categories WHERE name=?',[$category])['id'];foreach($names as $name)run('INSERT OR IGNORE INTO goods_subcategories(category_id,name) VALUES(?,?)',[$id,$name]);}
  // Classify only unambiguous exact legacy descriptions; original text and money stay intact.
  run("UPDATE items SET goods_subcategory_id=(SELECT MIN(g.id) FROM goods_subcategories g WHERE lower(trim(g.name))=lower(trim(items.detail))),goods_category_id=(SELECT g.category_id FROM goods_subcategories g WHERE lower(trim(g.name))=lower(trim(items.detail)) LIMIT 1) WHERE shipment_id IN (SELECT id FROM shipments WHERE kind='incoming') AND goods_category_id IS NULL AND goods_subcategory_id IS NULL AND goods_custom='' AND (SELECT COUNT(*) FROM goods_subcategories g WHERE lower(trim(g.name))=lower(trim(items.detail)))=1");
  run("INSERT OR REPLACE INTO meta(key,value) VALUES('goods_catalog_version','2')");
 });
}
function goods_catalog(): array {return ['categories'=>query('SELECT * FROM goods_categories ORDER BY id'),'subcategories'=>query('SELECT * FROM goods_subcategories ORDER BY name COLLATE NOCASE')];}
function goods_classification(array $line): array {
 $category=$line['goods_category_id']??null;$other=$category==='other';
 $category=($category===null||$category===''||$category==='0'||$category===0||$other)?null:filter_var($category,FILTER_VALIDATE_INT);
 if($category===false||($category!==null&&!one('SELECT id FROM goods_categories WHERE id=?',[$category])))throw new InvalidArgumentException('Choose a valid goods category.');
 $sub=$line['goods_subcategory_id']??null;$sub=($sub===null||$sub===''||$sub==='0'||$sub===0)?null:filter_var($sub,FILTER_VALIDATE_INT);
 $typed=text($line,'goods_type',100)?:text($line,'goods_custom',100);
 if($sub!==null){$match=$sub?one('SELECT * FROM goods_subcategories WHERE id=?',[$sub]):null;if(!$match||$other||($category!==null&&(int)$match['category_id']!==(int)$category))throw new InvalidArgumentException('Choose a subcategory from the selected goods category.');$category=(int)$match['category_id'];}
 elseif($typed!==''&&!$other){$matches=$category!==null?query('SELECT * FROM goods_subcategories WHERE category_id=? AND name=?',[$category,$typed]):query('SELECT * FROM goods_subcategories WHERE name=?',[$typed]);$match=count($matches)===1?$matches[0]:null;if($match){$sub=(int)$match['id'];$category=(int)$match['category_id'];}}
 if($typed===''&&$sub===null&&$category===null&&!$other){$matches=query('SELECT * FROM goods_subcategories WHERE name=?',[trim(text($line,'detail',250))]);if(count($matches)===1){$sub=(int)$matches[0]['id'];$category=(int)$matches[0]['category_id'];}}
 return ['goods_category_id'=>$category,'goods_subcategory_id'=>$sub,'goods_custom'=>$sub!==null?'':$typed];
}
function goods_item_labels(array $item): array {
 static $catalog=null;if($catalog===null){$data=goods_catalog();$catalog=['categories'=>array_column($data['categories'],null,'id'),'subcategories'=>array_column($data['subcategories'],null,'id')];}
 $item['goods_category_name']=$catalog['categories'][$item['goods_category_id']??0]['name']??'';
 $item['goods_subcategory_name']=$catalog['subcategories'][$item['goods_subcategory_id']??0]['name']??'';
 $item['goods_type']=$item['goods_subcategory_name']?:($item['goods_custom']??'');
 return $item;
}
