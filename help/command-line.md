---
title: Books from the command line
summary: List and change accounts, customers, vendors, products and sales tax, record transactions, run reports, review bank transactions, reconcile an account, and see and adjust inventory, from a terminal or a script with the tinycld tool.
tags: [cli, command line, terminal, automation, scripts, agents, json, banking, reconcile, inventory]
order: 62
---

To work with your books from a terminal or a script, use the `tinycld` tool. Its `books` commands list, add, change and delete the lists of the books: accounts, customers, vendors, products and services, and sales tax. They also record transactions, run reports, review bank transactions, reconcile an account, and show and adjust the stock of Inventory items.

## Before you start

Download the tool and sign in: see [Command line tool](help://core:command-line).

```
tinycld auth login {{server-host}}
```

A command can do what you can do in Books. If your access level is read-only, you can list and show, and no more.

## The lists

Each list has its own group of commands:

- `tinycld books accounts`: the [chart of accounts](help://books:chart-of-accounts)
- `tinycld books customers`: customers and sub-customers
- `tinycld books vendors`: vendors
- `tinycld books products`: products, services, [Inventory items](help://books:inventory) and bundles. Books keeps the quantity on hand and the stock value of an Inventory item; you cannot set them
- `tinycld books bundle-items`: the products inside a bundle
- `tinycld books bins`: the bin locations where you keep the stock of Inventory items
- `tinycld books bin-transfers`: the moves of stock between bin locations; a move has no `edit` and no `delete`
- `tinycld books tax-agencies`: the agencies you pay [sales tax](help://books:sales-tax) to
- `tinycld books tax-rates`: sales tax rates and groups
- `tinycld books statements`: [statements](help://books:statements) for customers; a statement has no `edit`

## To list and show records

```
tinycld books customers list
tinycld books customers list --search acme
tinycld books customers show <id>
```

A list shows active records, 200 to a page; `--limit` takes 1 to 500. Add `--inactive` for the inactive ones, `--all` for both, and `--page 2` for the next page. The last column is the record's id: the other commands take it.

## To add or change a record

Write the record as JSON, in a file or on standard input:

```
echo '{"display_name": "Acme Corp", "email": "ap@acme.example"}' | tinycld books customers add --input -
tinycld books customers edit <id> --input changes.json
```

`edit` changes only the fields that the JSON names. `null` clears a field. An amount of money is a whole number of cents: `1250` is 12.50.

To see the fields of a record, run `tinycld books schema customers add`. For an account, `tinycld books accounts types` lists the account types with their detail types.

## To make a record inactive, or delete it

```
tinycld books vendors deactivate <id>
tinycld books vendors activate <id>
tinycld books vendors delete <id>
```

An inactive record is hidden from pickers and keeps its history. `delete` asks first; `--yes` answers. Books refuses to delete a record that is in use (an account with transactions, a customer with invoices): make it inactive.

## The transactions

Each type of transaction has its own group of commands:

- `tinycld books journal-entries`: [journal entries](help://books:journal-entries). `list` and `show` also print the journal entry that Books writes for every other transaction; `list --type invoice` lists the entries of the invoices
- `tinycld books transfers`: [transfers](help://books:transfers), money that you move from one of your accounts to another
- `tinycld books invoices`: [invoices](help://books:invoices)
- `tinycld books sales-receipts`: [sales receipts](help://books:sales-receipts), a sale that is paid at once; `deposit_to` is the account that receives the money
- `tinycld books credit-memos`: [credit memos](help://books:credit-memos); `invoice` names the invoice that the credit is for
- `tinycld books refund-receipts`: [refund receipts](help://books:refund-receipts); `refund_from` is the bank account that the money leaves
- `tinycld books estimates`: [estimates](help://books:estimates), an offer to a customer. An estimate posts nothing
- `tinycld books bills`: [bills](help://books:bills), what you owe a vendor; `purchase_order` names the purchase order a bill was made from, and `po_line` on a line names the order line it bills
- `tinycld books purchase-orders`: [purchase orders](help://books:purchase-orders), what you order from a vendor. A purchase order posts nothing: see "To work with a purchase order"
- `tinycld books expenses`: [expenses](help://books:expenses), a purchase that is paid at once; `paid_from` is the bank or credit card account that the money left
- `tinycld books vendor-credits`: [vendor credits](help://books:vendor-credits)
- `tinycld books payments`: [payments](help://books:receive-payment) that a customer makes for invoices
- `tinycld books bill-payments`: [bill payments](help://books:pay-bills), money that you pay a vendor for bills
- `tinycld books vendor-refunds`: [vendor refunds](help://books:vendor-refunds), money that a vendor pays you back for vendor credits
- `tinycld books deposits`: [bank deposits](help://books:bank-deposits), money that you move from Undeposited funds into a bank account
- `tinycld books write-offs`: [write-offs](help://books:write-offs), the open balance of an invoice that the customer will not pay
- `tinycld books inventory-adjustments`: [inventory adjustments](help://books:inventory), a change of the quantity or the value of the stock, in a bin location or in No bin: see "To adjust inventory"

```
tinycld books journal-entries list --status draft
tinycld books invoices list --customer <customer id>
tinycld books invoices show <id>
```

`show` prints the transaction with its lines and with the totals that Books computed. For an invoice, a sales receipt, a credit memo or a refund receipt it also prints `tax_lines`: the sales tax that Books computed for each tax rate. You cannot send totals, line amounts or tax lines; Books computes them as it does for the form.

A line of an invoice, a sales receipt, a credit memo, a refund receipt or an estimate has a `kind`: `item` (a product or service, a quantity and a rate), `description` (text only), `subtotal` (the sum of the lines above it) or `percent` (a percentage of the item or subtotal right above it, in parts per million: `-100000` is a 10% discount).

A line of a bill, an expense or a vendor credit has a `kind`: `account` (an account and an `amount`) or `item` (a product or service, a quantity and a rate). Do not send the `amount` of an `item` line: Books computes it. An `item` line of an Inventory item puts its quantity into the stock when a bill or an expense is posted, and a vendor credit takes it out.

## To record a payment for invoices

A payment has `applications` in place of lines: each one names a posted invoice of the customer and the part of the payment that pays it.

```
echo '{"customer": "<customer id>", "date": "2026-07-22", "amount": 35000, "applications": [
  {"invoice": "<invoice id>", "amount": 30000},
  {"invoice": "<invoice id>", "amount": 5000}
]}' | tinycld books payments add --input - --post
```

When the payment is posted, Books lowers the balance of each invoice. The part of `amount` that no application uses stays as the customer's credit: `show` prints it as `credited`. Without `deposit_to`, the money goes to Undeposited funds. A payment can pay up to 500 invoices.

## To pay bills

A bill payment has one line for each bill it pays: a posted bill of the vendor, and the part of the bill that the payment pays.

```
echo '{"vendor": "<vendor id>", "paid_from": "<bank account id>", "payment_method": "check", "date": "2026-07-22", "lines": [
  {"bill": "<bill id>", "amount": 30000},
  {"bill": "<bill id>", "amount": 5000}
]}' | tinycld books bill-payments add --input -
tinycld books bill-payments edit <id> --input changes.json
tinycld books bill-payments void <id>
```

A bill payment has no draft: `add` posts it at once, and Books lowers the balance of each bill. It has no `--post`, no `post` and no `delete`. `edit` voids the bill payment and posts a new one with your changes. `void` puts the balances of the bills back. A bill payment can pay up to 250 bills.

## To apply a credit

To use a posted credit memo for an invoice of the same customer, or a posted vendor credit for a bill of the same vendor, apply it:

```
echo '{"invoice": "<invoice id>", "amount": 10000, "date": "2026-07-22"}' | tinycld books credit-memos apply <id> --input -
echo '{"bill": "<bill id>", "amount": 3000, "date": "2026-07-22"}' | tinycld books vendor-credits apply <id> --input -
tinycld books credit-memos unapply <id> <application id>
```

Books lowers the balance of the credit and of the invoice or bill in the same step. It refuses an amount that is more than the credit has left or more than is owed, and a date before the date of the credit. `apply` prints the credit with its `applications`; each one has an `id`. `unapply` removes one application, and Books puts the balances back. It does not ask first. You cannot void a credit while it is applied: remove its applications first. For more, see [apply a credit](help://books:apply-credit).

## To write off an invoice

```
echo '{"invoice": "<invoice id>", "date": "2026-07-22", "account": "<bad debts account id>", "amount": 39274}' | tinycld books write-offs add --input -
tinycld books write-offs void <id>
```

`amount` is the open balance of the invoice: `tinycld books invoices show <id>` prints it as `balance`. Books refuses another amount, so that you do not write off an invoice that changed after you read it. A write-off has no draft: `add` posts it at once, and the invoice has no open balance left. It has no `edit`, no `post` and no `delete`: to change a write-off, void it and add a new one. `void` puts the balance of the invoice back.

## To record a refund from a vendor

A vendor refund has one line for each vendor credit that the vendor pays back. When the refund is posted, the lines must add up to `amount`, and Books lowers the unapplied part of each vendor credit. A vendor refund can have up to 500 lines.

```
echo '{"vendor": "<vendor id>", "date": "2026-07-22", "refunded_to": "<bank account id>", "amount": 4000, "lines": [
  {"vendor_credit": "<vendor credit id>", "amount": 4000}
]}' | tinycld books vendor-refunds add --input - --post
```

## To make a bank deposit

A deposit has `items` and `lines`. An item is money that waits in Undeposited funds: `line` is the id of the journal line that put it there. To find it, list the money that a deposit can take with `tinycld books deposits undeposited`: it shows each posted line on an Undeposited funds account that no posted deposit holds, with its date, type, number, customer or vendor, amount, payment method and reference number (a check number), and its `line`. It takes `--customer`, `--vendor`, `--account`, `--doc-type`, `--payment-method` and `--search` to narrow the list. The other way is to print the journal entry of one payment with `tinycld books payments entry <id>`: each line has an `id`, and the line on the Undeposited funds account is the one. A line is other money in the deposit, such as a bank fee (an amount below zero) or interest.

```
echo '{"date": "2026-07-22", "deposit_to": "<bank account id>",
  "items": [{"line": "<journal line id>"}],
  "lines": [{"account": "<bank fees account id>", "amount": -500, "description": "Bank fee"}]
}' | tinycld books deposits add --input - --post
```

Books fills the rest of an item (the customer, the amount, the date) and computes `total` when the deposit is posted: a draft has the total 0. Books refuses an item that is in another posted deposit. A deposit can have up to 500 items and 100 lines. `edit` of a draft takes up to 1100 changes in one step, and it removes and adds each row of `items` or `lines` that the JSON has: for a very large draft, change `items` and `lines` in two calls.

## To move money between your accounts

A transfer has two lines. The first line is the account that the money leaves, with the amount in `credit`. The second line is the account that the money goes to, with the same amount in `debit`.

```
echo '{"date": "2026-07-22", "memo": "To savings", "lines": [
  {"account": "<checking account id>", "credit": 50000},
  {"account": "<savings account id>", "debit": 50000}
]}' | tinycld books transfers add --input - --post
```

The command refuses a transfer with more than two lines before it sends anything. Books refuses a transfer when it is posted if the lines are in the other order, or if an account is an income or expense account. `tinycld books transfers list` lists only the transfers. `tinycld books journal-entries list --type transfer` shows their journal entries, but change a transfer with `tinycld books transfers`.

## To make a statement for a customer

A statement records what a customer owes on a date. It posts nothing.

```
echo '{"customer": "<customer id>", "type": "open_items", "statement_date": "2026-07-31"}' | tinycld books statements add --input -
echo '{"customer": "<customer id>", "type": "balance_forward", "statement_date": "2026-07-31", "start_date": "2026-07-01", "end_date": "2026-07-31"}' | tinycld books statements add --input -
tinycld books statements list --customer <customer id>
tinycld books statements delete <id>
```

An `open_items` statement has no period. A `balance_forward` statement needs `start_date` and `end_date`. Books numbers the statement and computes `balance`. A statement is never changed, so there is no `edit`: delete it and add a new one. The command line does not send a statement by email; send it from the app.

## To sell an Inventory item

Put the id of the [Inventory item](help://books:inventory) in `product` of an `item` line, as for a service. When the transaction is posted, Books takes the quantity out of the stock and writes the cost to the journal entry; `entry` prints it. A credit memo or a refund receipt puts the quantity back. A draft moves no stock.

Books does not stop a sale of more than you have: the quantity on hand goes below zero. `tinycld books products show <id>` prints `quantity_on_hand` and `stock_value`, and `quantity_on_po`: the quantity that is ordered on open purchase orders and not received yet.

## To see the journal entry of a transaction

```
tinycld books invoices entry <id>
```

`entry` prints the journal entry that Books wrote when the transaction was posted: the accounts it debits and credits. A draft has no journal entry.

## To record a transaction

Write the transaction as JSON, with its lines as an array:

```
echo '{"date": "2026-07-15", "memo": "Owner investment", "lines": [
  {"account": "<bank account id>", "debit": 50000},
  {"account": "<equity account id>", "credit": 50000}
]}' | tinycld books journal-entries add --input - --post
```

Without `--post`, the transaction is a draft: it does not count in the books until it is posted. Books stores the transaction and its lines in one step. When it refuses a line, it stores nothing, and the message names the line: `lines[1]` is the second line.

Four types have no draft. A bill payment and a write-off are posted by `add`, an estimate is pending at once, and a purchase order is open at once: they have no `--post` and no `post`.

To see the fields of a transaction and of its lines, run `tinycld books schema journal-entries add`. Each type has its own: `tinycld books schema deposits add`, `tinycld books schema credit-memos apply`.

## To change a transaction

```
tinycld books journal-entries edit <id> --input changes.json
```

`edit` changes only the fields that the JSON names. When the JSON has `lines`, they replace all the lines of the transaction. Books never changes a posted transaction: `edit` voids it and posts a new one with your changes, and prints the new one. It does not ask first. Its `replaces` is the id of the transaction it corrects.

## To post, void or delete a transaction

```
tinycld books journal-entries post <id>
tinycld books journal-entries void <id>
tinycld books journal-entries delete <id>
```

`post` is for a draft: Books numbers it, and it counts in the books. `void` is for a posted transaction: it keeps its number, and its amounts no longer count. `delete` is for a draft. `void` and `delete` ask first; `--yes` answers. You cannot undo a post, a void or a delete.

## To work with an estimate

An estimate has no draft: `add` makes it pending, and Books numbers it at once. `edit` changes it in place. It has no `post` and no `void`.

```
tinycld books estimates accept <id> --date 2026-07-20 --by "Dana Lee"
tinycld books estimates reject <id>
tinycld books estimates reopen <id>
echo '{"date": "2026-07-21", "due_date": "2026-08-20"}' | tinycld books estimates convert <id> --input -
```

An estimate moves no stock. `accept` and `reject` record the customer's answer; `reopen` makes the estimate pending again. Books closes an estimate when an invoice is made from it. A closed estimate cannot be changed or deleted.

`convert` makes a draft invoice with the customer, the billing address, the email address, the tax rate and the lines of the estimate, and prints it. It does not copy the memo or the message. The JSON gives the invoice's own fields: `date` and `due_date` are required, and `lines` replaces the lines of the estimate. Books closes the estimate in the same step, and one estimate makes one invoice. Post the invoice with `tinycld books invoices post`.

## To work with a purchase order

A purchase order has no draft: `add` makes it open, and Books numbers it at once. `edit` changes an open one in place. It has no `post` and no `void`, and it posts nothing to the books. A line has a `kind`, as a line of a bill: `account` (an account and an `amount`) or `item` (a product or service, a quantity and a rate).

```
echo '{"vendor": "<vendor id>", "date": "2026-07-20", "lines": [
  {"kind": "item", "product": "<product id>", "quantity": 10, "rate": 12140},
  {"kind": "account", "account": "<expense account id>", "amount": 30000, "description": "Annual license"}
]}' | tinycld books purchase-orders add --input -
tinycld books purchase-orders show <id>
tinycld books purchase-orders copy-to-bill <id>
echo '{"date": "2026-07-28", "due_date": "2026-08-27"}' | tinycld books purchase-orders copy-to-bill <id> --input -
echo '{"date": "2026-07-28", "due_date": "2026-08-27", "lines": [{"po_line": "<order line id>", "quantity": 4}]}' | tinycld books purchase-orders copy-to-bill <id> --input - --post
tinycld books purchase-orders close <id>
tinycld books purchase-orders reopen <id>
```

`copy-to-bill` makes a draft bill for the order's vendor, with the order's `mailing_address`, and prints it. Without `lines` in the JSON, the bill takes every open line: an `item` line at its `open_quantity`, an `account` line at its `open_amount`. Each bill line names its order line in `po_line`, and the bill names the order in `purchase_order`. To bill a part, give `lines`: each row names an order line in `po_line` and gives its `quantity` (an `item` line) or its `amount` (an `account` line); the bill line takes the kind, the product or account, the description and the rate of the order line. The JSON gives the bill's own fields: `date` and `due_date` are required in it. `--input` is optional: without it, the bill is dated today, takes the vendor's `terms` and the `due_date` they give, and takes every open line. `--post` posts the bill in the same step. The order stays open, so one order can make many bills.

`show` prints what is still open. On each line, `received` is the quantity and `billed` the amount on posted bills, and `open_quantity` and `open_amount` are what is left. The order's `open_amount` is the sum of its lines' while it is open. A draft bill changes none of them: Books counts a bill when it is posted, and counts it out again when it is voided, deleted or corrected to less. When nothing is open on any line, Books closes the order: `closed_reason` is `received`.

`close` closes an open order by hand (`closed_reason` is `manual`): nothing more can be copied to a bill. `reopen` opens it again. Only a Books admin can close or reopen an order. An order that Books closed because every line is received has no `reopen`: it opens again by itself when one of its bills is voided, deleted or corrected to less. `close` asks first; `--yes` answers. `delete` removes an order that no bill was made from; Books refuses it for an order with bills: close it instead. You cannot send a purchase order or download its PDF from the command line; do it in the app.

## To run a report

`tinycld books reports` works with the [reports](help://books:reports) of Books that you can open: those Books ships, those shared with you, and your own.

```
tinycld books reports list
tinycld books reports list --search balance
tinycld books reports show books.trial_balance
```

`list` prints each report's id. A report that Books ships also has a key, such as `books.trial_balance`. Give the id or the key to `show`, `run` and `export`. `show` prints the params that the report takes.

```
tinycld books reports run books.trial_balance
echo '{"params": {"asOf": "2026-06-30"}}' | tinycld books reports run books.trial_balance --input -
tinycld books reports run books.general_ledger --expand-all --all --json
```

`run` prints the rows of the report. With no `--input`, the report runs with its default params. To set params, give a JSON object with `params`: one value for each param, by its id. The same object can hold `options`, such as `today` (the day that the period presets count from). Books checks each value and names the one it refuses.

A report with groups prints its group rows; `--expand-all` opens every group. A long report comes in pages: with `--json`, `next` holds the cursor of the next page, and `--cursor` reads that page. `--all` reads every page. `run` prints an amount in cents.

```
tinycld books reports export books.profit_and_loss --format pdf --file profit-and-loss.pdf
tinycld books reports export books.trial_balance --format csv --file trial-balance.csv --input params.json
tinycld books reports export books.general_ledger --format json --file general-ledger.json
```

`export` writes the report to a file. `csv`, `xlsx` and `pdf` are the files that the Export menu makes, with every group open and the amounts as you read them. `json` is the result of `run --all`. Books records an export to `csv`, `xlsx` or `pdf` in the audit log; a `json` export is a run, and a run is not recorded. `--file` is written over when it exists. Books does not make a CSV or Excel file of more than 50,000 rows, or a PDF of more than 5,000 rows.

If a report command says that it requires the "reports" scope, you signed in before your server had it. Sign in again with `tinycld auth login {{server-host}}`.

## To review bank transactions

`tinycld books banking` works with [Banking](help://books:banking): the bank and card accounts that you connected in the app, the files that you uploaded for them, and the transactions that Books imported.

```
tinycld books banking connections
tinycld books banking files --connection <connection id>
tinycld books banking list
tinycld books banking list --status all --search depot
```

`connections` prints the id of each connected account. To connect an account, use the app: Books, Banking, Connect account. `files` lists the uploaded files, the newest first. `list` prints the transactions that are [For review](help://books:bank-review), the newest first: `--status` takes `for_review`, `reviewed`, `excluded` or `all`. An `amount` above 0 is money in, and below 0 is money out.

```
tinycld books banking show <id>
```

`show` prints one bank transaction. For a transaction that is For review, `suggestions` holds the posted transactions of Books that it can be [matched](help://books:bank-match) to: `line` is the id that `match` takes. For a reviewed transaction, `match` or `categorization` says how it was handled.

## To import a bank file

Download a statement file from your bank (CSV, OFX, QFX or QBO), then upload it for a connection:

```
tinycld books banking upload statement.csv --connection <connection id>
tinycld books banking rows <file id>
```

`upload` stores the file and prints its id. It makes no transaction. Books takes a file of 5 MB or less. Books refuses a file that has the same content as a stored file. `rows` prints the first rows that Books read, each with its line number: use it to find the columns of a CSV file. A column is counted from 1.

Then import the rows. For a CSV file, the JSON says which column holds the date, the description and the amount:

```
echo '{"header_row": true, "date_column": 1, "date_format": "MM/DD/YYYY", "description_column": 2, "amount_columns": "one", "amount_column": 3}' | tinycld books banking import <file id> --input -
```

An OFX, QFX or QBO file needs no `--input`:

```
tinycld books banking import <file id>
```

`import` makes the [bank transactions](help://books:bank-import). `amount_columns` is `one` for one signed column (`amount_column`), or `two` for a column each (`money_in_column`, `money_out_column`). `import` takes every row, but not the first row when `header_row` is true. To import some rows only, give `lines` with their line numbers. Books leaves out a row that it holds already: `duplicates` counts them. When Books cannot read one of the rows, it imports nothing and names the line: give `lines` without that line.

## To add a bank transaction to Books

When a bank transaction is not in Books yet, [categorize](help://books:bank-categorize) it: Books posts a journal entry between the connected account and the account that you name, and the transaction is Reviewed.

```
echo '{"account": "<expense account id>", "vendor": "<vendor id>", "memo": "Office supplies"}' | tinycld books banking categorize <id> --input -
echo '{"account": "<savings account id>", "kind": "transfer"}' | tinycld books banking categorize <id> --input -
echo '{"lines": [
  {"account": "<supplies account id>", "amount": 6000},
  {"account": "<fees account id>", "amount": 2647}
]}' | tinycld books banking split <id> --input -
tinycld books banking undo <id>
```

`categorize` uses the whole bank amount for one account. With `"kind": "transfer"`, the account is another bank or card account of yours. `split` divides the amount: each line has an account and an `amount` in cents, above 0 for the direction of the bank transaction. Books refuses lines that do not add up to the bank amount. `undo` voids the journal entry, and the transaction is For review again. It does not ask first.

## To match or exclude a bank transaction

When a bank transaction is in Books already (a payment that you received, a bill that you paid, a deposit), [match](help://books:bank-match) it. Books posts nothing.

```
tinycld books banking show <id>
echo '{"lines": ["<journal line id>"]}' | tinycld books banking match <id> --input -
tinycld books banking unmatch <id>
tinycld books banking exclude <id>
tinycld books banking restore <id>
```

`lines` holds the ids of journal lines on the connected account: `show` prints the lines that Books suggests. One bank transaction can match up to 50 lines. Books refuses lines that do not add up to the bank amount. `unmatch` removes the match, and the transaction is For review again. It does not ask first.

`exclude` leaves a transaction that is For review out of the books: a duplicate, or one that is not of this business. `restore` moves it back to For review. Books does not exclude a reviewed transaction: use `undo` or `unmatch` first. Those two also make a reviewed transaction For review, so it needs no `restore`.

## To reconcile an account

`tinycld books reconcile` works with [Reconcile](help://books:reconcile): you compare a bank or credit card account with its statement. An account has one reconciliation in progress at a time.

```
tinycld books reconcile list --account <account id>
echo '{"account": "<account id>", "statement_date": "2026-09-30", "statement_balance": 162000}' | tinycld books reconcile start --input -
```

`list` prints the reconciliations, the newest statement first: `--status` takes `in_progress` or `finished`. `start` takes the closing date and the closing balance of the statement, in cents. For a bank account, a balance above 0 is money in the account. For a credit card, a balance above 0 is money that you owe. Books sets `beginning_balance`: the closing balance of the last finished statement of the account. When the statement gives its totals, add `"has_statement_totals": true` with `statement_out` and `statement_in`. `statement_out` is the total of the payments from a bank account, or of the charges of a credit card. `statement_in` is the total of the deposits of a bank account, or of the payments to a credit card.

Books refuses `start` while the account has a reconciliation in progress, and for a date that is not after the last finished statement.

```
tinycld books reconcile show <id>
echo '{"lines": ["<journal line id>", "<journal line id>"]}' | tinycld books reconcile clear <id> --input -
echo '{"lines": ["<journal line id>"]}' | tinycld books reconcile unclear <id> --input -
```

`show` prints one reconciliation with two lists of journal lines. `open` holds the lines that you can clear: they are in no reconciliation, and their date is on or before the statement date. `cleared` holds the lines that are cleared in this reconciliation. In each row, `line` is the id that `clear` and `unclear` take, `debit` is money into a bank account or a payment to a credit card, and `credit` is money out of a bank account or a charge of a credit card. `bank_matched` is true when a reviewed bank transaction holds the line.

`clear` marks each line of `lines` as on the statement. Books refuses a line that is dated after the statement date, and a line that another reconciliation holds; then it clears none of the lines. `unclear` takes lines out of the reconciliation. It does not ask first. The two commands leave a line as it is when it is in that state already, so you can run a command again.

```
echo '{"statement_balance": 162500}' | tinycld books reconcile edit <id> --input -
tinycld books reconcile finish <id>
tinycld books reconcile undo <id>
tinycld books reconcile delete <id>
```

`finish` closes the reconciliation when the cleared lines agree with the statement. The tool computes no difference. When the difference is not zero, Books refuses, and the message states it, for example "The difference is $420.00. It must be $0.00 to finish." Then clear or unclear lines, or correct the statement values with `edit`. `edit` changes the closing date, the closing balance or the totals of a reconciliation in progress. With an earlier closing date, Books takes out the cleared lines that are dated after it.

A finished reconciliation and its lines do not change. `undo` opens the latest finished reconciliation of an account again, and its lines stay cleared. Only a Books admin can do this. Books refuses an undo while the account has another reconciliation in progress: delete that one first. `undo` does not ask first. `delete` (or `discard`) removes a reconciliation that is in progress, and its lines are then in no reconciliation. It asks first; in a script, add `--yes`.

Books ships a report of the finished reconciliations, the Reconciliation Report: `tinycld books reports run books.reconciliation_report`. `tinycld books reports show books.reconciliation_report` prints the params that it takes.

## To see the stock of an Inventory item

`tinycld books inventory` reads what Books keeps for an [Inventory item](help://books:inventory): how much is in stock, and what it cost.

```
tinycld books products show <product id>
tinycld books inventory moves --product <product id>
tinycld books inventory layers --product <product id>
```

`products show` prints the stock of an item now: `quantity_on_hand` and `stock_value`, in cents. `low_stock` is `true` while the item has a `reorder_point` above 0 and its quantity on hand is at or below it; Books keeps it, and you cannot set it. `default_bin` is the item's default bin location. `moves` lists each change of the stock, the newest first: `kind` says what changed it (`opening`, `receipt`, `sale`, `customer_return`, `vendor_return` or `adjustment`), `quantity` and `value` are the change, and `quantity_after` and `value_after` are the stock after it. `bin` is the bin location the quantity moved in (empty for No bin), and `document_number` is the number of the transaction that made the move. For a move out of stock, `value` is the cost that the costing method gives. `layers` lists the stock on hand with its cost. With the costing method FIFO, a layer is what is left of one move into stock: the layers of an item are in the order of the date of that move, and Books takes stock out from the first one. With the costing method average cost, an item has one layer: all its stock, at the average cost.

Books writes the moves and the layers when a transaction is posted. No command changes them.

## To adjust inventory

`tinycld books inventory-adjustments` changes the quantity or the value of the stock of Inventory items: a stock count, damage, or a correction of the cost. It has the commands of a transaction: `list`, `show`, `add`, `edit`, `post`, `void`, `delete` and `entry`.

```
echo '{"date": "2026-09-30", "memo": "Stock count", "lines": [
  {"product": "<product id>", "bin": "<bin id>", "quantity": 10, "value": 5000},
  {"product": "<product id>", "quantity": -2},
  {"product": "<product id>", "value": -300}
]}' | tinycld books inventory-adjustments add --input - --post
tinycld books inventory-adjustments edit <id> --input changes.json
tinycld books inventory-adjustments void <id>
```

Each line names an Inventory item and a change. A `quantity` above 0 puts stock in, and `value` is the cost of that quantity, in cents. A `quantity` below 0 takes stock out: do not give a `value`, because Books takes the cost from the costing method. A line with a `value` and no `quantity` changes the value of the stock only, up or down. `bin` is the bin location the quantity changes in; leave it out for No bin. A line with no `quantity` has no `bin`. An adjustment has up to 500 lines.

`account` is the account for the other side of the change of value. When you do not give one, Books uses Inventory shrinkage. `entry` prints the journal entry; an adjustment that changes no value has none. After the post, `value_change` is the change of the value of the stock, in cents: Books writes it.

Books never changes a posted adjustment. `edit` of a draft changes it in place; `edit` of a posted manual adjustment is a correction: Books voids it and posts a new one with your changes, in one step, and the command prints the new one. Its `replaces` is the id of the one it corrects, and the old one's `replaced_by` is the id of the new one. When your changes do not name `lines`, the correction copies the lines of the posted one with their bin locations. Books refuses it when the bin location of a line is now inactive: give the `lines` in the JSON again, with another `bin`. You can also give `replaces` to `add`, and only to `add` (`edit` refuses it): the new adjustment corrects that one when it is posted. Give `--post` with it: a draft that names it cannot post once the corrected one is void (by `void`, or by another correction). Books refuses a `replaces` of an adjustment that is not posted, that Books made, or that was corrected before. `--kind opening` and `--kind recost` list the adjustments that Books made: for the opening stock of an item, and when an earlier transaction changed a cost. The commands list and show those, and refuse to change them.

## To keep stock in bin locations

A bin location is a place where you keep the stock of an [Inventory item](help://books:inventory), for example Aisle 3, shelf B. Stock in no bin is in No bin. `tinycld books bins` has the commands of the other lists: `list`, `show`, `add`, `edit`, `deactivate`, `activate` and `delete`.

```
echo '{"name": "Aisle 3, shelf B", "note": "by the door"}' | tinycld books bins add --input -
echo '{"product": "<product id>", "from_bin": "<bin id>", "to_bin": "", "quantity": 4, "memo": "to the counter"}' | tinycld books bin-transfers add --input -
tinycld books inventory bin-stock --product <product id>
```

A bin name is unique without regard to case. Books refuses to delete a bin that holds stock or has history: make it inactive. An inactive bin keeps its stock.

To give an item a default bin, set `default_bin` with `tinycld books products edit`. A transaction that names no bin (an invoice, a bill, the opening stock) moves the item's stock in its default bin, or in No bin when it has none. A change of `default_bin` moves no stock. An inventory adjustment line names its own `bin`.

`bin-transfers add` moves a quantity of an item from `from_bin` to `to_bin`; an empty bin is No bin. The move is dated now and changes no cost and no journal entry. Books refuses a move above what `from_bin` holds, two bins that are the same, and an inactive `to_bin`. A move is never changed or deleted: to correct one, move the stock back. `bin-transfers list` lists the moves, the newest first, and `show` prints one, with `created` and `created_by`.

`inventory bin-stock` lists the quantity of each item in each bin: `product`, `bin` and `quantity`. `--product` and `--bin` keep the rows of one item or one bin; `--bin ""` keeps the stock in No bin. The rows of an item add up to its `quantity_on_hand`. A bin has a quantity and no value: the cost is the item's.

## To retry safely

When the answer to a write is lost (the network fails, or a proxy answers 502, 503 or 504), the command sends the same write again, with the same ids, up to three more times. Books cannot store it twice: when an earlier send was stored, Books refuses the next one, and the command prints what is stored as usual. This is true for `add`, `add --post`, `convert`, `apply` and `edit`, and in `banking` for `upload`, `import`, `categorize`, `split` and `match`. It is also true for `reconcile start`, `clear` and `unclear`, and for `bin-transfers add`.

When no answer comes back at all, the command exits 7. The transaction may be stored or not, and the message names its id. To find out, run `show` with that id:

```
tinycld books journal-entries show <id>
```

For a `banking` command, the id is not that of a bank transaction. The message of a command that names a check, such as `upload`, names the command to check with. The message of `import` gives only the step to send it again.

To send it again safely, run the same command with `--id <id>`. When the first run was stored, Books writes nothing, and the command exits 6 with a message that the record already exists. A script can also choose the id before the first run: 15 characters, each a lower-case letter a-z or a digit 0-9.

```
tinycld books journal-entries add --id entry2026071501 --input entry.json --post
```

`add`, `convert`, `apply`, and `edit` take `--id`. For `edit`, it is the id of the new transaction that corrects a posted one; a draft keeps its own id. In `banking`, `upload`, `import`, `categorize`, `split` and `match` take `--id` too. So does `reconcile start`.

When the answer to the `edit` of a draft is lost and the change was stored, the command finds the change in the draft and prints it as usual. When someone else changed the draft between the two sends, the command shows the refusal from Books.

## For scripts and agents

- Add `--json` to any command: it prints one JSON document, the result or an error.
- The exit code says what went wrong: `1` the command failed for another reason, `2` the call is wrong, `3` sign in again, `4` the sign-in does not include Books, `5` no such record, `6` Books refused the data (the message says why), `7` the server did not answer. After a write, the message of exit 7 names the id: see "To retry safely".
- `tinycld books schema` prints every command with the JSON Schema of its input and output.
