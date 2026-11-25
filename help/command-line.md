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

```
tinycld books journal-entries list --status draft
tinycld books invoices list --customer <customer id>
tinycld books invoices show <id>
```

`show` prints the transaction with its lines and with the totals that Books computed. For an invoice, a sales receipt, a credit memo or a refund receipt it also prints `tax_lines`: the sales tax that Books computed for each tax rate. You cannot send totals, line amounts or tax lines; Books computes them as it does for the form.

A line of an invoice, a sales receipt, a credit memo, a refund receipt or an estimate has a `kind`: `item` (a product or service, a quantity and a rate), `description` (text only), `subtotal` (the sum of the lines above it) or `percent` (a percentage of the item or subtotal right above it, in parts per million: `-100000` is a 10% discount).

A line of a bill, an expense or a vendor credit has a `kind`: `account` (an account and an `amount`) or `item` (a product or service, a quantity and a rate). Do not send the `amount` of an `item` line: Books computes it. An `item` line of an Inventory item puts its quantity into the stock when a bill or an expense is posted, and a vendor credit takes it out.

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
