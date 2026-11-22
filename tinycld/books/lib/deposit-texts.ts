// The texts of the bank deposit screens (bank deposit spec §3). No imports, so an e2e spec
// can import this file without the app's module chain. `%s` is filled in order by
// fillPaymentText (lib/payment-texts.ts). The server's refusals of the same rules are the
// `msg…` constants of server/deposits.go; PocketBase adds the final period to those.

export const DEPOSIT_MESSAGES = {
    // The header band (spec §3.3).
    noBankAccount: 'Add a bank account to the chart of accounts',

    // The undeposited items and the other funds lines (spec §3.4, §3.5).
    noItems:
        'Nothing waits in Undeposited funds. Payments and sales receipts that you deposit to Undeposited funds show here.',
    itemLimit: 'A deposit holds at most 500 items.',
    lineLimit: 'A deposit holds at most 100 other funds lines.',
    otherFundsHint:
        'Money in this deposit that is not from a listed payment, such as interest or a refund. A negative amount takes money out, such as a fee or cash kept back.',

    // The form's rules (spec §3.6). The first `%s` is the item's label ("Payment 1004"),
    // the second its day ("Oct 12, 2026").
    amountZero: 'Enter an amount other than 0',
    nothingToDeposit: 'Select an item or add a line to deposit.',
    totalNotAboveZero: 'The deposit total must be above $0.00.',
    itemAfterDate: '%s is dated %s, after the deposit date.',
    memoHint: 'Only your team sees this. Saved as the journal entry memo.',

    // The posting refusals of an item (spec §3.7): the item's label, then the deposit's
    // ("Deposit 1002").
    itemVoid: '%s is void.',
    itemInOtherDeposit: '%s is already in %s.',
    // The deposited-item guard (spec §3.7, Q5).
    itemHeld: '%s is in %s. Remove it from the deposit first.',

    // The screen's states (spec §3.6, §3.9).
    noAccess: 'You need bookkeeper access to record deposits',
    loadFailed: 'Books could not load this deposit.',
    notFound: 'This deposit does not exist',
    cannotEdit: 'This deposit cannot be edited',

    // The dialogs (spec §3.6, §3.8).
    deleteDraftBody: "Delete this draft deposit? This can't be undone.",
    voidBody:
        'A reversing entry is posted in the original period. The number is kept. The items it deposited wait in Undeposited funds again.',

    // A deposited document's read view (spec §3.10); `%s` is the document's noun
    // (payment, sales receipt, vendor refund, refund receipt).
    inDepositNotice: 'To edit or void this %s, remove it from the deposit first.',
} as const
