# Posted journal entries are immutable

Once a Journal Entry is posted, it never changes. A correction is a reversing entry plus a new entry. The server enforces balance and the Closed Through Date at posting.

## Considered Options

- **Edit in place with an audit trail.** Rejected. Balances and reports stated earlier would change without notice, and the trail would be the only proof.

## Consequences

- The UI shows a normal Edit and hides the reversal.
- A void posts a reversal in the original period under the original number. An edit voids the original and posts the correction under the same number. A one-click reverse posts a mirror entry dated on or after the original, under a new number.
- Every void and every edit writes a reversal dated in the original period. The Closed Through Date applies to it, and to a one-click reverse or a correction. To correct an entry in a closed period, the user needs an Override.
- A refused change returns a plain error. The server never restores an old value silently.
