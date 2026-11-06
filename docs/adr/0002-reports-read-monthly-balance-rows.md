# Reports run on core's engine as the reader

Books reports are core engine reports over the Books sources. The engine runs each report under the rules of the user who reads it. A report by month aggregates `books.account_balances`, the server-maintained balance rows (one per account per month). A report as of a day, such as the Trial Balance, reads posted journal lines, because a monthly balance row cannot stop inside its month. The client never sums lines itself.

## Consequences

- Posting updates the balance rows in the same transaction as the entry. They can be rebuilt from the ledger at any time. If a row and the ledger disagree, an admin can run the rebuild action. It fixes only the rows that differ and removes stray rows.
- Amounts are whole minor units. PocketBase stores them in float64 fields, which are exact only up to 2^53-1. Posting refuses an entry total, or a month's debit or credit total, above that limit.
- Books has no report screens of its own. A report opens in core's report viewer.
