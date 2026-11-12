// The texts a sales document's shared layer shows, by kind (SalesDocumentKind.messages).
// Pure data with no imports: lib/sales-document-kinds.ts reads it, and the generator
// loads that module in Node through forms/hosts.ts.

// The deposit and reference texts belong to the sales receipt only, so an invoice has
// none of them.
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
    pdfStale: string
    voidBody: string
    depositInvalid?: string
    depositNone?: string
    depositLoadFailed?: string
    depositRequired?: string
    referenceTooLong?: string
}

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
    pdfStale: 'Shows the last saved version',
    voidBody: 'A reversing entry is posted in the original period. The number is kept.',
} as const satisfies DocumentMessages & { dueBeforeDate: string }
