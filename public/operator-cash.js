'use strict';
let dailyOperator=0,dailyPeriod=0,dailyTab='ledger',dailyKind='',dailyHistoryPage=0,dailyData=null;
const dailyBalanceLabel=amount=>amount<0?'Company owes munshi':'Receivable from munshi';
async function dailyExpensePage(){
 const d=await api('daily_expense',null,params({operator_id:dailyOperator,period_id:dailyPeriod,kind:dailyKind,history_page:dailyHistoryPage}));dailyData=d;listData=d;state.page=d.page;
 if(d.operator)dailyOperator=Number(d.operator.id);
 const name=d.operator?.full_name||d.operator?.username||'',closed=!!d.period?.closed_at,amount=Number(d.totals.balance),canClear=isSuper()&&!closed&&d.period&&Number(d.totals.count)>0;
 const actions=btn('Refresh','daily-refresh',false,'refresh')+(isSuper()&&d.operator&&!closed?btn('Add expense','daily-expense-new',false,'plus'):'')+(canClear?btn(amount>0?'Receive cash':'Clear balance','daily-clear',true,'check'):'');
 const heading=head('Daily expense','Delivery collections and expenses stay here until the balance is cleared.',actions);
 const selector=isSuper()?`<label class="daily-operator-select"><span>Munshi</span><select id="daily-operator" class="filter" aria-label="Munshi">${d.operators.map(row=>`<option value="${row.id}" ${Number(row.id)===dailyOperator?'selected':''}>${esc(row.full_name||row.username)}${Number(row.active)?'':' · Inactive'} · ${cash(row.balance)}</option>`).join('')}</select></label>`:'';
 if(!d.operator)return heading+`<section class="panel daily-empty">${empty('No munshis yet. Add a munshi in Users & permissions.')}</section>`;
 const periodText=closed?`<div class="daily-cleared-banner">${icon('check')}<div><strong>Cleared period</strong><span>${fmttime(d.period.closed_at)} · ${esc(d.period.cleared_by_name||'Super admin')}</span>${d.period.settlement_note?`<small>${esc(d.period.settlement_note)}</small>`:''}</div><button class="btn" data-action="daily-current">Current ledger</button></div>`:`<p class="note">This balance carries forward until super admin clears it.</p>`;
 const summary=`${selector}<section class="daily-ledger-hero"><div class="daily-ledger-person"><span class="daily-avatar">${esc(name.slice(0,2).toUpperCase())}</span><div><span>Munshi cash ledger</span><h2>${esc(name)}</h2></div><span class="tag">${closed?'Cleared period':'Current period'}</span></div><div class="daily-ledger-balance"><span>${closed?'Balance at clearance':dailyBalanceLabel(amount)}</span><strong class="${amount<0?'daily-negative':''}">${cash(Math.abs(amount))}</strong><small>${d.period?'Period opened: '+fmttime(d.period.opened_at):'A new period starts with the next entry.'}</small></div><div class="daily-ledger-totals"><div><span>Cash received</span><strong class="daily-incoming">${cash(d.totals.received)}</strong></div><div><span>Expenses</span><strong class="daily-outgoing">${cash(d.totals.expenses)}</strong></div><div><span>Entries</span><strong>${num(d.totals.count)}</strong></div>${isSuper()?`<div><span>Total receivable from munshis</span><strong>${cash(d.all_receivable)}</strong></div>`:''}</div></section>${periodText}`;
 const tabs=`<div class="buttons daily-tabs"><button class="btn ${dailyTab==='ledger'?'primary':''}" data-action="daily-tab" data-value="ledger">${closed?'Period details':'Current ledger'}</button><button class="btn ${dailyTab==='history'?'primary':''}" data-action="daily-tab" data-value="history">Cleared history${d.history.total?' · '+num(d.history.total):''}</button></div>`;
 if(dailyTab==='history')return heading+summary+tabs+`<section class="panel daily-history">${d.history.rows.map(period=>`<article><div><strong>Period #${period.id}</strong><p>${fmttime(period.opened_at)} → ${fmttime(period.closed_at)}</p><small>Cleared by: ${esc(period.cleared_by_name||'Super admin')} · ${num(period.entries)} entries</small>${period.settlement_note?`<p>${esc(period.settlement_note)}</p>`:''}</div><div><strong>${cash(Math.abs(Number(period.settlement_amount)))}</strong><small>${Number(period.settlement_amount)<0?'Settled with munshi':'Received by admin'}</small><button class="btn" data-action="daily-period" data-id="${period.id}">View ledger</button></div></article>`).join('')||empty('No cleared periods yet.')}<div class="pagination"><span>${num(d.history.total)} cleared periods</span><div class="buttons"><button class="btn" data-action="daily-history-page" data-page="${Math.max(0,d.history.page-1)}" ${d.history.page===0?'disabled':''}>Previous</button><button class="btn" data-action="daily-history-page" data-page="${d.history.page+1}" ${(d.history.page+1)*15>=d.history.total?'disabled':''}>Next</button></div></div></section>`;
 const controls=searchBar('Search entries…',`<select class="filter" id="daily-kind" aria-label="Entry type">${[['','All entries'],['collection','You got · Cash received'],['expense','You gave · Expenses']].map(([key,label])=>`<option value="${key}" ${key===dailyKind?'selected':''}>${label}</option>`).join('')}</select>`,true);
 const rows=dailyLedgerRows(d.rows);
 const footer=!closed&&(isOperations()||isSuper())?`<div class="daily-ledger-actions">${isOperations()?`<button class="btn daily-gave" data-action="daily-expense-new">${icon('minus')}You gave<span>Add expense</span></button><button class="btn daily-got" data-action="daily-cash-new">${icon('plus')}You got<span>Other cash received</span></button>`:`<button class="btn daily-got" data-action="daily-clear" ${!canClear?'disabled':''}>${icon('download')}Receive cash<span>Receive from Munshi</span></button>`}</div>`:'';
 return heading+summary+tabs+`<section class="panel daily-ledger-panel">${controls}<p class="daily-filter-note">Balance covers the entire period. Date filters only change the entries shown.</p><div class="table-scroll"><table class="daily-ledger-table"><thead><tr><th>Entries</th><th>You gave</th><th>You got</th></tr></thead><tbody>${rows}</tbody></table></div>${!d.rows.length?empty('No entries in this selection. Delivery collections appear automatically.'):''}${pagination(d)}</section>${footer}`;
}
function dailyLedgerRows(rows){return rows.map(row=>`<tr class="daily-entry daily-${row.kind}" data-daily-entry="${row.id}"><td><button type="button" class="link" data-action="daily-entry" data-id="${row.id}">${esc(row.title)}</button><small>${row.kind==='collection'?row.receipt_id?'Delivery collection':'Other cash received':'Expense'}</small><small>${fmtdate(row.dated)} · ${fmttime(row.created_at)}</small><small>By: ${esc(row.actor_name)} · ${esc(row.cash_account||row.cash_account_id)}</small>${row.notes?`<p>${esc(row.notes)}</p>`:''}<span class="daily-running-balance">Balance after entry: ${cash(row.running_balance)}</span><div style="margin-top:10px"><button type="button" class="btn small" data-action="daily-entry" data-id="${row.id}">${icon('eye')}View details</button></div></td><td class="daily-outgoing">${row.kind==='expense'?cash(row.amount):'—'}</td><td class="daily-incoming">${row.kind==='collection'?cash(row.amount):'—'}</td></tr>`).join('');}
let dailyHistoryPopup=null;
async function dailyPeriodPopup(id,page=0){
 const owner=dailyHistoryPopup?.id===id?dailyHistoryPopup.owner:dailyOperator;
 const d=await api('daily_expense',null,{operator_id:owner,period_id:id,page});
 dailyHistoryPopup={id,owner,page:d.page};
 const period=d.period;
 const facts=deliveryFacts([['Cash received',cash(d.totals.received)],['Expenses',cash(d.totals.expenses)],['Balance at clearance',cash(Math.abs(Number(period.settlement_amount)))],['Cleared by',period.cleared_by_name||'Super admin'],['Period opened',fmttime(period.opened_at)],['Cleared at',fmttime(period.closed_at)]]);
 const pages=Math.ceil(d.total/d.page_size);
 const footer=`<button class="btn" data-action="daily-period-page" data-page="${d.page-1}" ${d.page===0?'disabled':''}>Previous</button><span>${num(d.page+1)} / ${num(Math.max(1,pages))}</span><button class="btn" data-action="daily-period-page" data-page="${d.page+1}" ${d.page+1>=pages?'disabled':''}>Next</button>${btn('Close','close-modal')}`;
 modal('Cleared period · #'+id,esc(d.operator.full_name||d.operator.username),`<section class="daily-period-ledger">${facts}${period.settlement_note?`<p class="note-box">${esc(period.settlement_note)}</p>`:''}<div class="table-scroll"><table class="daily-ledger-table"><thead><tr><th>Entries</th><th>You gave</th><th>You got</th></tr></thead><tbody>${dailyLedgerRows(d.rows)}</tbody></table></div></section>`,footer);
 $('#modal').classList.add('delivery-dialog');
}
function dailyExpenseForm(){
 const d=dailyData;if(!(isOperations()||isSuper())||!d?.operator||d?.period?.closed_at)return;
 const recent=d.rows.find(row=>row.kind==='collection'),cashDefault=recent?.cash_account_id||d.cash_accounts.find(row=>row.id.startsWith('1-101-'))?.id||d.cash_accounts[0]?.id||'';
 modal('Add expense',(isSuper()?(d.operator.full_name||d.operator.username)+' · ':'')+'Saved expenses cannot be edited.',`<form id="daily-expense-form"><div class="form-grid">${field('title','Expense details','','text','required maxlength="150"',true)}${field('amount','Amount (Rs)','','number','required min="0.01" step="0.01" data-money="true"')}${field('dated','Expense date',today(),'date','required max="'+today()+'"')}${selectField('cash_account_id','Paid from',d.cash_accounts.map(row=>[row.id,row.name]),cashDefault)}${selectField('expense_account_id','Expense account',d.expense_accounts.map(row=>[row.id,row.name]),'5-501-OPS')}${field('notes','Notes','','text','maxlength="1000"',true)}</div><div id="daily-form-error" class="error" hidden></div><div class="form-actions">${btn('Cancel','close-modal')}<button class="btn primary" type="submit">Save expense</button></div></form>`);
 $('#daily-expense-form').dailyContext={request_key:crypto.randomUUID(),period_token:d.period_token,operator_id:d.operator.id};
}
function dailyCashForm(){
 const d=dailyData;if(!(isOperations()||isSuper())||!d?.operator||d?.period?.closed_at)return;
 const cashDefault=d.cash_accounts.find(row=>row.id.startsWith('1-101-'))?.id||d.cash_accounts[0]?.id||'';
 modal('You got · Other cash received','Delivery collections appear automatically.',`<form id="daily-cash-form"><div class="form-grid">${field('title','Received from / details','','text','required maxlength="150"',true)}${field('amount','Amount (Rs)','','number','required min="0.01" step="0.01" data-money="true"')}${field('dated','Received date',today(),'date','required max="'+today()+'"')}${selectField('cash_account_id','Cash / bank account',d.cash_accounts.map(row=>[row.id,row.name]),cashDefault)}${field('notes','Notes','','text','maxlength="1000"',true)}</div><div id="daily-form-error" class="error" hidden></div><div class="form-actions">${btn('Cancel','close-modal')}<button class="btn primary" type="submit">Save cash received</button></div></form>`);
 $('#daily-cash-form').dailyContext={request_key:crypto.randomUUID(),period_token:d.period_token,operator_id:d.operator.id};
}
function dailyClearForm(){
 const d=dailyData;if(!isSuper()||!d.period||d.period.closed_at||!d.totals.count)return;
 const balance=Number(d.totals.balance),name=d.operator.full_name||d.operator.username;
 modal(balance>0?'Receive cash':'Clear balance',esc(name),`<form id="daily-clear-form"><div class="daily-clear-amount"><span>${balance<0?'Amount settled with munshi':'Amount received from munshi'}</span><strong>${cash(Math.abs(balance))}</strong></div><p class="note">Confirm the cash has been settled and expenses reviewed. This closes the period and keeps every entry in history.</p><div class="form-grid">${field('notes','Clearance notes','','text','maxlength="1000"',true)}</div><div id="daily-form-error" class="error" hidden></div><div class="form-actions">${btn('Cancel','close-modal')}<button class="btn primary" type="submit">Confirm clearance</button></div></form>`);
 $('#daily-clear-form').dailyContext={request_key:crypto.randomUUID(),period_id:d.period.id,version:d.version};
}
async function dailyEntryDetails(id){
 const backToHistory=!!$('#modal .daily-period-ledger');
 const d=await api('daily_expense_entry',null,{id}),e=d.entry;
 const facts=deliveryFacts([['Entry type',e.kind==='expense'?'Expense':e.receipt_id?'Delivery collection':'Other cash received'],['Amount',cash(e.amount)],['Entry date',fmtdate(e.dated)],['Recorded at',fmttime(e.created_at)],['Recorded by',e.actor_name],['Cash / bank account',e.cash_account],...(e.expense_account?[['Expense account',e.expense_account]]:[]),...(e.voucher_reference?[['Voucher',e.voucher_reference]]:[])]);
 const delivery=d.receipt?`<section class="panel" style="padding:16px;margin:16px 0"><h3>${esc(d.receipt.delivery_reference)}</h3>${deliveryFacts([['Receiver',d.receipt.receiver],['Mobile',d.receipt.mobile||'—'],['CNIC',d.receipt.cnic||'—'],['Received date',fmtdate(d.receipt.dated)]])}${d.receipt.delivery_remarks?`<p class="note">${esc(d.receipt.delivery_remarks)}</p>`:''}</section>`:'';
 const items=d.items.length?dailyDeliveryGrid(d.items,d.receipt?.dated):'';

 modal(esc(e.title),'Read-only entry',facts+(e.notes?`<p class="note">${esc(e.notes)}</p>`:'')+delivery+items,backToHistory?btn('Back to ledger','daily-period-back'):'');
 if(d.items.length){$('#modal').classList.add('delivery-dialog');requestAnimationFrame(uAlignRows);}

}
// Match the delivery workspace's paired bilty/service grids without editable controls.
function dailyDeliveryGrid(rows,collectionDate=''){
 const biltyHeaders=['Station / bilty','Customer / Party to','Qty','Bilty amount','Godown charges','Total amount','Advance','Discount','Rec B Amt'];
 const serviceHeaders=['Loading AMT','Suzuki AMT','REC S AMT','Collection date'];
 const value=(row,key)=>Number(row[key]||0),sum=key=>rows.reduce((total,row)=>total+value(row,key),0);
 const cell=(label,content)=>`<td class="number" data-label="${esc(label)}">${content}</td>`;
 const bilty=rows.map(row=>`<tr data-u-bilty-row="${row.delivery_item_id}"><td data-label="Station / bilty"><b>${esc(row.bilty)}</b><small>${esc(row.station||'—')}</small><small>${fmtdate(row.arrival_date)}</small></td><td data-label="Customer / Party to"><b>${esc(row.customer)}</b><small>Party to: ${esc(row.party_to||'—')}</small><small>${esc(row.detail||'—')}</small></td>${cell('Qty',num(row.qty))}${cell('Bilty amount',cash(row.bilty_amount))}${cell('Godown charges',cash(row.godown))}${cell('Total amount',cash(value(row,'bilty_amount')+value(row,'godown')))}${cell('Advance',cash(row.advance))}${cell('Discount',cash(row.discount))}${cell('Rec B Amt',`<strong>${cash(row.bilty_received)}</strong>`)}</tr>`).join('');
 const services=rows.map(row=>`<tr data-u-service-row="${row.delivery_item_id}"><td data-label="Loading AMT"><small class="u-mobile-bilty">${esc(row.bilty)}</small>${cash(row.loading_charge)}</td>${cell('Suzuki AMT',cash(row.suzuki_charge))}${cell('REC S AMT',`<strong>${cash(row.service_received)}</strong>`)}${cell('Collection date',Number(row.service_received)>0&&collectionDate?fmtdate(collectionDate):'')}</tr>`).join('');
 const headings=labels=>`<thead><tr>${labels.map(label=>`<th scope="col">${esc(label)}</th>`).join('')}</tr></thead>`;
 return `<div class="u-ledger-scroll daily-delivery-grid"><div class="u-two-grids"><section class="u-bilty-grid"><h2>Bilty / customer collections <small class="u-currency-note">Amounts in Rs</small></h2><div class="u-pane"><table>${headings(biltyHeaders)}<tbody>${bilty}</tbody><tfoot><tr><th colspan="2">Bilty totals</th>${cell('Qty',num(sum('qty')))}${[sum('bilty_amount'),sum('godown'),sum('bilty_amount')+sum('godown'),sum('advance'),sum('discount'),sum('bilty_received')].map(total=>`<td class="number">${cash(total)}</td>`).join('')}</tr></tfoot></table></div></section><section class="u-services-grid"><h2>Loading / Suzuki collections</h2><div class="u-pane"><table>${headings(serviceHeaders)}<tbody>${services}</tbody><tfoot><tr>${[sum('loading_charge'),sum('suzuki_charge'),sum('service_received')].map(total=>`<td class="number">${cash(total)}</td>`).join('')}<td></td></tr></tfoot></table></div></section></div></div>`;
}
document.addEventListener('click',event=>{
 const target=event.target.closest('[data-action]');if(!target?.dataset.action.startsWith('daily-'))return;event.preventDefault();event.stopImmediatePropagation();
 (async()=>{switch(target.dataset.action){
  case'daily-refresh':await render();break;
  case'daily-tab':dailyTab=target.dataset.value;await render();break;
  case'daily-current':dailyPeriod=0;dailyTab='ledger';state.page=0;await render();break;
  case'daily-period':await dailyPeriodPopup(Number(target.dataset.id));break;
  case'daily-period-page':if(dailyHistoryPopup)await dailyPeriodPopup(dailyHistoryPopup.id,Number(target.dataset.page));break;
  case'daily-period-back':if(dailyHistoryPopup)await dailyPeriodPopup(dailyHistoryPopup.id,dailyHistoryPopup.page);break;
  case'daily-history-page':dailyHistoryPage=Number(target.dataset.page);await render();break;
  case'daily-expense-new':dailyExpenseForm();break;
  case'daily-cash-new':dailyCashForm();break;
  case'daily-clear':dailyClearForm();break;
  case'daily-entry':await dailyEntryDetails(Number(target.dataset.id));break;
 }})().catch(error=>toast(error.message));
});
document.addEventListener('change',event=>{if(event.target.id==='daily-operator'){dailyOperator=Number(event.target.value);dailyPeriod=0;dailyTab='ledger';dailyHistoryPage=0;dailyKind='';state.page=0;state.search=state.from=state.to='';render();}if(event.target.id==='daily-kind'){dailyKind=event.target.value;state.page=0;render();}});
document.addEventListener('submit',event=>{
 if(!['daily-expense-form','daily-cash-form','daily-clear-form'].includes(event.target.id))return;event.preventDefault();event.stopImmediatePropagation();
 const form=event.target;if(form.dataset.busy)return;form.dataset.busy='1';const button=form.querySelector('[type="submit"]');button.disabled=true;const box=$('#daily-form-error',form);box.hidden=true;
 (async()=>{try{const p={...Object.fromEntries(new FormData(form)),...form.dailyContext};const result=await api(form.id==='daily-expense-form'?'save_daily_expense':form.id==='daily-cash-form'?'save_daily_cash_received':'clear_operator_receivable',p);modalSnapshot=null;closeModal();if(form.id==='daily-clear-form'){dailyPeriod=0;dailyTab='ledger';dailyKind='';state.page=0;}toast(result.warning|| (form.id==='daily-expense-form'?'Expense recorded.':form.id==='daily-cash-form'?'Cash received recorded.':'Receivable cleared.'));await render();}catch(error){box.textContent=error.message;box.hidden=false;}finally{delete form.dataset.busy;button.disabled=false;}})();
});
