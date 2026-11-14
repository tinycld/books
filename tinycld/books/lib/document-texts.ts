// The texts a sales document's shared layer shows, by kind (SalesDocumentKind.messages).
// Pure data with no imports: lib/sales-document-kinds.ts reads it, and the generator
// loads that module in Node through forms/hosts.ts.

// A document saved without a customer (a kind whose customer is optional): the Customer
// picker's clear choice, Bill to's empty text and the read view's Customer.
export const NO_CUSTOMER_TEXT = 'No customer'

// The hint under a bill's Vendor's bill no.: the layout's description (the design canvas)
// and the text VendorRefField draws on the record.
export const VENDOR_REF_HINT = "The number on the vendor's bill"

// The party address field's muted text when the picked party has no address, by party
// (DocumentPartyKey). An invoice's Bill to draws nothing then; a bill's Mailing address
// says so.
export const EMPTY_ADDRESS_TEXT: Record<'customer' | 'vendor', string> = {
    customer: '',
    vendor: 'No mailing address',
}

// The deposit and reference texts belong to the sales receipt only, so an invoice has
// none of them. `customerOnInvoices` is the kind's "<name> is on <documents>" text.
export type DocumentMessages = {
    percentTarget: string
    totalNegative: string
    totalTooLarge: string
    tooManyLines: string
    customerInactive: string
    customerOnInvoices: string
    needItemLine: string
    quantityNotPositive: string
    quantityDecimals: string
    quantityTooLarge: string
    rateMalformed: string
    rateTooLarge: string
    // A kind whose rate is never below 0 (a bill's: a discount is a negative account
    // line); a sales kind's rate may be negative and has none.
    rateNegative?: string
    percentRange: string
    percentDecimals: string
    noAccess: string
    notFound: string
    cannotEdit: string
    loadFailed: string
    customerLoadFailed: string
    bundleEmpty: string
    bundleLoadFailed: string
    pdfUnsaved: string
    // The button under `pdfUnsaved`: the kind's first save, in the words of its bar.
    pdfUnsavedSave: string
    pdfStale: string
    // Only the posting lifecycle offers Void, so a quote kind has no void text.
    voidBody?: string
    // A quote kind's: the invoice screen's notice at `?estimate=` of an estimate that does
    // not convert (rejected, closed or already on an invoice).
    cannotConvert?: string
    // A quote kind's delete confirm: its title (`%s` is the number), body and action. A
    // posting kind's Delete draft keeps DeleteDraftDialog's own words.
    deleteTitle?: string
    deleteBody?: string
    deleteAction?: string
    depositInvalid?: string
    depositNone?: string
    depositLoadFailed?: string
    depositRequired?: string
    referenceTooLong?: string
}

// The Amount cell of an account line (a bill's), the same on every kind that has one. The
// server refuses 0 with "Account line <n>: Enter an amount other than 0." (server/bills.go).
export const ACCOUNT_AMOUNT_MESSAGES = {
    zero: 'Enter an amount other than 0',
    malformed: 'Enter an amount like 1,234.50',
    tooLarge: 'The amount is too large',
} as const

// The invoice's texts. The first group is shown by the client and refused by the
// server with the same words (server/invoices.go); tests/document-messages.test.ts
// fails when they drift. PocketBase adds a final period to a server text that has
// none. `%s` is the customer's name: the client fills it with customerInactiveText,
// the server with refuseNamed.
export const INVOICE_MESSAGES = {
    dueBeforeDate: 'The due date cannot be before the invoice date',
    percentTarget: 'A percent line applies to the item or subtotal right above it',
    totalNegative: 'An invoice total cannot be below zero. Use a credit memo.',
    totalTooLarge: 'The invoice total is more than Books can store.',
    tooManyLines: 'An invoice can have at most 250 lines.',
    customerInactive: '%s is inactive. Choose an active customer.',
    customerOnInvoices: '%s is on invoices. Make it inactive instead.',

    // Client only.
    needItemLine: 'Add at least one product or service line',
    quantityNotPositive: 'Enter a quantity more than 0',
    quantityDecimals: 'A quantity can have at most 2 decimals',
    quantityTooLarge: 'A quantity can be at most 1,000,000',
    rateMalformed: 'Enter a rate like 1,234.50',
    rateTooLarge: 'The rate is too large',
    percentRange: 'Enter a percent from -100 to 1000',
    percentDecimals: 'A percent can have at most 4 decimals',
    noAccess: 'You need bookkeeper access to create invoices',
    notFound: 'This invoice does not exist',
    cannotEdit: 'This invoice cannot be edited',
    loadFailed: 'Books could not load this invoice.',
    customerLoadFailed: 'Books could not load this customer.',
    bundleEmpty: 'This bundle has no active items',
    bundleLoadFailed: "Books could not load this bundle's items.",
    pdfUnsaved: 'Save a draft to see the PDF',
    pdfUnsavedSave: 'Save draft',
    pdfStale: 'Shows the last saved version',
    voidBody: 'A reversing entry is posted in the original period. The number is kept.',
} as const satisfies DocumentMessages & { dueBeforeDate: string; voidBody: string }

// The sales receipt's texts. The first group is shown by the client and refused by the
// server with the same words (server/sales_receipts.go); tests/document-messages.test.ts
// fails when they drift. The deposit texts name Deposit to, which only a receipt has.
export const SALES_RECEIPT_MESSAGES = {
    percentTarget: INVOICE_MESSAGES.percentTarget,
    totalNegative: 'A sales receipt total cannot be below zero. Use a refund receipt.',
    totalTooLarge: 'The sales receipt total is more than Books can store.',
    tooManyLines: 'A sales receipt can have at most 250 lines.',
    customerInactive: '%s is inactive. Choose an active customer.',
    customerOnInvoices: '%s is on sales receipts. Make it inactive instead.',
    depositInvalid: 'Choose an active bank or Undeposited funds account',
    depositNone: 'Add a bank account or an Undeposited funds account to the chart of accounts',

    // Client only.
    needItemLine: INVOICE_MESSAGES.needItemLine,
    quantityNotPositive: INVOICE_MESSAGES.quantityNotPositive,
    quantityDecimals: INVOICE_MESSAGES.quantityDecimals,
    quantityTooLarge: INVOICE_MESSAGES.quantityTooLarge,
    rateMalformed: INVOICE_MESSAGES.rateMalformed,
    rateTooLarge: INVOICE_MESSAGES.rateTooLarge,
    percentRange: INVOICE_MESSAGES.percentRange,
    percentDecimals: INVOICE_MESSAGES.percentDecimals,
    noAccess: 'You need bookkeeper access to create sales receipts',
    notFound: 'This sales receipt does not exist',
    cannotEdit: 'This sales receipt cannot be edited',
    loadFailed: 'Books could not load this sales receipt.',
    customerLoadFailed: INVOICE_MESSAGES.customerLoadFailed,
    bundleEmpty: INVOICE_MESSAGES.bundleEmpty,
    bundleLoadFailed: INVOICE_MESSAGES.bundleLoadFailed,
    pdfUnsaved: INVOICE_MESSAGES.pdfUnsaved,
    pdfUnsavedSave: INVOICE_MESSAGES.pdfUnsavedSave,
    pdfStale: INVOICE_MESSAGES.pdfStale,
    voidBody: INVOICE_MESSAGES.voidBody,
    depositLoadFailed: 'Books could not load the deposit accounts.',
    depositRequired: 'Choose where the money was deposited',
    referenceTooLong: 'Reference no. can be at most 40 characters',
} as const satisfies DocumentMessages & { voidBody: string }

// The bill's texts. The first group is shown by the client and refused by the server with
// the same words (server/bills.go); tests/document-messages.test.ts fails when they drift.
// PocketBase adds a final period to a server text that has none, so the field rule
// `dueBeforeDate` has none here. A bill's party is a vendor: the `customer…` keys of the
// shared layer hold the vendor's texts. A bill has no percent lines, bundles or PDF; the
// type's texts for them are the invoice's and never show.
export const BILL_MESSAGES = {
    totalNegative: 'A bill total cannot be below zero. Use a vendor credit.',
    totalZero: 'A bill total must be more than zero to post.',
    totalTooLarge: 'The bill total is more than Books can store.',
    tooManyLines: 'A bill holds at most 250 lines.',
    customerInactive: '%s is inactive. Choose an active vendor.',
    customerOnInvoices: '%s is on bills. Make it inactive instead.',
    dueBeforeDate: "Due date can't be before the bill date",
    // The first `%s` is the vendor's name, the second the bill no., the third the bill
    // that has it: "Bill 1003", or "a draft bill" while it has no number.
    duplicateRef: '%s already has bill no. %s (%s).',
    accountInactive: 'Account line %d: %s is inactive. Choose an active account.',
    accountNotExpense:
        'Account line %d: %s is not an expense account. Choose an expense or cost of goods account.',
    productInactive: 'Product line %d: %s is inactive. Choose an active product or service.',
    productNotPurchased:
        'Product line %d: %s is not purchased. Turn on “I purchase this” for it first.',
    accountAmountZero: 'Account line %d: Enter an amount other than 0.',

    // Client only.
    percentTarget: INVOICE_MESSAGES.percentTarget,
    needItemLine: 'Add at least one account or product line',
    quantityNotPositive: INVOICE_MESSAGES.quantityNotPositive,
    quantityDecimals: INVOICE_MESSAGES.quantityDecimals,
    quantityTooLarge: INVOICE_MESSAGES.quantityTooLarge,
    rateMalformed: INVOICE_MESSAGES.rateMalformed,
    rateTooLarge: INVOICE_MESSAGES.rateTooLarge,
    // books_bill_lines.rate has min 0 (2100000013_create_books_bills.js).
    rateNegative: 'Enter a rate of 0 or more',
    percentRange: INVOICE_MESSAGES.percentRange,
    percentDecimals: INVOICE_MESSAGES.percentDecimals,
    noAccess: 'You need bookkeeper access to create bills',
    notFound: 'This bill does not exist',
    cannotEdit: 'This bill cannot be edited',
    loadFailed: 'Books could not load this bill.',
    customerLoadFailed: 'Books could not load this vendor.',
    bundleEmpty: INVOICE_MESSAGES.bundleEmpty,
    bundleLoadFailed: INVOICE_MESSAGES.bundleLoadFailed,
    pdfUnsaved: INVOICE_MESSAGES.pdfUnsaved,
    pdfUnsavedSave: INVOICE_MESSAGES.pdfUnsavedSave,
    pdfStale: INVOICE_MESSAGES.pdfStale,
    voidBody: INVOICE_MESSAGES.voidBody,
    refTooLong: "Vendor's bill no. can be at most 40 characters",
    // The delete-draft confirm's title and body (the draft dialog's own action and ids).
    deleteTitle: 'Delete this draft bill?',
    deleteBody: "This can't be undone.",
} as const satisfies DocumentMessages & {
    totalZero: string
    dueBeforeDate: string
    duplicateRef: string
    accountInactive: string
    accountNotExpense: string
    productInactive: string
    productNotPurchased: string
    accountAmountZero: string
    voidBody: string
    refTooLong: string
}

// The estimate's texts. The first group is shown by the client and refused by the server
// with the same words (server/estimates.go); tests/document-messages.test.ts fails when
// they drift. The line texts are the invoice's. An estimate never posts, so it has no
// void text.
export const ESTIMATE_MESSAGES = {
    percentTarget: INVOICE_MESSAGES.percentTarget,
    totalNegative: 'An estimate total cannot be below zero.',
    totalTooLarge: 'The estimate total is more than Books can store.',
    tooManyLines: 'An estimate can have at most 250 lines.',
    customerInactive: '%s is inactive. Choose an active customer.',
    customerOnInvoices: '%s is on estimates. Make it inactive instead.',
    expirationBeforeDate: "Expiration date can't be before the estimate date",
    acceptedDateRequired: 'Enter the accepted date',
    // The delete refusals of an estimate an invoice names (server/estimates.go). The
    // first `%s` is the estimate's number, the second the invoice's.
    hasInvoice: 'Estimate %s has invoice %s. Set it to Rejected instead.',
    hasDraftInvoice: 'Estimate %s has a draft invoice. Set it to Rejected instead.',
    // The conversion refusals of the invoice made from an estimate
    // (server/estimate_conversion.go). `estimateCustomer` and `estimateCustomerInactive`
    // are refused under `customer`; the latter's `%s` is the customer's name.
    alreadyOnInvoice: 'Estimate %s is already on invoice %s.',
    alreadyOnDraftInvoice: 'Estimate %s is already on a draft invoice.',
    estimateCustomer: "An invoice from an estimate bills the estimate's customer.",
    estimateCustomerInactive: '%s is inactive. Make the customer active to convert this estimate.',

    // Client only.
    needItemLine: INVOICE_MESSAGES.needItemLine,
    quantityNotPositive: INVOICE_MESSAGES.quantityNotPositive,
    quantityDecimals: INVOICE_MESSAGES.quantityDecimals,
    quantityTooLarge: INVOICE_MESSAGES.quantityTooLarge,
    rateMalformed: INVOICE_MESSAGES.rateMalformed,
    rateTooLarge: INVOICE_MESSAGES.rateTooLarge,
    percentRange: INVOICE_MESSAGES.percentRange,
    percentDecimals: INVOICE_MESSAGES.percentDecimals,
    noAccess: 'You need bookkeeper access to create estimates',
    notFound: 'This estimate does not exist',
    cannotEdit: 'This estimate cannot be edited',
    loadFailed: 'Books could not load this estimate.',
    customerLoadFailed: INVOICE_MESSAGES.customerLoadFailed,
    bundleEmpty: INVOICE_MESSAGES.bundleEmpty,
    bundleLoadFailed: INVOICE_MESSAGES.bundleLoadFailed,
    pdfUnsaved: 'Save the estimate to see its PDF',
    // An estimate has no draft: the notice offers its bar's Save.
    pdfUnsavedSave: 'Save',
    pdfStale: INVOICE_MESSAGES.pdfStale,
    acceptedByTooLong: 'Accepted by can be at most 200 characters',
    cannotConvert: 'This estimate cannot be converted to an invoice',
    deleteTitle: 'Delete estimate %s?',
    deleteBody: "This can't be undone.",
    deleteAction: 'Delete estimate',
} as const satisfies DocumentMessages & {
    expirationBeforeDate: string
    acceptedDateRequired: string
    acceptedByTooLong: string
    hasInvoice: string
    hasDraftInvoice: string
    alreadyOnInvoice: string
    alreadyOnDraftInvoice: string
    estimateCustomer: string
    estimateCustomerInactive: string
    cannotConvert: string
    deleteTitle: string
    deleteBody: string
    deleteAction: string
}
