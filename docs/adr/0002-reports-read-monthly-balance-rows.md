# Reports read monthly balance rows

Reports read server-maintained balance rows, one per account per month. Posting updates these rows in the same transaction as the entry. They can be rebuilt from the ledger at any time. Reports do not sum raw lines in the client. This keeps report cost small as the ledger grows, and clients get changes through live queries.

## Consequences

- Amounts are whole minor units. PocketBase stores them in float64 fields, which are exact only up to 2^53-1. Posting refuses an entry total, or a month balance, above that limit.
- If a row and the ledger disagree, an admin can run the rebuild action. It fixes only the rows that differ.
