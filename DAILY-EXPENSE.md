# Daily expense

Daily expense is the first Finance & Workspace destination for operations users and super admins. It tracks cash held by each operator across days until super admin clears the balance.

## Opening and collections

The migration records the highest existing delivery receipt ID when enabled. Earlier collections are excluded. New delivery receipts made by an operations user add one incoming ledger entry inside the same transaction as the receipt. Receipt retries cannot duplicate entries. Admin collections are not assigned to an operator.

The incoming amount includes all cash actually collected on the receipt, including bilty and service cash and collections against previous customer balances. This ledger does not repost delivery cash to accounting.

## Expenses and clearance

A Munshi or super admin can add an expense with its date, title, amount, cash account, expense head and notes. This creates a balanced payment voucher: debit the expense head, credit the cash account. Saved entries cannot be edited or deleted, including through the API. Munshis can only access their own ledger. Super admin selects the Munshi whose ledger receives the expense; the entry records the actual administrator as its author.

The balance is collections minus expenses. A negative balance means the company owes the operator. Only super admin can clear a period. The Receive cash button confirms the full cash handover and closes the period; it does not create a second delivery receipt. Clearance records the signed balance, administrator, timestamp and notes, preserving all entries. The next collection or expense opens a new period. Clearance represents handing over already-recorded cash; it does not post that cash a second time.

Clearance verifies the entire period has not changed since review. Forms opened before clearance cannot silently add expenses to the next period. Expense and clearance requests support safe retries.

## History and dates

Date, type and search filters change the displayed entries, not the full-period receivable. Cleared history remains accessible, with recorded clearance details and read-only entry details. Running balances follow recording order; a backdated expense after clearance belongs to the new period. Timestamps display in Pakistan time through the application's existing formatter.

The tables and enablement watermark are stored in the application database and included in full database backups and restores.

## Verification

Run `python3 tests/daily_expense.py` for accounting, ownership, retry, clearance concurrency and database integrity checks. Run `python3 tests/daily_expense_browser.py` with the project's Playwright module available for the operator and admin screens, filters, history, mobile and Urdu RTL checks.

## Other cash received

Munshi has both You gave (expenses) and You got (manual receipts). Other cash received requires payer/details, amount, date and a cash/bank account, with optional notes. It appears in green and increases the receivable from that Munshi. Delivery collections remain automatic and carry a separate label.

Manual receipts use a balanced receipt voucher, debiting the selected cash account and crediting Other cash receipts clearing. They do not change a customer balance or imply delivery revenue. Super admin can record a receipt for a selected Munshi through the API; the admin bottom button remains Receive cash for settling the Munshi's full period. Manual receipts share immutable records, safe retries, ownership checks and stale-period protection with expenses.
