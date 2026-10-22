# Posted journal entries are immutable

Once a Journal Entry is posted, it never changes. A correction is a reversing entry plus a new entry. The UI still shows a normal Edit button and hides this. The server enforces the rules at posting: debits equal credits, and the date is after the Closed Through Date unless the poster holds an Override. A void keeps the original number. An edit voids the original and posts the correction under the same number. The one-click reverse is different: it posts a mirror entry on a later date under a new number.

## Considered Options

- **Edit in place with an audit trail.** Rejected. Balances and reports stated earlier would change without notice, and the trail would be the only proof.

## Consequences

- Every edit and every void writes entries dated in the original period. The Closed Through Date therefore applies to them.
- To correct an entry in a closed period, the user needs an Override.
- A refused change returns a plain error. The server never restores an old value silently.
