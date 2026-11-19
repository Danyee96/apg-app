<?php
declare(strict_types=1);
// Delivered balances use the same rules as Daily Wasooli. Undelivered arrivals
// are shown separately until a delivery exists, so a bilty is counted once.
function customer_ledger_query(array $p): array {
 $search=text($p,'search',120);$pattern='%'.str_replace(['\\','%','_'],['\\\\','\\%','\\_'],$search).'%';
 $where="a.customer=1 AND a.status='A'";$args=[];
 if($search!==''){$where.=" AND (a.name LIKE ? ESCAPE '\\' OR a.id LIKE ? ESCAPE '\\' OR a.area LIKE ? ESCAPE '\\' OR a.mobile LIKE ? ESCAPE '\\')";$args=array_fill(0,4,$pattern);}
 $id=text($p,'id',40);if($id!==''){$where.=' AND a.id=?';$args[]=$id;}
 $service="CASE WHEN d.cash_workflow=0 OR COALESCE(c.legacy_services,0)=1 OR l.legacy_service_received<>0 THEN MAX(0,l.service_due-l.service_received) ELSE MAX(0,l.loading-l.loading_received)+MAX(0,l.suzuki-l.suzuki_received) END";
 $cte="WITH delivered AS (SELECT l.account_id,SUM(MAX(0,l.bilty_due-l.bilty_received)+(".$service.")) balance,SUM(MAX(0,l.bilty_received-l.bilty_due)) credit,COUNT(*) count FROM delivery_unified_lines l JOIN deliveries d ON d.id=l.delivery_id LEFT JOIN delivery_cash_invoices c ON c.delivery_id=d.id WHERE NOT(d.delivery_mode='walkin' AND NOT EXISTS(SELECT 1 FROM delivery_cash_receipts vr WHERE vr.delivery_id=d.id) AND EXISTS(SELECT 1 FROM cash_collection_submissions vs WHERE vs.delivery_id=d.id AND vs.status='pending')) GROUP BY l.account_id), pending AS (SELECT i.account_id,SUM(MAX(0,i.bilty_amount+i.godown-i.advance)) balance,COUNT(*) count FROM items i JOIN shipments s ON s.id=i.shipment_id WHERE s.kind='incoming' AND NOT EXISTS(SELECT 1 FROM delivery_items di WHERE di.item_id=i.id) GROUP BY i.account_id) ";
 $from=" FROM accounts a LEFT JOIN delivered d ON d.account_id=a.id LEFT JOIN pending p ON p.account_id=a.id WHERE ".$where;
 $total=(int)one('SELECT COUNT(*) n FROM accounts a WHERE '.$where,$args)['n'];$page=max(0,min(max(0,(int)ceil($total/30)-1),(int)($p['page']??0)));
 $rows=query($cte."SELECT a.id,a.name,a.area,a.mobile,COALESCE(d.balance,0) customer_balance,COALESCE(d.credit,0) credit,COALESCE(p.balance,0) incoming_balance,COALESCE(d.balance,0)+COALESCE(p.balance,0) upcoming_balance,COALESCE(d.count,0) delivered_count,COALESCE(p.count,0) incoming_count".$from." ORDER BY a.name COLLATE NOCASE,a.id LIMIT 30 OFFSET ".($page*30),$args);
 $result=['rows'=>$rows,'total'=>$total,'page'=>$page,'page_size'=>30];
 if($id!==''){
  if(!$rows)throw new InvalidArgumentException('Customer not found.');
  $result['delivered']=query("SELECT d.reference,d.dated,l.bilty,l.party_to,l.bilty_due+l.service_due due,l.bilty_received+l.service_received received,MAX(0,l.bilty_due-l.bilty_received)+(".$service.") balance FROM delivery_unified_lines l JOIN deliveries d ON d.id=l.delivery_id LEFT JOIN delivery_cash_invoices c ON c.delivery_id=d.id WHERE l.account_id=? AND (MAX(0,l.bilty_due-l.bilty_received)+(".$service."))>0 AND NOT(d.delivery_mode='walkin' AND NOT EXISTS(SELECT 1 FROM delivery_cash_receipts vr WHERE vr.delivery_id=d.id) AND EXISTS(SELECT 1 FROM cash_collection_submissions vs WHERE vs.delivery_id=d.id AND vs.status='pending')) ORDER BY d.dated DESC,l.delivery_item_id DESC",[$id]);
  $result['incoming']=query("SELECT s.reference,s.dated,i.bilty,i.party_to,i.bilty_amount+i.godown due,i.advance received,MAX(0,i.bilty_amount+i.godown-i.advance) balance FROM items i JOIN shipments s ON s.id=i.shipment_id WHERE i.account_id=? AND s.kind='incoming' AND NOT EXISTS(SELECT 1 FROM delivery_items di WHERE di.item_id=i.id) ORDER BY s.dated DESC,i.id DESC",[$id]);
 }
 return $result;
}
