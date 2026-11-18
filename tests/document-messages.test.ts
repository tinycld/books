import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { documentTotals } from '../tinycld/books/lib/document-lines'
import {
    bigFigureText,
    customerInactiveText,
    documentRefusalTarget,
    INVOICE_MESSAGES,
    labelledLineRefusal,
    SALES_RECEIPT_MESSAGES,
    tableLineRefusal,
} from '../tinycld/books/lib/document-messages'
import {
    BILL_MESSAGES,
    CREDIT_MEMO_MESSAGES,
    ESTIMATE_MESSAGES,
    EXPENSE_MESSAGES,
    VENDOR_CREDIT_MESSAGES,
} from '../tinycld/books/lib/document-texts'
import { INVOICE_REFUSALS } from '../tinycld/books/lib/invoice-form-fixture'
import { maxLineAmount, maxStoredAmount } from '../tinycld/books/lib/money-text'
import {
    BILL_KIND,
    CREDIT_MEMO_KIND,
    ESTIMATE_KIND,
    EXPENSE_KIND,
    INVOICE_KIND,
    SALES_RECEIPT_KIND,
    VENDOR_CREDIT_KIND,
} from '../tinycld/books/lib/sales-document-kinds'

const invoiceRefusalTarget = (message: string) => documentRefusalTarget(message, INVOICE_KIND)

// The texts the client and the server both show (plan, Decisions: Messages). `%s` is
// compared as written: the client fills it with customerInactiveText, the server with
// refuseNamed.
const SHARED = {
    dueBeforeDate: 'The due date cannot be before the invoice date',
    percentTarget: 'A percent line applies to the item or subtotal right above it',
    totalNegative: 'An invoice total cannot be below zero. Use a credit memo.',
    totalTooLarge: 'The invoice total is more than Books can store.',
    tooManyLines: 'An invoice can have at most 250 lines.',
    customerInactive: '%s is inactive. Choose an active customer.',
    customerOnInvoices: '%s is on invoices. Make it inactive instead.',
} as const

const CLIENT_ONLY = {
    needItemLine: 'Add at least one product or service line',
    quantityNotPositive: 'Enter a quantity more than 0',
    quantityDecimals: 'A quantity can have at most 2 decimals',
    rateMalformed: 'Enter a rate like 1,234.50',
    rateTooLarge: 'The rate is too large',
    percentRange: 'Enter a percent from -100 to 1000',
    percentDecimals: 'A percent can have at most 4 decimals',
    quantityTooLarge: 'A quantity can be at most 1,000,000',
    noAccess: 'You need bookkeeper access to create invoices',
    notFound: 'This invoice does not exist',
    cannotEdit: 'This invoice cannot be edited',
    loadFailed: 'Books could not load this invoice.',
    customerLoadFailed: 'Books could not load this customer.',
    pdfUnsaved: 'Save a draft to see the PDF',
    pdfStale: 'Shows the last saved version',
    voidBody: 'A reversing entry is posted in the original period. The number is kept.',
} as const

// Read inside the test, so a missing file fails the drift test only.
function serverSource() {
    return readFileSync(join(__dirname, '..', 'server', 'invoices.go'), 'utf8')
}

describe('INVOICE_MESSAGES', () => {
    it('holds every shared text under its key', () => {
        expect(INVOICE_MESSAGES).toMatchObject(SHARED)
    })

    it('holds every client text under its key', () => {
        expect(INVOICE_MESSAGES).toMatchObject(CLIENT_ONLY)
    })

    it('customerInactiveText names the customer', () => {
        expect(customerInactiveText('Old Mill Bakery')).toBe(
            'Old Mill Bakery is inactive. Choose an active customer.'
        )
    })
})

describe('server/invoices.go', () => {
    for (const [key, text] of Object.entries(SHARED)) {
        it(`holds the ${key} text verbatim as a Go string`, () => {
            expect(serverSource()).toContain(`"${text}"`)
        })
    }
})

// The sales receipt's texts the client and the server both show (plan, Decisions:
// Messages).
const RECEIPT_SHARED = {
    totalNegative: 'A sales receipt total cannot be below zero. Use a refund receipt.',
    totalTooLarge: 'The sales receipt total is more than Books can store.',
    tooManyLines: 'A sales receipt can have at most 250 lines.',
    customerInactive: '%s is inactive. Choose an active customer.',
    customerOnInvoices: '%s is on sales receipts. Make it inactive instead.',
    depositInvalid: 'Choose an active bank or Undeposited funds account',
    depositNone: 'Add a bank account or an Undeposited funds account to the chart of accounts',
} as const

const RECEIPT_CLIENT_ONLY = {
    noAccess: 'You need bookkeeper access to create sales receipts',
    notFound: 'This sales receipt does not exist',
    cannotEdit: 'This sales receipt cannot be edited',
    loadFailed: 'Books could not load this sales receipt.',
    depositLoadFailed: 'Books could not load the deposit accounts.',
    depositRequired: 'Choose where the money was deposited',
    referenceTooLong: 'Reference no. can be at most 40 characters',
    needItemLine: 'Add at least one product or service line',
    pdfUnsaved: 'Save a draft to see the PDF',
    pdfStale: 'Shows the last saved version',
    voidBody: 'A reversing entry is posted in the original period. The number is kept.',
} as const

function receiptServerSource() {
    return readFileSync(join(__dirname, '..', 'server', 'sales_receipts.go'), 'utf8')
}

describe('SALES_RECEIPT_MESSAGES', () => {
    it('holds every shared text under its key', () => {
        expect(SALES_RECEIPT_MESSAGES).toMatchObject(RECEIPT_SHARED)
    })

    it('holds every client text under its key', () => {
        expect(SALES_RECEIPT_MESSAGES).toMatchObject(RECEIPT_CLIENT_ONLY)
    })

    it('is the sales receipt kind’s texts', () => {
        expect(SALES_RECEIPT_KIND.messages).toBe(SALES_RECEIPT_MESSAGES)
    })
})

describe('server/sales_receipts.go', () => {
    for (const [key, text] of Object.entries(RECEIPT_SHARED)) {
        it(`holds the receipt's ${key} text verbatim as a Go string`, () => {
            expect(receiptServerSource()).toContain(`"${text}"`)
        })
    }
})

// The credit memo's texts the client and the server both show (checkpoint 3 Decisions:
// Messages). The shared customer text's Go constant is server/invoices.go's.
const CREDIT_MEMO_SHARED = {
    totalNegative: 'A credit memo total cannot be below zero. Use an invoice.',
    totalTooLarge: 'The credit memo total is more than Books can store.',
    tooManyLines: 'A credit memo can have at most 250 lines.',
    zeroTotal:
        'A credit memo with a total of zero cannot be posted. Add an amount or keep it as a draft.',
} as const

const CREDIT_MEMO_CLIENT_ONLY = {
    noAccess: 'You need bookkeeper access to create credit memos',
    notFound: 'This credit memo does not exist',
    cannotEdit: 'This credit memo cannot be edited',
    loadFailed: 'Books could not load this credit memo.',
    cannotCredit: 'This invoice cannot be credited',
    pdfUnsaved: 'Save a draft to see the PDF',
    pdfStale: 'Shows the last saved version',
    needItemLine: 'Add at least one product or service line',
    voidBody: 'A reversing entry is posted in the original period. The number is kept.',
} as const

function creditMemoServerSource() {
    return readFileSync(join(__dirname, '..', 'server', 'credit_memos.go'), 'utf8')
}

describe('CREDIT_MEMO_MESSAGES', () => {
    it('holds every shared text under its key', () => {
        expect(CREDIT_MEMO_MESSAGES).toMatchObject(CREDIT_MEMO_SHARED)
        expect(CREDIT_MEMO_MESSAGES.customerInactive).toBe(
            '%s is inactive. Choose an active customer.'
        )
    })

    it('holds every client text under its key', () => {
        expect(CREDIT_MEMO_MESSAGES).toMatchObject(CREDIT_MEMO_CLIENT_ONLY)
        expect(CREDIT_MEMO_MESSAGES.voidBody).toBe(INVOICE_MESSAGES.voidBody)
    })

    it('is the credit memo kind’s texts', () => {
        expect(CREDIT_MEMO_KIND.messages).toBe(CREDIT_MEMO_MESSAGES)
    })
})

describe('server/credit_memos.go', () => {
    for (const [key, text] of Object.entries(CREDIT_MEMO_SHARED)) {
        it(`holds the credit memo's ${key} text verbatim as a Go string`, () => {
            expect(creditMemoServerSource()).toContain(`"${text}"`)
        })
    }

    it('holds the customer-on-credit-memos text, and the client shows the same words', () => {
        expect(creditMemoServerSource()).toContain(
            '"%s is on credit memos. Make it inactive instead."'
        )
        expect(CREDIT_MEMO_MESSAGES.customerOnInvoices).toBe(
            '%s is on credit memos. Make it inactive instead.'
        )
    })

    it('shares the inactive customer text with server/invoices.go', () => {
        expect(serverSource()).toContain(`"${CREDIT_MEMO_MESSAGES.customerInactive}"`)
    })
})

describe('documentRefusalTarget with the credit memo kind', () => {
    const creditMemoTarget = (message: string) => documentRefusalTarget(message, CREDIT_MEMO_KIND)

    it('puts the inactive customer under Customer', () => {
        expect(creditMemoTarget('Old Mill Bakery is inactive. Choose an active customer.')).toBe(
            'customer'
        )
    })

    it('puts the shared day texts under the date', () => {
        expect(creditMemoTarget('Enter a date that exists, in the form YYYY-MM-DD.')).toBe('date')
        expect(creditMemoTarget('Enter a date in 1900 or later.')).toBe('date')
    })

    it('puts the shared tax-rate texts under Tax', () => {
        expect(creditMemoTarget('Tax rate Old is inactive. Choose an active rate.')).toBe(
            'tax_rate'
        )
        expect(creditMemoTarget('The tax rate is inactive. Choose an active rate.')).toBe(
            'tax_rate'
        )
    })

    it('puts the close-date text at the root', () => {
        expect(
            creditMemoTarget(
                'The books are closed through 2026-06-30. Ask a Books admin for a close-date override to post on 2026-06-15.'
            )
        ).toBe('root')
    })

    // Spec §3.6: the server's link refusal shows under the link row, not in the summary.
    it('puts the invoice link refusal under the link row', () => {
        expect(creditMemoTarget('Choose a posted invoice of this customer.')).toBe('invoice')
    })
})

// The link texts of checkpoint 4 (spec §3.6, §3.10, Q18), as the server writes them.
const CREDIT_MEMO_LINK_TEXTS = {
    invoice: 'Choose a posted invoice of this customer.',
    correctionCreditMemos:
        'Credit memos are made from this invoice, so its customer cannot change.',
} as const

describe('the credit memo link texts', () => {
    it('holds the link refusal as the Go constant msgCreditMemoInvoice', () => {
        expect(creditMemoServerSource()).toMatch(
            new RegExp(`msgCreditMemoInvoice\\s*=\\s*"${CREDIT_MEMO_LINK_TEXTS.invoice}"`)
        )
    })

    it('holds the invoice correction text as the Go constant msgInvoiceCorrectionCreditMemos', () => {
        expect(serverSource()).toMatch(
            new RegExp(
                `msgInvoiceCorrectionCreditMemos\\s*=\\s*"${CREDIT_MEMO_LINK_TEXTS.correctionCreditMemos}"`
            )
        )
    })

    it('the invoice shows the correction text under Customer', () => {
        expect(INVOICE_MESSAGES.correctionCreditMemos).toBe(
            CREDIT_MEMO_LINK_TEXTS.correctionCreditMemos
        )
        expect(
            invoiceRefusalTarget(
                'Credit memos are made from this invoice, so its customer cannot change.'
            )
        ).toBe('customer')
    })
})

// The estimate's texts the client and the server both show, whose Go constants live in
// server/estimates.go (plan, Decisions: Messages). The conversion texts are checked
// against server/estimate_conversion.go once that file exists (checkpoint 3).
const ESTIMATE_SHARED = {
    totalNegative: 'An estimate total cannot be below zero.',
    totalTooLarge: 'The estimate total is more than Books can store.',
    tooManyLines: 'An estimate can have at most 250 lines.',
    customerOnInvoices: '%s is on estimates. Make it inactive instead.',
    expirationBeforeDate: "Expiration date can't be before the estimate date",
    acceptedDateRequired: 'Enter the accepted date',
} as const

const ESTIMATE_CLIENT_ONLY = {
    customerInactive: '%s is inactive. Choose an active customer.',
    noAccess: 'You need bookkeeper access to create estimates',
    notFound: 'This estimate does not exist',
    cannotEdit: 'This estimate cannot be edited',
    loadFailed: 'Books could not load this estimate.',
    pdfUnsaved: 'Save the estimate to see its PDF',
} as const

function estimateServerSource() {
    return readFileSync(join(__dirname, '..', 'server', 'estimates.go'), 'utf8')
}

describe('ESTIMATE_MESSAGES', () => {
    it('holds every shared text under its key', () => {
        expect(ESTIMATE_MESSAGES).toMatchObject(ESTIMATE_SHARED)
    })

    it('holds the client texts under their keys', () => {
        expect(ESTIMATE_MESSAGES).toMatchObject(ESTIMATE_CLIENT_ONLY)
    })

    it('is the estimate kind’s texts', () => {
        expect(ESTIMATE_MESSAGES).toBeDefined()
        expect(ESTIMATE_KIND.messages).toBe(ESTIMATE_MESSAGES)
    })
})

describe('server/estimates.go', () => {
    for (const [key, text] of Object.entries(ESTIMATE_SHARED)) {
        it(`holds the estimate's ${key} text verbatim as a Go string, as ESTIMATE_MESSAGES does`, () => {
            expect(estimateServerSource()).toContain(`"${text}"`)
            expect(ESTIMATE_MESSAGES[key as keyof typeof ESTIMATE_SHARED]).toBe(text)
        })
    }
})

// The conversion texts (spec §3.7; plan, Decisions: Messages): the client and the server
// show them with the same words, and their Go constants live in
// server/estimate_conversion.go. `%s` is compared as written.
const CONVERSION_SHARED = {
    alreadyOnInvoice: 'Estimate %s is already on invoice %s.',
    alreadyOnDraftInvoice: 'Estimate %s is already on a draft invoice.',
    estimateCustomer: "An invoice from an estimate bills the estimate's customer.",
    estimateCustomerInactive: '%s is inactive. Make the customer active to convert this estimate.',
} as const

// The delete refusals of an estimate an invoice names (spec §3.6). The estimate's delete
// hook is in server/estimates.go; the constant may sit in either estimate file.
const ESTIMATE_DELETE_SHARED = {
    hasInvoice: 'Estimate %s has invoice %s. Set it to Rejected instead.',
    hasDraftInvoice: 'Estimate %s has a draft invoice. Set it to Rejected instead.',
} as const

function conversionServerSource() {
    return readFileSync(join(__dirname, '..', 'server', 'estimate_conversion.go'), 'utf8')
}

describe('server/estimate_conversion.go', () => {
    for (const [key, text] of Object.entries(CONVERSION_SHARED)) {
        it(`holds the conversion's ${key} text verbatim as a Go string, as ESTIMATE_MESSAGES does`, () => {
            expect(conversionServerSource()).toContain(`"${text}"`)
            expect(ESTIMATE_MESSAGES).toHaveProperty(key, text)
        })
    }

    for (const [key, text] of Object.entries(ESTIMATE_DELETE_SHARED)) {
        it(`holds the estimate delete's ${key} text verbatim as a Go string, as ESTIMATE_MESSAGES does`, () => {
            const goSources = `${estimateServerSource()}\n${conversionServerSource()}`
            expect(goSources).toContain(`"${text}"`)
            expect(ESTIMATE_MESSAGES).toHaveProperty(key, text)
        })
    }

    it('holds the estimate delete confirm texts', () => {
        expect(ESTIMATE_MESSAGES.deleteTitle.replace('%s', '1001')).toBe('Delete estimate 1001?')
        expect(ESTIMATE_MESSAGES.deleteBody).toBe("This can't be undone.")
        expect(ESTIMATE_MESSAGES.deleteAction).toBe('Delete estimate')
    })

    it('holds the client-only cannot-convert text of the invoice screen', () => {
        expect(ESTIMATE_MESSAGES).toHaveProperty(
            'cannotConvert',
            'This estimate cannot be converted to an invoice'
        )
        expect(ESTIMATE_KIND.messages).toHaveProperty(
            'cannotConvert',
            'This estimate cannot be converted to an invoice'
        )
    })
})

// The bill's texts the client and the server both show (plan, Decisions: Messages), whose
// Go constants live in server/bills.go, and the line texts it shares with the expense in
// server/purchase_lines.go. `%s` and `%d` are compared as written.
const BILL_SHARED = [
    'A bill total cannot be below zero. Use a vendor credit.',
    'A bill total must be more than zero to post.',
    'The bill total is more than Books can store.',
    'A bill holds at most 250 lines.',
    '%s is inactive. Choose an active vendor.',
    "Due date can't be before the bill date.",
    '%s already has bill no. %s (%s).',
    'Account line %d: %s is inactive. Choose an active account.',
    'Account line %d: %s is not an expense account. Choose an expense or cost of goods account.',
    'Product line %d: %s is inactive. Choose an active product or service.',
    'Product line %d: %s is not purchased. Turn on “I purchase this” for it first.',
    'Account line %d: Enter an amount other than 0.',
] as const

// The client shows a field rule without PocketBase's final period.
const BILL_CLIENT_ONLY = {
    noAccess: 'You need bookkeeper access to create bills',
    notFound: 'This bill does not exist',
    cannotEdit: 'This bill cannot be edited',
    loadFailed: 'Books could not load this bill.',
    voidBody: 'A reversing entry is posted in the original period. The number is kept.',
} as const

function billServerSource() {
    const server = join(__dirname, '..', 'server')
    return ['bills.go', 'purchase_lines.go']
        .map(file => readFileSync(join(server, file), 'utf8'))
        .join('\n')
}

// A client text and its server twin differ only by the final period PocketBase adds.
function withoutFinalPeriod(text: string) {
    return text.replace(/\.$/, '')
}

describe('BILL_MESSAGES', () => {
    it('is the bill kind’s texts', () => {
        expect(BILL_MESSAGES).toBeDefined()
        expect(BILL_KIND.messages).toBe(BILL_MESSAGES)
    })

    it('holds the client texts under their keys', () => {
        expect(BILL_MESSAGES).toMatchObject(BILL_CLIENT_ONLY)
    })

    // Every BILL_MESSAGES text that names a server refusal is one of the shared texts, so a
    // text changed on one side only fails here.
    it('holds every shared text the server refuses with', () => {
        const client = Object.values(BILL_MESSAGES).map(text => withoutFinalPeriod(String(text)))
        for (const text of BILL_SHARED) expect(client, text).toContain(withoutFinalPeriod(text))
    })
})

describe('server/bills.go', () => {
    for (const text of BILL_SHARED) {
        it(`holds "${text}" verbatim as a Go string`, () => {
            const source = billServerSource()
            const hasText =
                source.includes(`"${text}"`) || source.includes(`"${withoutFinalPeriod(text)}"`)
            expect(hasText, text).toBe(true)
        })
    }
})

// The expense's texts the client and the server both show (plan, Decisions: Messages),
// whose Go constants live in server/expenses.go, the inactive vendor text it shares with
// the bill in server/bills.go, and the line texts it shares with the bill in
// server/purchase_lines.go. `%s` and `%d` are compared as written.
const EXPENSE_SHARED = [
    'An expense total cannot be below zero.',
    'An expense total must be more than zero to post.',
    'The expense total is more than Books can store.',
    'An expense holds at most 250 lines.',
    '%s is inactive. Choose an active vendor.',
    'Choose a bank or credit card account.',
    '%s is inactive. Choose an active account.',
    'Check no. %s from %s is already on %s.',
    'Account line %d: %s is inactive. Choose an active account.',
    'Account line %d: %s is not an expense account. Choose an expense or cost of goods account.',
    'Product line %d: %s is inactive. Choose an active product or service.',
    'Product line %d: %s is not purchased. Turn on “I purchase this” for it first.',
    'Account line %d: Enter an amount other than 0.',
] as const

const EXPENSE_CLIENT_ONLY = {
    noAccess: 'You need bookkeeper access to create expenses',
    notFound: 'This expense does not exist',
    cannotEdit: 'This expense cannot be edited',
    loadFailed: 'Books could not load this expense.',
    voidBody: 'A reversing entry is posted in the original period. The number is kept.',
} as const

function expenseServerSource() {
    const server = join(__dirname, '..', 'server')
    return ['expenses.go', 'bills.go', 'purchase_lines.go']
        .map(file => readFileSync(join(server, file), 'utf8'))
        .join('\n')
}

describe('EXPENSE_MESSAGES', () => {
    it('is the expense kind’s texts', () => {
        expect(EXPENSE_MESSAGES).toBeDefined()
        expect(EXPENSE_KIND.messages).toBe(EXPENSE_MESSAGES)
    })

    it('holds the client texts under their keys', () => {
        expect(EXPENSE_MESSAGES).toMatchObject(EXPENSE_CLIENT_ONLY)
        expect(Object.values(EXPENSE_MESSAGES)).toContain('Ref no. can be at most 40 characters')
    })

    // Every EXPENSE_MESSAGES text that names a server refusal is one of the shared texts,
    // so a text changed on one side only fails here.
    it('holds every shared text the server refuses with', () => {
        const client = Object.values(EXPENSE_MESSAGES).map(text => withoutFinalPeriod(String(text)))
        for (const text of EXPENSE_SHARED) expect(client, text).toContain(withoutFinalPeriod(text))
    })
})

describe('server/expenses.go', () => {
    for (const text of EXPENSE_SHARED) {
        it(`holds the expense's "${text}" verbatim as a Go string`, () => {
            const source = expenseServerSource()
            const hasText =
                source.includes(`"${text}"`) || source.includes(`"${withoutFinalPeriod(text)}"`)
            expect(hasText, text).toBe(true)
        })
    }
})

// The expense's refusals (spec §3.6): Vendor, Paid from and Ref no. under their fields,
// line texts under their rows, the totals in the summary. Server texts carry PocketBase's
// final period.
describe('documentRefusalTarget with the expense kind', () => {
    const expenseTarget = (message: string) => documentRefusalTarget(message, EXPENSE_KIND)

    it('sends an inactive vendor refusal to Vendor', () => {
        expect(expenseTarget('Summit IT Services is inactive. Choose an active vendor.')).toBe(
            'vendor'
        )
    })

    it('sends the Paid from refusals to Paid from', () => {
        expect(expenseTarget('Choose a bank or credit card account.')).toBe('paid_from')
        expect(expenseTarget('1000 Business Checking is inactive. Choose an active account.')).toBe(
            'paid_from'
        )
    })

    it('sends the duplicate check number refusal to Ref no.', () => {
        expect(
            expenseTarget('Check no. 1042 from 1000 Business Checking is already on Expense 1004.')
        ).toBe('reference_no')
        expect(
            expenseTarget(
                'Check no. 1042 from 1000 Business Checking is already on a draft expense.'
            )
        ).toBe('reference_no')
    })

    it('sends a bare Payment method refusal to Payment method', () => {
        expect(expenseTarget('Payment method is required.')).toBe('payment_method')
        expect(expenseTarget('Payment method must be one of the listed methods.')).toBe(
            'payment_method'
        )
    })

    // server/sales_documents.go msgDocumentDay and msgDocumentDayTooEarly: an expense has
    // no due date, so a bare date text is its Payment date's.
    it('sends a bare date refusal to Payment date', () => {
        expect(expenseTarget('Enter a date that exists, in the form YYYY-MM-DD.')).toBe('date')
        expect(expenseTarget('Enter a date in 1900 or later.')).toBe('date')
    })

    it('sends an account line or product line refusal to its row', () => {
        expect(
            tableLineRefusal(
                'Account line 2: Rent is inactive. Choose an active account.',
                EXPENSE_KIND.lineTables
            )
        ).toEqual({ table: 'account_lines', line: 1 })
        expect(
            tableLineRefusal(
                'Product line 1: Cat6 patch cable, 10 ft is inactive. Choose an active product or service.',
                EXPENSE_KIND.lineTables
            )
        ).toEqual({ table: 'item_lines', line: 0 })
    })

    it('sends the total texts to the summary with no line prefix', () => {
        for (const text of [
            'An expense total cannot be below zero.',
            'The expense total is more than Books can store.',
            'An expense total must be more than zero to post.',
        ]) {
            expect(labelledLineRefusal('Account line 1', text), text).toBe(text)
            expect(expenseTarget(labelledLineRefusal('Account line 1', text)), text).toBe('root')
        }
    })

    it("keeps the bill's routing", () => {
        const billTarget = (message: string) => documentRefusalTarget(message, BILL_KIND)
        expect(billTarget('Summit IT Services is inactive. Choose an active vendor.')).toBe(
            'vendor'
        )
        expect(billTarget('Summit IT Services already has bill no. INV-9 (Bill 1003).')).toBe(
            'ref_no'
        )
        expect(billTarget("Due date can't be before the bill date.")).toBe('due_date')
        expect(billTarget('Choose a bank or credit card account.')).toBe('root')
        expect(
            billTarget('Check no. 1042 from 1000 Business Checking is already on Expense 1004.')
        ).toBe('root')
        for (const text of [BILL_MESSAGES.totalNegative, BILL_MESSAGES.totalTooLarge]) {
            expect(labelledLineRefusal('Account line 1', text)).toBe(text)
            expect(billTarget(text)).toBe('root')
        }
    })
})

// The vendor credit's texts the client and the server both show (plan, Decisions:
// Messages), whose Go constants live in server/vendor_credits.go, the inactive vendor
// text it shares with the bill in server/bills.go, and the line texts it shares with the
// bill in server/purchase_lines.go. `%s` and `%d` are compared as written.
const VENDOR_CREDIT_SHARED = [
    'A vendor credit total cannot be below zero. Use a bill.',
    'A vendor credit total must be more than zero to post.',
    'The vendor credit total is more than Books can store.',
    'A vendor credit holds at most 250 lines.',
    '%s is inactive. Choose an active vendor.',
    '%s already has credit no. %s (%s).',
    'Account line %d: %s is inactive. Choose an active account.',
    'Account line %d: %s is not an expense account. Choose an expense or cost of goods account.',
    'Product line %d: %s is inactive. Choose an active product or service.',
    'Product line %d: %s is not purchased. Turn on “I purchase this” for it first.',
    'Account line %d: Enter an amount other than 0.',
] as const

const VENDOR_CREDIT_CLIENT_ONLY = {
    noAccess: 'You need bookkeeper access to create vendor credits',
    notFound: 'This vendor credit does not exist',
    cannotEdit: 'This vendor credit cannot be edited',
    loadFailed: 'Books could not load this vendor credit.',
    voidBody: 'A reversing entry is posted in the original period. The number is kept.',
} as const

function vendorCreditServerSource() {
    const server = join(__dirname, '..', 'server')
    return ['vendor_credits.go', 'bills.go', 'purchase_lines.go']
        .map(file => readFileSync(join(server, file), 'utf8'))
        .join('\n')
}

describe('VENDOR_CREDIT_MESSAGES', () => {
    it('is the vendor credit kind’s texts', () => {
        expect(VENDOR_CREDIT_MESSAGES).toBeDefined()
        expect(VENDOR_CREDIT_KIND.messages).toBe(VENDOR_CREDIT_MESSAGES)
    })

    it('holds the client texts under their keys', () => {
        expect(VENDOR_CREDIT_MESSAGES).toMatchObject(VENDOR_CREDIT_CLIENT_ONLY)
        expect(Object.values(VENDOR_CREDIT_MESSAGES)).toContain(
            "Vendor's credit no. can be at most 40 characters"
        )
        // The delete-draft confirm: "Delete this draft vendor credit? This can't be undone."
        expect(VENDOR_CREDIT_MESSAGES).toMatchObject({
            deleteTitle: 'Delete this draft vendor credit?',
            deleteBody: "This can't be undone.",
        })
    })

    // Every VENDOR_CREDIT_MESSAGES text that names a server refusal is one of the shared
    // texts, so a text changed on one side only fails here.
    it('holds every shared text the server refuses with', () => {
        const client = Object.values(VENDOR_CREDIT_MESSAGES).map(text =>
            withoutFinalPeriod(String(text))
        )
        for (const text of VENDOR_CREDIT_SHARED) {
            expect(client, text).toContain(withoutFinalPeriod(text))
        }
    })
})

describe('server/vendor_credits.go', () => {
    for (const text of VENDOR_CREDIT_SHARED) {
        it(`holds the vendor credit's "${text}" verbatim as a Go string`, () => {
            const source = vendorCreditServerSource()
            const hasText =
                source.includes(`"${text}"`) || source.includes(`"${withoutFinalPeriod(text)}"`)
            expect(hasText, text).toBe(true)
        })
    }
})

// The vendor credit's refusals (spec §3.6): Vendor and Vendor's credit no. under their
// fields, line texts under their rows, the totals in the summary. Server texts carry
// PocketBase's final period.
describe('documentRefusalTarget with the vendor credit kind', () => {
    const creditTarget = (message: string) => documentRefusalTarget(message, VENDOR_CREDIT_KIND)

    it('sends an inactive vendor refusal to Vendor', () => {
        expect(creditTarget('Pacific Power is inactive. Choose an active vendor.')).toBe('vendor')
    })

    it("sends the duplicate credit no. refusal to Vendor's credit no.", () => {
        expect(
            creditTarget('Pacific Power already has credit no. CM-8841 (Vendor credit 1001).')
        ).toBe('ref_no')
        expect(
            creditTarget('Pacific Power already has credit no. CM-8841 (a draft vendor credit).')
        ).toBe('ref_no')
    })

    it('sends an account line or product line refusal to its row', () => {
        expect(
            tableLineRefusal(
                'Account line 2: Rent is inactive. Choose an active account.',
                VENDOR_CREDIT_KIND.lineTables
            )
        ).toEqual({ table: 'account_lines', line: 1 })
        expect(
            tableLineRefusal(
                'Product line 1: Cat6 patch cable, 10 ft is inactive. Choose an active product or service.',
                VENDOR_CREDIT_KIND.lineTables
            )
        ).toEqual({ table: 'item_lines', line: 0 })
    })

    it('sends the total texts to the summary with no line prefix', () => {
        for (const text of [
            'A vendor credit total cannot be below zero. Use a bill.',
            'The vendor credit total is more than Books can store.',
            'A vendor credit total must be more than zero to post.',
        ]) {
            expect(labelledLineRefusal('Account line 1', text), text).toBe(text)
            expect(creditTarget(labelledLineRefusal('Account line 1', text)), text).toBe('root')
        }
    })
})

// Server refusals carry PocketBase's final period.
describe('invoiceRefusalTarget', () => {
    it('sends an inactive customer refusal to Customer', () => {
        expect(invoiceRefusalTarget('Harborview is inactive. Choose an active customer.')).toBe(
            'customer'
        )
    })

    it('sends the due date refusal to Due date', () => {
        expect(invoiceRefusalTarget('The due date cannot be before the invoice date.')).toBe(
            'due_date'
        )
    })

    it('sends any text that starts with Tax to Tax', () => {
        expect(invoiceRefusalTarget('Tax rate Old is inactive. Choose an active rate.')).toBe(
            'tax_rate'
        )
        expect(invoiceRefusalTarget('Tax group Old combined is inactive.')).toBe('tax_rate')
    })

    it('sends a "Line n:" refusal to that line, zero-based', () => {
        expect(
            invoiceRefusalTarget(
                'Line 3: Wireless access point is inactive. Choose an active product or service.'
            )
        ).toEqual({ line: 2 })
        expect(invoiceRefusalTarget(`${INVOICE_REFUSALS.inactiveProduct}.`)).toEqual({ line: 1 })
        expect(invoiceRefusalTarget('Line 12: the amount is too large.')).toEqual({ line: 11 })
    })

    it('sends every other refusal to the form root', () => {
        expect(invoiceRefusalTarget(INVOICE_REFUSALS.closeDate)).toBe('root')
        expect(invoiceRefusalTarget(INVOICE_MESSAGES.totalTooLarge)).toBe('root')
        expect(
            invoiceRefusalTarget(
                'An invoice with a total of zero cannot be posted. Add an amount or keep it as a draft.'
            )
        ).toBe('root')
    })
})

describe('labelledLineRefusal', () => {
    it('puts the write’s label in front of a text with no line number', () => {
        expect(labelledLineRefusal('Line 2', 'An invoice can have at most 250 lines.')).toBe(
            'Line 2: An invoice can have at most 250 lines.'
        )
    })

    it('keeps the server’s own line number', () => {
        const text = `Line 3: ${INVOICE_MESSAGES.percentTarget}.`
        expect(labelledLineRefusal('Line 1', text)).toBe(text)
    })

    // The server checks a batch's totals one time and refuses on the batch's first line
    // write, which is not the line that made the total (server/sales_document_deferral.go).
    it.each([
        { messages: INVOICE_MESSAGES, kind: INVOICE_KIND },
        { messages: SALES_RECEIPT_MESSAGES, kind: SALES_RECEIPT_KIND },
        { messages: ESTIMATE_MESSAGES, kind: ESTIMATE_KIND },
    ])('gives a totals text of the $kind.key kind no line label', ({ messages, kind }) => {
        for (const text of [messages.totalNegative, messages.totalTooLarge]) {
            expect(labelledLineRefusal('Line 1', text)).toBe(text)
            expect(documentRefusalTarget(labelledLineRefusal('Line 1', text), kind)).toBe('root')
        }
    })

    it('leaves a text with no write label as it is', () => {
        expect(labelledLineRefusal(null, 'Any text.')).toBe('Any text.')
    })
})

describe('bigFigureText', () => {
    const item = (quantity: number, rate: number) => ({
        kind: 'item' as const,
        quantity,
        rate,
        percentPpm: 0,
        taxable: false,
    })

    it('is a dash while the totals are invalid', () => {
        expect(bigFigureText(null, 'USD')).toBe('—')
    })

    it('is Too large when a line is over the limit', () => {
        const totals = documentTotals([item(2, maxLineAmount)], null)
        expect(totals.isTooLarge).toBe(true)
        expect(bigFigureText(totals, 'USD')).toBe('Too large')
    })

    // Every line is under maxLineAmount, so documentTotals does not flag it; the total
    // past maxStoredAmount is still more than Books can store.
    it('is Too large when the total is over maxStoredAmount and no line is', () => {
        const totals = documentTotals([item(1, 1)], null)
        const over = { ...totals, subtotal: maxStoredAmount + 1, total: maxStoredAmount + 1 }
        expect(over.isTooLarge).toBe(false)
        expect(bigFigureText(over, 'USD')).toBe('Too large')
        const under = { ...over, total: -(maxStoredAmount + 1) }
        expect(bigFigureText(under, 'USD')).toBe('Too large')
    })

    it('is the total as money', () => {
        expect(bigFigureText(documentTotals([item(1, 24_356)], null), 'USD')).toBe('$243.56')
    })
})
