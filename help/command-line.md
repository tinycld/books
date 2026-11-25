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

```
tinycld books journal-entries list --status draft
tinycld books journal-entries show <id>
```

`show` prints the transaction with its lines and with the totals that Books computed.

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

## For scripts and agents

- Add `--json` to any command: it prints one JSON document, the result or an error.
- The exit code says what went wrong: `1` the command failed for another reason, `2` the call is wrong, `3` sign in again, `4` the sign-in does not include Books, `5` no such record, `6` Books refused the data (the message says why), `7` the server did not answer.
- `tinycld books schema` prints every command with the JSON Schema of its input and output.
