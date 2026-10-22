# Books

Double-entry accounting for one organization's finances. Replaces QuickBooks for small businesses with an outside bookkeeper.

## Language

**Ledger**:
The complete set of balanced Journal Entries for one organization. Every financial record posts to it.
_Avoid_: Database, register

**Journal Entry**:
A dated set of debit and credit lines that sum to zero. The only record that changes an Account balance.
_Avoid_: Transaction, posting

**Account**:
A named category in the Chart of Accounts that holds a running balance (asset, liability, equity, income, expense).
_Avoid_: Category, bucket

**Chart of Accounts**:
The organization's ordered list of Accounts.

**Customer**:
A party that owes the organization money for goods or services.
_Avoid_: Client, buyer

**Vendor**:
A party the organization owes money to.
_Avoid_: Supplier, payee

**Invoice**:
A request for payment sent to a Customer. Posts to accounts receivable.

**Bill**:
A request for payment received from a Vendor. Posts to accounts payable.
_Avoid_: Invoice (when received)

**Credit Memo**:
A document that reduces what a Customer owes. A Vendor Credit is the same for a Vendor.
_Avoid_: Refund (a refund pays money back)

**Void**:
Cancelling a posted document with a reversing Journal Entry. The document and its number stay.
_Avoid_: Delete

**Undeposited Funds**:
The Account that holds received payments until a bank deposit groups them.

**Tax Rate**:
A percentage tied to one liability Account. A Tax Group combines several Tax Rates into one choice.

**Closed Through Date**:
The date on or before which no Journal Entry may be posted.
_Avoid_: Period lock

**Product/Service**:
A thing the organization sells (Service, Non-inventory, or Bundle). Sets the income Account, default rate, and tax flag for an Invoice line.
_Avoid_: Item, SKU

**Sales Receipt**:
A sale paid in full at the time it is made. Posts the sale and the payment together.

**Expense**:
A direct purchase paid at once by check, card, or cash, with no Bill.
_Avoid_: Check, Write Check

**Bank Deposit**:
A group of received payments, plus any extra lines, that arrive at the bank together. Moves money out of Undeposited Funds.

**For Review**:
The queue of imported bank transactions waiting to be matched, categorized, or excluded.

**Sub-customer**:
A Customer with one parent Customer. Balances roll up to the parent.
_Avoid_: Job

**Estimate**:
A quoted price for a Customer that posts nothing. Converting it creates a draft Invoice and closes the Estimate.
_Avoid_: Quote, Proposal

**Opening Balance**:
The Account balances entered as a Journal Entry on the day the organization starts using Books.

**Reconciliation**:
Matching an Account's Ledger lines to a bank statement for a period.

**Importer**:
A separate package that reads another product's data (first target: QuickBooks) and creates Books records.

**Draft**:
A Journal Entry that is not posted yet. It can change and be deleted, and it has no Document Number.

**Posting**:
The moment a Draft becomes immutable and gets its Document Number. Only a posted Journal Entry changes an Account balance.
_Avoid_: Saving, committing

**Reversing Entry**:
A Journal Entry that cancels another by swapping its debits and credits. Voids, edits of posted entries, and one-click reverses all use it.
_Avoid_: Adjustment, undo

**Document Number**:
The sequential number a document gets at Posting, counted per document type. A Void keeps the number of the entry it cancels.
_Avoid_: ID, reference

**Override**:
Time-limited permission for one user to post on or before the Closed Through Date. An admin grants it and gives a reason.
_Avoid_: Unlock, reopen
