import { describe, expect, it } from 'vitest'
import type { DocumentListRow } from '../tinycld/books/lib/document-list'
import {
    documentRowMenuItems,
    ROW_MENU_LABELS,
    type RowMenuAction,
    rowActionHref,
    rowActionTestId,
    rowWriteOffOffered,
} from '../tinycld/books/lib/document-row-menu'
import { SEND_KINDS } from '../tinycld/books/lib/document-send'
import type { TransactionKind } from '../tinycld/books/lib/party-transactions'

// The row menu of a sales list (spec §3 "Row menu"): Open, then the read view's actions for
// the document's status and the user's access, in the read view's order and with its labels,
// never Edit; a draft holds Open and Delete draft (Open alone for a reader).

const ID = 'inv000000000001'
const CUSTOMER = 'cus000000000001'
const ENTRY = 'ent000000000001'
const CONVERTED = 'inv000000000099'

// A send kind's row carries its document's address, so a sent-able row is also sendable;
// a kind with no email field (a payment, a write-off) has ''.
function emailOf(kind: TransactionKind): string {
    const sendKinds: readonly string[] = SEND_KINDS
    return sendKinds.includes(kind) ? 'billing@acme.test' : ''
}

function row(
    kind: TransactionKind,
    recordStatus: string,
    fields: Partial<DocumentListRow> = {}
): DocumentListRow {
    return {
        id: ID,
        kind,
        number: '1004',
        date: '2026-11-17',
        dueDate: '',
        total: 150,
        currency: 'USD',
        created: '2026-11-17 10:00:00.000Z',
        status: { label: 'Open', tone: 'warning' },
        sequence: 1004,
        partyId: CUSTOMER,
        partyName: 'Acme',
        memo: '',
        reference: '',
        expires: '',
        balance: 0,
        entry: recordStatus === 'draft' || kind === 'estimate' ? '' : ENTRY,
        convertedInvoice: '',
        recordStatus,
        category: { kind: 'none' },
        email: emailOf(kind),
        ...fields,
    }
}

const WRITER = true
const READER = false

describe('documentRowMenuItems, writer', () => {
    it('a posted invoice with a balance: Open, Send…, Receive payment, Write off, Void, Copy, Create credit memo, View journal entry, Download PDF', () => {
        expect(documentRowMenuItems(row('invoice', 'posted', { balance: 150 }), WRITER)).toEqual([
            'open',
            'send',
            'receive_payment',
            'write_off',
            'void',
            'copy',
            'credit_memo',
            'entry',
            'pdf',
        ])
    })

    it('a paid posted invoice has no Receive payment', () => {
        expect(documentRowMenuItems(row('invoice', 'posted', { balance: 0 }), WRITER)).toEqual([
            'open',
            'send',
            'void',
            'copy',
            'credit_memo',
            'entry',
            'pdf',
        ])
    })

    it('a void invoice: Open, Copy, View journal entry, Download PDF', () => {
        expect(documentRowMenuItems(row('invoice', 'void', { balance: 0 }), WRITER)).toEqual([
            'open',
            'copy',
            'entry',
            'pdf',
        ])
    })

    it.each([
        'invoice',
        'sales_receipt',
        'payment',
        'credit_memo',
    ] as const)('a draft %s: Open, Delete draft', kind => {
        expect(documentRowMenuItems(row(kind, 'draft', { balance: 150 }), WRITER)).toEqual([
            'open',
            'delete_draft',
        ])
    })

    it('a posted payment: Open, Void, View journal entry', () => {
        expect(documentRowMenuItems(row('payment', 'posted'), WRITER)).toEqual([
            'open',
            'void',
            'entry',
        ])
    })

    it('a void payment: Open, View journal entry', () => {
        expect(documentRowMenuItems(row('payment', 'void'), WRITER)).toEqual(['open', 'entry'])
    })

    it('a pending estimate: Open, Send…, Copy, Download PDF', () => {
        expect(documentRowMenuItems(row('estimate', 'pending'), WRITER)).toEqual([
            'open',
            'send',
            'copy',
            'pdf',
        ])
    })

    it('a closed estimate with an invoice: Open, Open invoice, Copy, Download PDF', () => {
        const closed = row('estimate', 'closed', { convertedInvoice: CONVERTED })
        expect(documentRowMenuItems(closed, WRITER)).toEqual(['open', 'invoice', 'copy', 'pdf'])
    })

    it('a closed estimate without an invoice has no Open invoice', () => {
        expect(documentRowMenuItems(row('estimate', 'closed'), WRITER)).toEqual([
            'open',
            'copy',
            'pdf',
        ])
    })

    it('a posted sales_receipt: Open, Send…, Void, Copy, View journal entry, Download PDF', () => {
        expect(
            documentRowMenuItems(row('sales_receipt', 'posted', { balance: 150 }), WRITER)
        ).toEqual(['open', 'send', 'void', 'copy', 'entry', 'pdf'])
    })

    // Apply credit spec §3.1: "Apply to invoices" first, before Open, on a posted credit memo
    // with unapplied credit, for a writer.
    it('a posted credit_memo with a balance: Apply to invoices, Open, Send…, Void, Copy, View journal entry, Download PDF', () => {
        expect(
            documentRowMenuItems(row('credit_memo', 'posted', { balance: 150 }), WRITER)
        ).toEqual(['apply_credit', 'open', 'send', 'void', 'copy', 'entry', 'pdf'])
    })

    it('a posted credit_memo with balance 0: Open, Send…, Void, Copy, View journal entry, Download PDF', () => {
        expect(documentRowMenuItems(row('credit_memo', 'posted', { balance: 0 }), WRITER)).toEqual([
            'open',
            'send',
            'void',
            'copy',
            'entry',
            'pdf',
        ])
    })
})

describe('documentRowMenuItems, apply credit', () => {
    it('a reader, a draft, a void memo and a memo at balance 0 have no apply_credit', () => {
        expect(
            documentRowMenuItems(row('credit_memo', 'posted', { balance: 150 }), READER)
        ).not.toContain('apply_credit')
        expect(
            documentRowMenuItems(row('credit_memo', 'draft', { balance: 150 }), WRITER)
        ).not.toContain('apply_credit')
        expect(
            documentRowMenuItems(row('credit_memo', 'void', { balance: 150 }), WRITER)
        ).not.toContain('apply_credit')
        expect(
            documentRowMenuItems(row('credit_memo', 'posted', { balance: 0 }), WRITER)
        ).not.toContain('apply_credit')
    })

    it('an invoice row never has apply_credit (Q4)', () => {
        for (const status of ['draft', 'posted', 'void']) {
            for (const balance of [0, 150]) {
                for (const canWrite of [WRITER, READER]) {
                    expect(
                        documentRowMenuItems(row('invoice', status, { balance }), canWrite)
                    ).not.toContain('apply_credit')
                }
            }
        }
    })

    it('its label is "Apply to invoices" and its test id sales-row-action-apply-credit', () => {
        expect(ROW_MENU_LABELS.apply_credit).toBe('Apply to invoices')
        expect(rowActionTestId('sales', 'apply_credit')).toBe('sales-row-action-apply-credit')
    })

    it('gives no route: the credit memo opens with its dialog through the store', () => {
        expect(
            rowActionHref(row('credit_memo', 'posted', { balance: 150 }), 'apply_credit')
        ).toBeNull()
    })
})

describe('documentRowMenuItems, reader', () => {
    it.each([
        'invoice',
        'sales_receipt',
        'payment',
        'credit_memo',
    ] as const)('a draft %s gives Open only', kind => {
        expect(documentRowMenuItems(row(kind, 'draft'), READER)).toEqual(['open'])
    })

    it('a posted invoice: Open, View journal entry, Download PDF', () => {
        expect(documentRowMenuItems(row('invoice', 'posted', { balance: 150 }), READER)).toEqual([
            'open',
            'entry',
            'pdf',
        ])
    })

    it('a posted payment: Open, View journal entry', () => {
        expect(documentRowMenuItems(row('payment', 'posted'), READER)).toEqual(['open', 'entry'])
    })

    it('an estimate: Open, Download PDF', () => {
        expect(documentRowMenuItems(row('estimate', 'accepted'), READER)).toEqual(['open', 'pdf'])
    })
})

describe('documentRowMenuItems, every list', () => {
    const rows: DocumentListRow[] = [
        row('invoice', 'posted', { balance: 150 }),
        row('invoice', 'posted', { balance: 0 }),
        row('invoice', 'void'),
        row('invoice', 'draft'),
        row('estimate', 'pending'),
        row('estimate', 'closed', { convertedInvoice: CONVERTED }),
        row('sales_receipt', 'posted'),
        row('sales_receipt', 'void'),
        row('payment', 'posted'),
        row('payment', 'void'),
        row('credit_memo', 'posted', { balance: 40 }),
        row('credit_memo', 'void'),
    ]

    it('no list holds Edit, for a writer or a reader', () => {
        for (const listed of rows) {
            for (const canWrite of [WRITER, READER]) {
                const items: string[] = documentRowMenuItems(listed, canWrite)
                expect(items).not.toContain('edit')
                // Apply to invoices alone comes before Open (apply credit spec §3.1).
                expect(items.filter(item => item !== 'apply_credit')[0]).toBe('open')
            }
        }
    })

    // Email-share spec §3.3 "Sales list row menu": Send… for a writer on a sent-able row,
    // directly after Open; Copy customer link is never a row (plan checkpoint 4).
    it('a writer’s sent-able row has Send… directly after Open', () => {
        for (const listed of [
            row('invoice', 'posted', { balance: 150 }),
            row('invoice', 'posted', { balance: 0 }),
            row('estimate', 'pending'),
            row('estimate', 'accepted'),
            row('estimate', 'rejected'),
            row('sales_receipt', 'posted'),
            row('credit_memo', 'posted', { balance: 40 }),
            row('credit_memo', 'posted', { balance: 0 }),
            row('refund_receipt', 'posted'),
        ]) {
            const items: string[] = documentRowMenuItems(listed, WRITER)
            const label = `${listed.kind} ${listed.recordStatus}`
            expect(items.indexOf('send'), label).toBe(items.indexOf('open') + 1)
            expect(items, label).not.toContain('link')
        }
    })

    it('a draft, a void row, a closed estimate, a payment and every reader’s row have no Send…', () => {
        const notSentable: DocumentListRow[] = [
            row('invoice', 'draft'),
            row('invoice', 'void'),
            row('estimate', 'closed'),
            row('estimate', 'closed', { convertedInvoice: CONVERTED }),
            row('sales_receipt', 'draft'),
            row('sales_receipt', 'void'),
            row('credit_memo', 'draft'),
            row('credit_memo', 'void'),
            row('refund_receipt', 'draft'),
            row('refund_receipt', 'void'),
            row('payment', 'posted'),
            row('payment', 'void'),
            row('payment', 'draft'),
            row('write_off', 'posted'),
        ]
        for (const listed of notSentable) {
            const items: string[] = documentRowMenuItems(listed, WRITER)
            expect(items, `${listed.kind} ${listed.recordStatus}`).not.toContain('send')
        }
        for (const listed of [
            ...rows,
            row('estimate', 'accepted'),
            row('estimate', 'rejected'),
            row('refund_receipt', 'posted'),
        ]) {
            const items: string[] = documentRowMenuItems(listed, READER)
            expect(items, `reader ${listed.kind} ${listed.recordStatus}`).not.toContain('send')
            expect(items, `reader ${listed.kind} ${listed.recordStatus}`).not.toContain('link')
        }
    })

    it('send gives no route: the Send dialog opens over the list', () => {
        expect(rowActionHref(row('invoice', 'posted', { balance: 150 }), 'send')).toBeNull()
        expect(rowActionHref(row('estimate', 'pending'), 'send')).toBeNull()
    })

    it('a row with no entry has no View journal entry', () => {
        const noEntry: DocumentListRow[] = [
            row('invoice', 'posted', { balance: 150, entry: '' }),
            row('invoice', 'void', { entry: '' }),
            row('sales_receipt', 'posted', { entry: '' }),
            row('payment', 'posted', { entry: '' }),
            row('payment', 'void', { entry: '' }),
            row('credit_memo', 'posted', { entry: '' }),
        ]
        for (const listed of noEntry) {
            expect(documentRowMenuItems(listed, WRITER)).not.toContain('entry')
            expect(documentRowMenuItems(listed, READER)).not.toContain('entry')
        }
        expect(
            documentRowMenuItems(row('invoice', 'posted', { balance: 150, entry: '' }), WRITER)
        ).toEqual([
            'open',
            'send',
            'receive_payment',
            'write_off',
            'void',
            'copy',
            'credit_memo',
            'pdf',
        ])
    })
})

// Refund receipt spec §3.13: row actions as the sales receipts tab.
describe('documentRowMenuItems, refund receipt', () => {
    it.each([
        'draft',
        'posted',
        'void',
    ])('a %s refund has the sales receipt menu, for a writer and a reader', status => {
        for (const canWrite of [WRITER, READER]) {
            expect(documentRowMenuItems(row('refund_receipt', status), canWrite)).toEqual(
                documentRowMenuItems(row('sales_receipt', status), canWrite)
            )
        }
    })

    it('a posted refund for a writer: Open, Send…, Void, Copy, View journal entry, Download PDF', () => {
        expect(documentRowMenuItems(row('refund_receipt', 'posted'), WRITER)).toEqual([
            'open',
            'send',
            'void',
            'copy',
            'entry',
            'pdf',
        ])
    })

    it('a draft refund for a writer: Open, Delete draft', () => {
        expect(documentRowMenuItems(row('refund_receipt', 'draft'), WRITER)).toEqual([
            'open',
            'delete_draft',
        ])
    })

    it('open and copy give the refund receipt routes', () => {
        expect(rowActionHref(row('refund_receipt', 'posted'), 'open')).toBe(
            `books/refund-receipts/${ID}`
        )
        expect(parts(rowActionHref(row('refund_receipt', 'posted'), 'copy'))).toEqual({
            path: 'books/refund-receipts/new',
            params: { copy: ID },
        })
    })
})

describe('ROW_MENU_LABELS', () => {
    it("equal the read view's labels", () => {
        expect(ROW_MENU_LABELS).toEqual({
            open: 'Open',
            send: 'Send…',
            receive_payment: 'Receive payment',
            void: 'Void',
            copy: 'Copy',
            credit_memo: 'Create credit memo',
            entry: 'View journal entry',
            invoice: 'Open invoice',
            pdf: 'Download PDF',
            delete_draft: 'Delete draft',
            write_off: 'Write off',
            apply_credit: 'Apply to invoices',
        })
    })
})

describe('rowActionTestId', () => {
    it('starts with the list area prefix', () => {
        expect(rowActionTestId('sales', 'delete_draft')).toBe('sales-row-action-delete-draft')
        expect(rowActionTestId('purchases', 'delete_draft')).toBe(
            'purchases-row-action-delete-draft'
        )
    })

    it('is sales-row-action- with dashes', () => {
        const ids = (
            [
                'open',
                'receive_payment',
                'void',
                'copy',
                'credit_memo',
                'entry',
                'invoice',
                'pdf',
                'delete_draft',
                'write_off',
                'send',
            ] as RowMenuAction[]
        ).map(action => rowActionTestId('sales', action))
        expect(ids).toEqual([
            'sales-row-action-open',
            'sales-row-action-receive-payment',
            'sales-row-action-void',
            'sales-row-action-copy',
            'sales-row-action-credit-memo',
            'sales-row-action-entry',
            'sales-row-action-invoice',
            'sales-row-action-pdf',
            'sales-row-action-delete-draft',
            'sales-row-action-write-off',
            'sales-row-action-send',
        ])
    })
})

// Write-off spec §3.1: the one offer rule of the Sales-list menu and the customer page menu.
describe('rowWriteOffOffered', () => {
    const open = { kind: 'invoice', recordStatus: 'posted', balance: 1 }

    it('is true for a posted invoice with a balance above 0, for a writer', () => {
        expect(rowWriteOffOffered(open, WRITER)).toBe(true)
    })

    it('is false for a reader, a draft, a void row and a balance of 0', () => {
        expect(rowWriteOffOffered(open, READER)).toBe(false)
        expect(rowWriteOffOffered({ ...open, recordStatus: 'draft' }, WRITER)).toBe(false)
        expect(rowWriteOffOffered({ ...open, recordStatus: 'void' }, WRITER)).toBe(false)
        expect(rowWriteOffOffered({ ...open, balance: 0 }, WRITER)).toBe(false)
    })

    it.each([
        'estimate',
        'sales_receipt',
        'payment',
        'credit_memo',
        'refund_receipt',
        'write_off',
        'bill',
    ])('is false for a posted %s with a balance', kind => {
        expect(rowWriteOffOffered({ ...open, kind }, WRITER)).toBe(false)
    })
})

describe('documentRowMenuItems, write off', () => {
    it('lists Write off directly after Receive payment for a writer', () => {
        const items = documentRowMenuItems(row('invoice', 'posted', { balance: 150 }), WRITER)
        expect(items.indexOf('write_off')).toBe(items.indexOf('receive_payment') + 1)
    })

    it('does not list it for a reader, a draft, a void invoice or a balance of 0', () => {
        expect(
            documentRowMenuItems(row('invoice', 'posted', { balance: 150 }), READER)
        ).not.toContain('write_off')
        expect(
            documentRowMenuItems(row('invoice', 'draft', { balance: 150 }), WRITER)
        ).not.toContain('write_off')
        expect(
            documentRowMenuItems(row('invoice', 'void', { balance: 150 }), WRITER)
        ).not.toContain('write_off')
        expect(
            documentRowMenuItems(row('invoice', 'posted', { balance: 0 }), WRITER)
        ).not.toContain('write_off')
    })

    it('a write-off row lists Open alone, posted or void, for a writer and a reader', () => {
        for (const status of ['posted', 'void']) {
            for (const canWrite of [WRITER, READER]) {
                expect(documentRowMenuItems(row('write_off', status), canWrite)).toEqual(['open'])
            }
        }
    })

    it('write_off gives no route: the dialog opens over the list', () => {
        expect(rowActionHref(row('invoice', 'posted', { balance: 150 }), 'write_off')).toBeNull()
    })

    it("a write-off row's Open gives the write-off page", () => {
        expect(rowActionHref(row('write_off', 'posted'), 'open')).toBe(`books/write-offs/${ID}`)
    })
})

// A route as its path and its params, so the order of the params does not matter.
function parts(href: string | null) {
    if (href === null) throw new Error('no route')
    const [path, query = ''] = href.split('?')
    return { path, params: Object.fromEntries(new URLSearchParams(query)) }
}

describe('rowActionHref', () => {
    const posted = row('invoice', 'posted', { balance: 150 })

    it("open gives the document's route", () => {
        expect(rowActionHref(posted, 'open')).toBe(`books/invoices/${ID}`)
        expect(rowActionHref(row('payment', 'posted'), 'open')).toBe(`books/payments/${ID}`)
        expect(rowActionHref(row('estimate', 'pending'), 'open')).toBe(`books/estimates/${ID}`)
        expect(rowActionHref(row('sales_receipt', 'posted'), 'open')).toBe(
            `books/sales-receipts/${ID}`
        )
        expect(rowActionHref(row('credit_memo', 'posted'), 'open')).toBe(`books/credit-memos/${ID}`)
    })

    it('receive_payment gives the new payment with the customer and the invoice', () => {
        expect(parts(rowActionHref(posted, 'receive_payment'))).toEqual({
            path: 'books/payments/new',
            params: { customer: CUSTOMER, invoice: ID },
        })
    })

    it("copy gives the kind's new route with copy", () => {
        expect(parts(rowActionHref(posted, 'copy'))).toEqual({
            path: 'books/invoices/new',
            params: { copy: ID },
        })
        expect(parts(rowActionHref(row('estimate', 'pending'), 'copy'))).toEqual({
            path: 'books/estimates/new',
            params: { copy: ID },
        })
        expect(parts(rowActionHref(row('sales_receipt', 'void'), 'copy'))).toEqual({
            path: 'books/sales-receipts/new',
            params: { copy: ID },
        })
        expect(parts(rowActionHref(row('credit_memo', 'posted'), 'copy'))).toEqual({
            path: 'books/credit-memos/new',
            params: { copy: ID },
        })
    })

    it('credit_memo gives the new credit memo with the invoice', () => {
        expect(parts(rowActionHref(posted, 'credit_memo'))).toEqual({
            path: 'books/credit-memos/new',
            params: { invoice: ID },
        })
    })

    it('entry gives the journal entry', () => {
        expect(rowActionHref(posted, 'entry')).toBe(`books/entries/${ENTRY}`)
    })

    it('invoice gives the converted invoice', () => {
        const closed = row('estimate', 'closed', { convertedInvoice: CONVERTED })
        expect(rowActionHref(closed, 'invoice')).toBe(`books/invoices/${CONVERTED}`)
    })

    it('pdf, void and delete_draft give null', () => {
        expect(rowActionHref(posted, 'pdf')).toBeNull()
        expect(rowActionHref(posted, 'void')).toBeNull()
        expect(rowActionHref(row('invoice', 'draft'), 'delete_draft')).toBeNull()
    })
})
