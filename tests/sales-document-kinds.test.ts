import { describe, expect, it } from 'vitest'
import { documentTotals } from '../tinycld/books/lib/document-lines'
import { bigFigureText } from '../tinycld/books/lib/document-messages'
import {
    CREDIT_MEMO_MESSAGES,
    REFUND_RECEIPT_MESSAGES,
    VENDOR_CREDIT_MESSAGES,
} from '../tinycld/books/lib/document-texts'
import { maxLineAmount } from '../tinycld/books/lib/money-text'
import {
    BILL_KIND,
    CREDIT_MEMO_KIND,
    DOCUMENT_PARTIES,
    ESTIMATE_KIND,
    EXPENSE_KIND,
    INVOICE_KIND,
    MEMO_HINT,
    PURCHASE_LINE_TABLES,
    REFUND_RECEIPT_KIND,
    SALES_FEATURES,
    SALES_LINE_TABLES,
    SALES_RECEIPT_KIND,
    VENDOR_CREDIT_KIND,
} from '../tinycld/books/lib/sales-document-kinds'

// The layer per kind (spec §3.1; plan Decisions "TS names"): the party, the line tables
// and the features. The three sales kinds keep one `lines` table, the customer, and
// every feature.
describe('the sales kinds: party, line tables and features', () => {
    for (const kind of [INVOICE_KIND, SALES_RECEIPT_KIND, ESTIMATE_KIND]) {
        it(`${kind.key} has the customer, the one lines table and every feature`, () => {
            expect(kind.party).toBe('customer')
            expect(kind.lineTables).toBe(SALES_LINE_TABLES)
            expect(kind.lineTables).toEqual([
                { key: 'lines', rowLabel: 'Line', heading: null, subtotal: null },
            ])
            expect(kind.features).toEqual({
                tax: true,
                message: true,
                email: true,
                pdf: true,
                partyAddress: true,
                attachments: false,
            })
        })
    }
})

// Attachments (attachments spec §2): only the bill and the expense keep files.
describe('features.attachments', () => {
    for (const kind of [BILL_KIND, EXPENSE_KIND, VENDOR_CREDIT_KIND]) {
        it(`is on for ${kind.key}`, () => {
            expect(kind.features.attachments).toBe(true)
        })
    }

    for (const kind of [INVOICE_KIND, SALES_RECEIPT_KIND, ESTIMATE_KIND]) {
        it(`is off for ${kind.key}`, () => {
            expect(kind.features.attachments).toBe(false)
        })
    }
})

// The party address flag (spec §3.1): the four existing kinds keep their address; only a
// kind without it (the expense) drops the address and its links.
describe('features.partyAddress', () => {
    for (const kind of [INVOICE_KIND, SALES_RECEIPT_KIND, ESTIMATE_KIND, BILL_KIND]) {
        it(`is on for ${kind.key}`, () => {
            expect(kind.features.partyAddress).toBe(true)
        })
    }

    it('leaves the bill with no tax, message, email or PDF', () => {
        expect(BILL_KIND.features).toEqual({
            tax: false,
            message: false,
            email: false,
            pdf: false,
            partyAddress: true,
            attachments: true,
        })
    })
})

// The purchase line tables (spec §3.1, plan Decisions "Renames"): the bill's two tables
// under their purchase name, unchanged.
describe('PURCHASE_LINE_TABLES', () => {
    it('are the bill kind line tables', () => {
        expect(BILL_KIND.lineTables).toBe(PURCHASE_LINE_TABLES)
    })

    it('keep the account and product tables, their headings and subtotals', () => {
        expect(PURCHASE_LINE_TABLES).toEqual([
            {
                key: 'account_lines',
                rowLabel: 'Account line',
                heading: 'Account details',
                subtotal: { label: 'Account lines', testId: 'total-account-lines' },
            },
            {
                key: 'item_lines',
                rowLabel: 'Product line',
                heading: 'Product and service details',
                subtotal: { label: 'Products and services', testId: 'total-item-lines' },
            },
        ])
    })
})

describe('DOCUMENT_PARTIES', () => {
    // Vendor pages: "Edit vendor" opens the vendor's page on its Details tab.
    it("names the vendor's field, address, edit link, route and inactive text", () => {
        expect(DOCUMENT_PARTIES.vendor).toEqual({
            field: 'vendor',
            label: 'Vendor',
            addressField: 'mailing_address',
            addressLabel: 'Mailing address',
            editLabel: 'Edit vendor',
            routeBase: 'books/vendors',
            editParams: { tab: 'details' },
            inactiveText: '%s is inactive. Choose an active vendor.',
        })
    })

    // Customer pages: "Edit customer" opens the customer's page on its Details tab.
    it("keeps the invoice's words for the customer", () => {
        expect(DOCUMENT_PARTIES.customer).toEqual({
            field: 'customer',
            label: 'Customer',
            addressField: 'bill_to',
            addressLabel: 'Bill to',
            editLabel: 'Edit customer',
            routeBase: 'books/customers',
            editParams: { tab: 'details' },
            inactiveText: '%s is inactive. Choose an active customer.',
        })
    })
})

// The invoice kind of the shared sales document layer (plan Decisions "TS kind names").
describe('INVOICE_KIND', () => {
    it("names the invoice's help topic", () => {
        expect(INVOICE_KIND.helpTopic).toBe('books:invoices')
    })

    it('names a posted PDF by its number and a draft PDF as a draft', () => {
        expect(INVOICE_KIND.pdfStem('1001')).toBe('invoice-1001')
        expect(INVOICE_KIND.pdfStem('')).toBe('draft-invoice')
    })
})

// The sales receipt kind (plan Decisions "TS kind names", spec §3.2, §3.3).
describe('SALES_RECEIPT_KIND', () => {
    it('groups its keys under "Sales receipt" and opens its own help topic', () => {
        expect(SALES_RECEIPT_KIND.shortcutGroup).toBe('Sales receipt')
        expect(SALES_RECEIPT_KIND.helpTopic).toBe('books:sales-receipts')
    })

    it('shows Amount received as the big figure and the last totals row', () => {
        expect(SALES_RECEIPT_KIND.figure.label).toBe('Amount received')
        expect(SALES_RECEIPT_KIND.lastTotal?.label).toBe('Amount received')
    })

    it('names a posted PDF by its number and a draft PDF as a draft', () => {
        expect(SALES_RECEIPT_KIND.pdfStem('1004')).toBe('sales-receipt-1004')
        expect(SALES_RECEIPT_KIND.pdfStem('')).toBe('draft-sales-receipt')
    })

    it('makes the customer optional and splits the band at Payment method', () => {
        expect(SALES_RECEIPT_KIND.customerRequired).toBe(false)
        expect(SALES_RECEIPT_KIND.bandSplitAt).toBe('payment_method')
    })
})

// Each kind's lifecycle (spec §3.1): the invoice and the sales receipt post; the
// estimate is a quote.
describe('lifecycle', () => {
    it('is posting on the invoice and the sales receipt', () => {
        expect(INVOICE_KIND.lifecycle).toBe('posting')
        expect(SALES_RECEIPT_KIND.lifecycle).toBe('posting')
    })
})

// The estimate kind (plan Decisions "TS names", spec §3.2, §3.3, §3.4, §3.9).
describe('ESTIMATE_KIND', () => {
    it('is a quote that groups its keys under "Estimate" and opens its own help topic', () => {
        expect(ESTIMATE_KIND.lifecycle).toBe('quote')
        expect(ESTIMATE_KIND.shortcutGroup).toBe('Estimate')
        expect(ESTIMATE_KIND.helpTopic).toBe('books:estimates')
    })

    it('shows Total as the big figure and draws no last totals row', () => {
        expect(ESTIMATE_KIND.figure.label).toBe('Total')
        expect(ESTIMATE_KIND.lastTotal).toBeNull()
    })

    it('splits the band at Status', () => {
        expect(ESTIMATE_KIND.bandSplitAt).toBe('status')
    })

    it('names its PDF by its number', () => {
        expect(ESTIMATE_KIND.pdfStem('1001')).toBe('estimate-1001')
    })
})

// The expense kind (expense spec §3.1-§3.5; plan Decisions "TS names").
describe('EXPENSE_KIND', () => {
    it('has an optional vendor and the purchase line tables', () => {
        expect(EXPENSE_KIND.key).toBe('expense')
        expect(EXPENSE_KIND.party).toBe('vendor')
        expect(EXPENSE_KIND.customerRequired).toBe(false)
        expect(EXPENSE_KIND.lineTables).toBe(PURCHASE_LINE_TABLES)
    })

    it('has no tax, message, email, PDF or party address', () => {
        expect(EXPENSE_KIND.features).toEqual({
            tax: false,
            message: false,
            email: false,
            pdf: false,
            partyAddress: false,
            attachments: true,
        })
    })

    it('shows Amount paid as the big figure and draws no last totals row', () => {
        expect(EXPENSE_KIND.figure).toEqual({ label: 'Amount paid', testId: 'amount-paid' })
        expect(EXPENSE_KIND.lastTotal).toBeNull()
    })

    it('posts, splits the band at Payment method and groups its keys under "Expense"', () => {
        expect(EXPENSE_KIND.lifecycle).toBe('posting')
        expect(EXPENSE_KIND.bandSplitAt).toBe('payment_method')
        expect(EXPENSE_KIND.shortcutGroup).toBe('Expense')
    })

    it('keeps empty lines on a refused save and opens its own help topic', () => {
        expect(EXPENSE_KIND.keepsEmptyLinesOnRefusal).toBe(true)
        expect(EXPENSE_KIND.helpTopic).toBe('books:expenses')
    })
})

describe('bigFigureText with the sales receipt kind', () => {
    it('is a dash while the total is invalid and Too large past the limit', () => {
        expect(SALES_RECEIPT_KIND.figure.label).toBe('Amount received')
        expect(bigFigureText(null, 'USD')).toBe('—')
        const item = {
            kind: 'item' as const,
            quantity: 2,
            rate: maxLineAmount,
            percentPpm: 0,
            taxable: false,
        }
        expect(bigFigureText(documentTotals([item], null), 'USD')).toBe('Too large')
    })
})

// The credit memo kind (checkpoint 3 Decisions, spec §3.1).
describe('CREDIT_MEMO_KIND', () => {
    it('has the values of the Decisions', () => {
        expect(CREDIT_MEMO_KIND.key).toBe('credit_memo')
        expect(CREDIT_MEMO_KIND.lifecycle).toBe('posting')
        expect(CREDIT_MEMO_KIND.hostKey).toBe('books:credit_memo')
        expect(CREDIT_MEMO_KIND.testId).toBe('credit-memo')
        expect(CREDIT_MEMO_KIND.routeBase).toBe('books/credit-memos')
        expect(CREDIT_MEMO_KIND.noun).toBe('Credit memo')
        expect(CREDIT_MEMO_KIND.thisNoun).toBe('This credit memo')
        expect(CREDIT_MEMO_KIND.draftTitle).toBe('Draft credit memo')
        expect(CREDIT_MEMO_KIND.newTitle).toBe('New credit memo')
        expect(CREDIT_MEMO_KIND.shortcutGroup).toBe('Credit memo')
        expect(CREDIT_MEMO_KIND.figure).toEqual({ label: 'Credit amount', testId: 'credit-amount' })
        expect(CREDIT_MEMO_KIND.lastTotal).toEqual({
            label: 'Credit amount',
            testId: 'total-credit',
        })
        expect(CREDIT_MEMO_KIND.customerRequired).toBe(true)
        expect(CREDIT_MEMO_KIND.noteHints).toEqual({
            message: 'Shown on the credit memo and its PDF.',
            memo: MEMO_HINT,
        })
        expect(CREDIT_MEMO_KIND.messages).toBe(CREDIT_MEMO_MESSAGES)
        expect(CREDIT_MEMO_KIND.bandSplitAt).toBeNull()
        expect(CREDIT_MEMO_KIND.helpTopic).toBe('books:credit-memos')
        expect(CREDIT_MEMO_KIND.party).toBe('customer')
        expect(CREDIT_MEMO_KIND.lineTables).toBe(SALES_LINE_TABLES)
        expect(CREDIT_MEMO_KIND.features).toBe(SALES_FEATURES)
        expect(CREDIT_MEMO_KIND.keepsEmptyLinesOnRefusal).toBe(false)
    })

    it('names its PDF credit-memo-<number>, or draft-credit-memo before a number', () => {
        expect(CREDIT_MEMO_KIND.pdfStem('1001')).toBe('credit-memo-1001')
        expect(CREDIT_MEMO_KIND.pdfStem('')).toBe('draft-credit-memo')
    })
})

// The refund receipt kind (refund receipt spec §3.1, §3.2, §3.6; plan Decisions "TS names").
describe('REFUND_RECEIPT_KIND', () => {
    it('has the values of spec §3.1', () => {
        expect(REFUND_RECEIPT_KIND.key).toBe('refund_receipt')
        expect(REFUND_RECEIPT_KIND.lifecycle).toBe('posting')
        expect(REFUND_RECEIPT_KIND.hostKey).toBe('books:refund_receipt')
        expect(REFUND_RECEIPT_KIND.testId).toBe('refund-receipt')
        expect(REFUND_RECEIPT_KIND.routeBase).toBe('books/refund-receipts')
        expect(REFUND_RECEIPT_KIND.noun).toBe('Refund receipt')
        expect(REFUND_RECEIPT_KIND.thisNoun).toBe('This refund receipt')
        expect(REFUND_RECEIPT_KIND.draftTitle).toBe('Draft refund receipt')
        expect(REFUND_RECEIPT_KIND.newTitle).toBe('New refund receipt')
        expect(REFUND_RECEIPT_KIND.shortcutGroup).toBe('Refund receipt')
        expect(REFUND_RECEIPT_KIND.party).toBe('customer')
        expect(REFUND_RECEIPT_KIND.customerRequired).toBe(false)
        expect(REFUND_RECEIPT_KIND.lineTables).toBe(SALES_LINE_TABLES)
        expect(REFUND_RECEIPT_KIND.features).toBe(SALES_FEATURES)
        expect(REFUND_RECEIPT_KIND.helpTopic).toBe('books:refund-receipts')
        expect(REFUND_RECEIPT_KIND.bandSplitAt).toBe('payment_method')
        expect(REFUND_RECEIPT_KIND.keepsEmptyLinesOnRefusal).toBe(false)
        expect(REFUND_RECEIPT_KIND.messages).toBe(REFUND_RECEIPT_MESSAGES)
    })

    // Q7: the big figure and the last totals row both read Amount refunded.
    it('labels the big figure and the last totals row Amount refunded', () => {
        expect(REFUND_RECEIPT_KIND.figure).toEqual({
            label: 'Amount refunded',
            testId: 'amount-refunded',
        })
        expect(REFUND_RECEIPT_KIND.lastTotal).toEqual({
            label: 'Amount refunded',
            testId: 'total-refunded',
        })
    })

    it('hints that the message prints on the refund receipt', () => {
        expect(REFUND_RECEIPT_KIND.noteHints).toEqual({
            message: 'Shown on the refund receipt and its PDF.',
            memo: MEMO_HINT,
        })
    })

    it('names its PDF refund-receipt-<number>, or draft-refund-receipt before a number', () => {
        expect(REFUND_RECEIPT_KIND.pdfStem('1003')).toBe('refund-receipt-1003')
        expect(REFUND_RECEIPT_KIND.pdfStem('')).toBe('draft-refund-receipt')
    })
})

// The vendor credit kind (vendor credit plan, Decisions "TS names"; spec §3.1-§3.5).
describe('VENDOR_CREDIT_KIND', () => {
    it('has the values of the Decisions', () => {
        expect(VENDOR_CREDIT_KIND.key).toBe('vendor_credit')
        expect(VENDOR_CREDIT_KIND.lifecycle).toBe('posting')
        expect(VENDOR_CREDIT_KIND.hostKey).toBe('books:vendor_credit')
        expect(VENDOR_CREDIT_KIND.testId).toBe('vendor-credit')
        expect(VENDOR_CREDIT_KIND.routeBase).toBe('books/vendor-credits')
        expect(VENDOR_CREDIT_KIND.noun).toBe('Vendor credit')
        expect(VENDOR_CREDIT_KIND.thisNoun).toBe('This vendor credit')
        expect(VENDOR_CREDIT_KIND.draftTitle).toBe('Draft vendor credit')
        expect(VENDOR_CREDIT_KIND.newTitle).toBe('New vendor credit')
        expect(VENDOR_CREDIT_KIND.shortcutGroup).toBe('Vendor credit')
        expect(VENDOR_CREDIT_KIND.figure).toEqual({
            label: 'Credit amount',
            testId: 'credit-amount',
        })
        expect(VENDOR_CREDIT_KIND.lastTotal).toBeNull()
        expect(VENDOR_CREDIT_KIND.customerRequired).toBe(true)
        expect(VENDOR_CREDIT_KIND.noteHints).toEqual({ message: '', memo: MEMO_HINT })
        expect(VENDOR_CREDIT_KIND.messages).toBe(VENDOR_CREDIT_MESSAGES)
        expect(VENDOR_CREDIT_KIND.bandSplitAt).toBeNull()
        expect(VENDOR_CREDIT_KIND.helpTopic).toBe('books:vendor-credits')
        expect(VENDOR_CREDIT_KIND.party).toBe('vendor')
        expect(VENDOR_CREDIT_KIND.lineTables).toBe(PURCHASE_LINE_TABLES)
        expect(VENDOR_CREDIT_KIND.keepsEmptyLinesOnRefusal).toBe(true)
    })

    // Spec §3.1: no tabs, no PDF, no email, no address; attachments as on the bill.
    it('has no tax, message, email, PDF or party address, and keeps attachments', () => {
        expect(VENDOR_CREDIT_KIND.features).toEqual({
            tax: false,
            message: false,
            email: false,
            pdf: false,
            partyAddress: false,
            attachments: true,
        })
    })
})

describe('bigFigureText with the credit memo kind', () => {
    it('is a dash while the total is invalid and Too large past the limit', () => {
        expect(CREDIT_MEMO_KIND.figure.label).toBe('Credit amount')
        expect(bigFigureText(null, 'USD')).toBe('—')
        const item = {
            kind: 'item' as const,
            quantity: 2,
            rate: maxLineAmount,
            percentPpm: 0,
            taxable: false,
        }
        expect(bigFigureText(documentTotals([item], null), 'USD')).toBe('Too large')
    })
})
