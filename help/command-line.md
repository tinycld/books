---
title: Books from the command line
summary: List and change accounts, customers, vendors, products and sales tax, and record transactions, from a terminal or a script with the tinycld tool.
tags: [cli, command line, terminal, automation, scripts, agents, json]
order: 62
---

To work with your books from a terminal or a script, use the `tinycld` tool. Its `books` commands list, add, change and delete the lists of the books: accounts, customers, vendors, products and services, and sales tax. They also record transactions.

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
- `tinycld books invoices`: [invoices](help://books:invoices)
- `tinycld books sales-receipts`: [sales receipts](help://books:sales-receipts), a sale that is paid at once; `deposit_to` is the account that receives the money
- `tinycld books credit-memos`: [credit memos](help://books:credit-memos); `invoice` names the invoice that the credit is for
- `tinycld books refund-receipts`: [refund receipts](help://books:refund-receipts); `refund_from` is the bank account that the money leaves
- `tinycld books estimates`: [estimates](help://books:estimates), an offer to a customer. An estimate posts nothing
- `tinycld books bills`: [bills](help://books:bills), what you owe a vendor
- `tinycld books expenses`: [expenses](help://books:expenses), a purchase that is paid at once; `paid_from` is the bank or credit card account that the money left
- `tinycld books vendor-credits`: [vendor credits](help://books:vendor-credits)
- `tinycld books payments`: [payments](help://books:receive-payment) that a customer makes for invoices
- `tinycld books bill-payments`: [bill payments](help://books:pay-bills), money that you pay a vendor for bills
- `tinycld books vendor-refunds`: [vendor refunds](help://books:vendor-refunds), money that a vendor pays you back for vendor credits
- `tinycld books deposits`: [bank deposits](help://books:bank-deposits), money that you move from Undeposited funds into a bank account
- `tinycld books write-offs`: [write-offs](help://books:write-offs), the open balance of an invoice that the customer will not pay

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

Books does not stop a sale of more than you have: the quantity on hand goes below zero. `tinycld books products show <id>` prints `quantity_on_hand` and `stock_value`.

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

To see the fields of a transaction and of its lines, run `tinycld books schema journal-entries add`.

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

## For scripts and agents

- Add `--json` to any command: it prints one JSON document, the result or an error.
- The exit code says what went wrong: `1` the command failed for another reason, `2` the call is wrong, `3` sign in again, `4` the sign-in does not include Books, `5` no such record, `6` Books refused the data (the message says why), `7` the server did not answer.
- `tinycld books schema` prints every command with the JSON Schema of its input and output.
