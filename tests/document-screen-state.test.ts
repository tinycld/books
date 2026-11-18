// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
    BILL_DOCUMENT,
    EXPENSE_DOCUMENT,
    VENDOR_CREDIT_DOCUMENT,
} from '../tinycld/books/components/documents/document-kinds'
import type { DocumentScreenInput } from '../tinycld/books/hooks/document-data'
import { useDocumentScreen } from '../tinycld/books/hooks/useDocumentScreen'
import { SETTINGS } from '../tinycld/books/lib/account-register-fixture'
import { BILL_IDS, BILL_LINES, BILLS } from '../tinycld/books/lib/bill-form-fixture'
import { bigFigureText, SALES_RECEIPT_MESSAGES } from '../tinycld/books/lib/document-messages'
import { documentScreenState } from '../tinycld/books/lib/document-screen-state'
import { shownDocumentTotals } from '../tinycld/books/lib/document-tax'
import { CREDIT_MEMO_MESSAGES } from '../tinycld/books/lib/document-texts'
import { lineTableSubtotals } from '../tinycld/books/lib/document-values'
import { EXPENSE_IDS, EXPENSE_LINES, EXPENSES } from '../tinycld/books/lib/expense-form-fixture'
import { maxStoredAmount } from '../tinycld/books/lib/money-text'
import {
    BILL_KIND,
    CREDIT_MEMO_KIND,
    EXPENSE_KIND,
    SALES_RECEIPT_KIND,
    VENDOR_CREDIT_KIND,
} from '../tinycld/books/lib/sales-document-kinds'
import {
    VENDOR_CREDIT_IDS,
    VENDOR_CREDIT_LINES,
    VENDOR_CREDITS,
} from '../tinycld/books/lib/vendor-credit-form-fixture'
import { VENDOR_IDS, VENDORS } from '../tinycld/books/lib/vendor-form-fixture'
import type {
    BooksBillLines,
    BooksBillPaymentLines,
    BooksBillPayments,
    BooksBills,
    BooksExpenseLines,
    BooksExpenses,
    BooksProducts,
    BooksSettings,
    BooksVendorCreditLines,
    BooksVendorCredits,
    BooksVendors,
} from '../tinycld/books/types'
import {
    accountsStore,
    neverReadyStore,
    onDemandStore,
    releaseAccountsRead,
    seedBooks,
    settingsStore,
} from './accounts-form-harness'
import { expectLiveQueryError } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

type Input = Parameters<typeof documentScreenState>[0]

// A writer on a loaded draft.
const DRAFT: Input = {
    lifecycle: 'posting',
    isReady: true,
    isError: false,
    canWrite: true,
    isNew: false,
    status: 'draft',
    isHeld: false,
    replacesStatus: undefined,
}

// A writer on `books/invoices/new`.
const NEW: Input = { ...DRAFT, isNew: true, status: null }

describe('documentScreenState', () => {
    it('is loading until every read is ready', () => {
        expect(documentScreenState({ ...DRAFT, isReady: false })).toBe('loading')
        expect(documentScreenState({ ...NEW, isReady: false })).toBe('loading')
    })

    it('is error when any read failed, even before the others are ready', () => {
        expect(documentScreenState({ ...DRAFT, isError: true })).toBe('error')
        expect(documentScreenState({ ...DRAFT, isError: true, isReady: false })).toBe('error')
        expect(documentScreenState({ ...NEW, isError: true, canWrite: false })).toBe('error')
    })

    it('a new invoice is the form for a writer and no-access for a reader', () => {
        expect(documentScreenState(NEW)).toBe('form')
        expect(documentScreenState({ ...NEW, canWrite: false })).toBe('no-access')
    })

    it('a draft is the form for a writer and no-access for a reader', () => {
        expect(documentScreenState(DRAFT)).toBe('form')
        expect(documentScreenState({ ...DRAFT, canWrite: false })).toBe('no-access')
    })

    it('a posted or void invoice is the read view for a reader', () => {
        expect(documentScreenState({ ...DRAFT, canWrite: false, status: 'posted' })).toBe('read')
        expect(documentScreenState({ ...DRAFT, canWrite: false, status: 'void' })).toBe('read')
    })

    it('an id whose row does not exist is not-found', () => {
        expect(documentScreenState({ ...DRAFT, status: null })).toBe('not-found')
        expect(documentScreenState({ ...DRAFT, status: null, canWrite: false })).toBe('not-found')
    })

    it('a posted invoice is the read view for a writer, unless the form is held through a post', () => {
        expect(documentScreenState({ ...DRAFT, status: 'posted' })).toBe('read')
        expect(documentScreenState({ ...DRAFT, status: 'void' })).toBe('read')
        expect(documentScreenState({ ...DRAFT, status: 'posted', isHeld: true })).toBe('form')
    })

    // Delete draft is optimistic: the row leaves the store before the server answers. The
    // held form stays, so a refused delete shows in its dialog and the edits survive.
    it('a draft held through a delete stays the form while its row is gone', () => {
        expect(documentScreenState({ ...DRAFT, status: null, isHeld: true })).toBe('form')
        expect(documentScreenState({ ...DRAFT, status: 'draft', isHeld: true })).toBe('form')
    })

    it('a correction of an invoice that is not posted cannot be edited', () => {
        expect(documentScreenState({ ...NEW, replacesStatus: 'draft' })).toBe('cannot-edit')
        expect(documentScreenState({ ...NEW, replacesStatus: 'void' })).toBe('cannot-edit')
    })

    it('a correction of a missing invoice is not-found', () => {
        expect(documentScreenState({ ...NEW, replacesStatus: null })).toBe('not-found')
    })

    it('a correction of a posted invoice is the form', () => {
        expect(documentScreenState({ ...NEW, replacesStatus: 'posted' })).toBe('form')
    })

    // Convert to invoice (spec §3.7): `books/invoices/new?estimate=<id>`. `estimateStatus`
    // is the estimate's status, null when it does not exist. Only a pending or accepted
    // estimate converts; a rejected or closed one shows the cannot-convert notice.
    it('an invoice from an estimate is the form only while the estimate is pending or accepted', () => {
        expect(documentScreenState({ ...NEW, estimateStatus: 'pending' })).toBe('form')
        expect(documentScreenState({ ...NEW, estimateStatus: 'accepted' })).toBe('form')
        expect(documentScreenState({ ...NEW, estimateStatus: 'rejected' })).toBe('cannot-convert')
        expect(documentScreenState({ ...NEW, estimateStatus: 'closed' })).toBe('cannot-convert')
        expect(documentScreenState({ ...NEW, estimateStatus: null })).toBe('not-found')
        expect(documentScreenState({ ...NEW, estimateStatus: 'pending', canWrite: false })).toBe(
            'no-access'
        )
    })
})

// The sales receipt's states (spec §3.9) and the texts its screen shows for them.
describe('documentScreenState for a sales receipt', () => {
    // Read inside each test, so a missing kind fails those tests and not the file.
    const texts = () => SALES_RECEIPT_KIND.messages

    it('a non-writer at new gets no-access with the receipt text', () => {
        expect(documentScreenState({ ...NEW, canWrite: false })).toBe('no-access')
        expect(SALES_RECEIPT_MESSAGES.noAccess).toBe(
            'You need bookkeeper access to create sales receipts'
        )
        expect(texts().noAccess).toBe(SALES_RECEIPT_MESSAGES.noAccess)
    })

    it('an id with no row is not-found with the receipt text', () => {
        expect(documentScreenState({ ...DRAFT, status: null })).toBe('not-found')
        expect(texts().notFound).toBe('This sales receipt does not exist')
    })

    it('a correction of a draft cannot be edited, with the receipt text', () => {
        expect(documentScreenState({ ...NEW, replacesStatus: 'draft' })).toBe('cannot-edit')
        expect(texts().cannotEdit).toBe('This sales receipt cannot be edited')
    })

    it('a failed load is the error with the receipt text', () => {
        expect(documentScreenState({ ...DRAFT, isError: true })).toBe('error')
        expect(texts().loadFailed).toBe('Books could not load this sales receipt.')
    })

    it('is loading while the reads are not ready', () => {
        expect(documentScreenState({ ...NEW, isReady: false })).toBe('loading')
    })
})

// The credit memo's states (spec §3.9, "as the invoice") and the texts its screen shows
// for them. The inputs take the kind's own lifecycle.
describe('documentScreenState for a credit memo', () => {
    // Read inside each test, so a missing kind fails those tests and not the file.
    const draft = (): Input => ({ ...DRAFT, lifecycle: CREDIT_MEMO_KIND.lifecycle })
    const fresh = (): Input => ({ ...draft(), isNew: true, status: null })

    it('a non-writer at new gets no-access with the credit memo text', () => {
        expect(documentScreenState({ ...fresh(), canWrite: false })).toBe('no-access')
        expect(CREDIT_MEMO_MESSAGES.noAccess).toBe(
            'You need bookkeeper access to create credit memos'
        )
        expect(CREDIT_MEMO_KIND.messages.noAccess).toBe(CREDIT_MEMO_MESSAGES.noAccess)
    })

    it('an id with no row is not-found with the credit memo text', () => {
        expect(documentScreenState({ ...draft(), status: null })).toBe('not-found')
        expect(CREDIT_MEMO_MESSAGES.notFound).toBe('This credit memo does not exist')
    })

    it('a correction of a draft or a void memo cannot be edited, with the credit memo text', () => {
        expect(documentScreenState({ ...fresh(), replacesStatus: 'draft' })).toBe('cannot-edit')
        expect(documentScreenState({ ...fresh(), replacesStatus: 'void' })).toBe('cannot-edit')
        expect(CREDIT_MEMO_MESSAGES.cannotEdit).toBe('This credit memo cannot be edited')
    })

    it('a failed read is the error with the credit memo text, even while another read loads', () => {
        expect(documentScreenState({ ...draft(), isError: true })).toBe('error')
        expect(documentScreenState({ ...draft(), isError: true, isReady: false })).toBe('error')
        expect(CREDIT_MEMO_MESSAGES.loadFailed).toBe('Books could not load this credit memo.')
    })

    it('is loading while the reads are not ready', () => {
        expect(documentScreenState({ ...fresh(), isReady: false })).toBe('loading')
        expect(documentScreenState({ ...draft(), isReady: false })).toBe('loading')
    })

    it('a posted memo is the read view for a reader and a writer; a draft is the form for a writer', () => {
        expect(documentScreenState({ ...draft(), status: 'posted', canWrite: false })).toBe('read')
        expect(documentScreenState({ ...draft(), status: 'posted' })).toBe('read')
        expect(documentScreenState(draft())).toBe('form')
    })

    // Create credit memo (spec §3.2, §3.9): `books/credit-memos/new?invoice=<id>`.
    // `invoiceStatus` is the invoice's status, null when it does not exist or cannot be read.
    // Only a posted invoice can be credited.
    it('a new memo from a posted invoice is the form for a writer', () => {
        expect(documentScreenState({ ...fresh(), invoiceStatus: 'posted' })).toBe('form')
    })

    it.each([
        'draft',
        'void',
        null,
    ] as const)('a new memo from an invoice whose status is %s cannot be credited', invoiceStatus => {
        expect(documentScreenState({ ...fresh(), invoiceStatus })).toBe('cannot-credit')
        expect(CREDIT_MEMO_KIND.messages.cannotCredit).toBe('This invoice cannot be credited')
    })

    it('no ?invoice (invoiceStatus undefined) changes nothing', () => {
        expect(documentScreenState({ ...fresh(), invoiceStatus: undefined })).toBe('form')
        expect(documentScreenState({ ...fresh(), invoiceStatus: undefined, canWrite: false })).toBe(
            'no-access'
        )
        expect(documentScreenState({ ...draft(), invoiceStatus: undefined })).toBe('form')
        expect(
            documentScreenState({ ...draft(), status: 'posted', invoiceStatus: undefined })
        ).toBe('read')
    })

    it('a failed read of the invoice is the error', () => {
        expect(documentScreenState({ ...fresh(), invoiceStatus: null, isError: true })).toBe(
            'error'
        )
        expect(
            documentScreenState({
                ...fresh(),
                invoiceStatus: undefined,
                isError: true,
                isReady: false,
            })
        ).toBe('error')
    })
})

// The quote lifecycle (spec §3.1): the form opens for a writer on pending, accepted and
// rejected estimates; a closed estimate opens in the read view for everyone; a reader
// sees every estimate in the read view and gets no-access at new.
describe('documentScreenState for a quote', () => {
    const PENDING: Input = { ...DRAFT, lifecycle: 'quote', status: 'pending' }
    const NEW_QUOTE: Input = { ...PENDING, isNew: true, status: null }

    it.each([
        'pending',
        'accepted',
        'rejected',
    ] as const)('a writer on a %s estimate gets the form', status => {
        expect(documentScreenState({ ...PENDING, status })).toBe('form')
    })

    it('a writer on a closed estimate gets the read view', () => {
        expect(documentScreenState({ ...PENDING, status: 'closed' })).toBe('read')
    })

    it('a reader on a pending estimate gets the read view', () => {
        expect(documentScreenState({ ...PENDING, canWrite: false })).toBe('read')
    })

    it('a reader at new gets no-access, a writer the form', () => {
        expect(documentScreenState({ ...NEW_QUOTE, canWrite: false })).toBe('no-access')
        expect(documentScreenState(NEW_QUOTE)).toBe('form')
    })

    // The first save's optimistic row would swap the new form before the server answers.
    it('a new estimate held through its save stays the form', () => {
        expect(documentScreenState({ ...NEW_QUOTE, isHeld: true })).toBe('form')
        expect(documentScreenState({ ...PENDING, isHeld: true })).toBe('form')
    })

    it('an id with no row is not-found', () => {
        expect(documentScreenState({ ...PENDING, status: null })).toBe('not-found')
    })
})

// The bill's states (spec §3.9) and the texts its screen shows for them.
describe('documentScreenState for a bill', () => {
    // Read inside each test, so a missing kind fails those tests and not the file.
    const texts = () => BILL_KIND.messages

    it('a non-writer at books/bills/new gets no-access with the bill text', () => {
        expect(documentScreenState({ ...NEW, canWrite: false })).toBe('no-access')
        expect(texts().noAccess).toBe('You need bookkeeper access to create bills')
    })

    it('an id with no row is not-found with the bill text', () => {
        expect(documentScreenState({ ...DRAFT, status: null })).toBe('not-found')
        expect(texts().notFound).toBe('This bill does not exist')
    })

    it('a correction of a draft cannot be edited, with the bill text', () => {
        expect(documentScreenState({ ...NEW, replacesStatus: 'draft' })).toBe('cannot-edit')
        expect(texts().cannotEdit).toBe('This bill cannot be edited')
    })

    it('a failed load is the error with the bill text', () => {
        expect(documentScreenState({ ...DRAFT, isError: true })).toBe('error')
        expect(texts().loadFailed).toBe('Books could not load this bill.')
    })

    it('posts: the bill kind has the posting lifecycle', () => {
        expect(BILL_KIND.lifecycle).toBe('posting')
        expect(BILL_DOCUMENT.doc).toBe(BILL_KIND)
    })
})

// The big figure (Balance due) over the bill's two tables, summed by the shared helper.
describe('the bill big figure', () => {
    const account = (amount: string) => ({ id: `a${amount}`, kind: 'account', amount })

    // The figure as the form draws it: the shown totals over both tables, then the text.
    const figureOf = (values: Record<string, unknown>) =>
        bigFigureText(shownDocumentTotals(values, null, 'USD', BILL_KIND.lineTables), 'USD')

    it('is a dash while an account amount does not parse', () => {
        const values = { account_lines: [account('125.00'), account('12..5')], item_lines: [] }
        expect(figureOf(values)).toBe('—')
    })

    it('is Too large when the bill total is over the stored-amount limit', () => {
        // Ten lines of 10^15 cents each: every line is at its limit, the total is past
        // 2^53 - 1.
        const lines = Array.from({ length: 10 }, () => account('10,000,000,000,000.00'))
        const values = { account_lines: lines, item_lines: [] as unknown[] }
        const subtotals = lineTableSubtotals(values, BILL_KIND.lineTables)
        const total = subtotals.reduce((sum, row) => sum + row.cents, 0)
        expect(total).toBeGreaterThan(maxStoredAmount)
        expect(figureOf(values)).toBe('Too large')
    })

    it('is the sum of both tables as money', () => {
        const values = {
            account_lines: [account('125.00'), account('-25.00')],
            item_lines: [
                {
                    id: 'p1',
                    kind: 'item',
                    product: 'prodwifiap00001',
                    quantity: 2,
                    rate: '121.40',
                },
            ],
        }
        const subtotals = lineTableSubtotals(values, BILL_KIND.lineTables)
        expect(subtotals.map(row => row.subtotal.label)).toEqual([
            'Account lines',
            'Products and services',
        ])
        expect(subtotals.map(row => row.cents)).toEqual([10_000, 24_280])
        const total = subtotals.reduce((sum, row) => sum + row.cents, 0)
        expect(bigFigureText({ isTooLarge: false, total }, 'USD')).toBe('$342.80')
    })
})

// The bill screen's reads over the harness's real collections (spec §3.9): each failing
// read is the error state, and Retry recovers exactly it; a read still loading is the
// loading state. Bills, their lines and vendors load on demand, as pbtsdb loads them.
describe('useDocumentScreen(BILL_DOCUMENT)', () => {
    const accountId = (number: string) => `acc-${number}`

    const BILL_ROWS: BooksBills[] = BILLS
    const LINE_ROWS: BooksBillLines[] = BILL_LINES.map(({ account_number, ...line }) => ({
        ...line,
        account: account_number ? accountId(account_number) : '',
    }))
    const VENDOR_ROWS: BooksVendors[] = VENDORS.map(({ expense_account_number, ...vendor }) => ({
        ...vendor,
        expense_account: expense_account_number ? accountId(expense_account_number) : '',
        name_key: '',
        sort_key: '',
    }))
    const NO_PRODUCTS: BooksProducts[] = []

    // The posted bill's payments (pay-bills spec §3.9, §4.4): one posted bill payment pays
    // part of it, and a void one paid it before. Only the posted one is listed.
    const postedVendorId = BILLS.find(bill => bill.id === BILL_IDS.posted)?.vendor ?? ''
    const paymentRow = (
        id: string,
        number: string,
        status: BooksBillPayments['status']
    ): BooksBillPayments => ({
        id,
        vendor: postedVendorId,
        paid_from: 'acct_bank_0001',
        payment_method: 'check',
        reference_no: '',
        status,
        number,
        sequence: Number(number),
        date: '2026-11-05',
        total: 10_000,
        currency: 'USD',
        entry: '',
        posted_at: '',
        posted_by: '',
        voided_at: '',
        voided_by: '',
        sort_key: '',
        created: '',
        updated: '',
        replaces: '',
        replaced_by: '',
    })
    const PAYMENT_ROWS: BooksBillPayments[] = [
        paymentRow('billpayposted01', '1004', 'posted'),
        paymentRow('billpayvoided01', '1003', 'void'),
    ]
    const paymentLineRow = (id: string, payment: string): BooksBillPaymentLines => ({
        id,
        payment,
        bill: BILL_IDS.posted,
        amount: 10_000,
        position: 0,
        created: '',
        updated: '',
    })
    const PAYMENT_LINE_ROWS: BooksBillPaymentLines[] = [
        paymentLineRow('billpaylinepos1', 'billpayposted01'),
        paymentLineRow('billpaylinevoi1', 'billpayvoided01'),
    ]

    type Refusals = {
        bill?: string
        lines?: string
        vendor?: string
        // The bill whose Payments read (its bill payment lines) is refused once.
        paymentLines?: string
    }

    // The registry after seedBooks: the bill collections, each refusing its first load of
    // the row (or the lines of the bill) a test names.
    function seed(
        opts: { level?: 'read_only' | 'bookkeeper' } & Refusals & {
                settingsFailsOnce?: boolean
                settingsNeverReady?: boolean
                paymentLinesNeverReady?: boolean
            } = {}
    ) {
        seedBooks({
            level: opts.level,
            settingsFailsOnce: opts.settingsFailsOnce,
            settingsNeverReady: opts.settingsNeverReady,
            ledger: { lines: [], entries: [], balances: [], settings: [SETTINGS] },
        })
        const bills = onDemandStore<BooksBills>('books_bills', BILL_ROWS, opts.bill)
        const lines = onDemandStore<BooksBillLines>(
            'books_bill_lines',
            LINE_ROWS,
            opts.lines === undefined ? undefined : { field: 'bill', value: opts.lines }
        )
        const vendors = onDemandStore<BooksVendors>('books_vendors', VENDOR_ROWS, opts.vendor)
        onDemandStore<BooksProducts>('books_products', NO_PRODUCTS)
        onDemandStore<BooksBillPayments>('books_bill_payments', PAYMENT_ROWS)
        const paymentLines = opts.paymentLinesNeverReady
            ? neverReadyStore<BooksBillPaymentLines>('books_bill_payment_lines')
            : onDemandStore<BooksBillPaymentLines>(
                  'books_bill_payment_lines',
                  PAYMENT_LINE_ROWS,
                  opts.paymentLines === undefined
                      ? undefined
                      : { field: 'bill', value: opts.paymentLines }
              )
        return { bills, lines, vendors, paymentLines }
    }

    function renderScreen(input: DocumentScreenInput) {
        return renderHook(() => useDocumentScreen(BILL_DOCUMENT, input))
    }

    const draftId = BILL_IDS.draft
    const postedId = BILL_IDS.posted
    const draftVendor = BILLS.find(bill => bill.id === draftId)?.vendor ?? ''
    const postedVendor = BILLS.find(bill => bill.id === postedId)?.vendor ?? ''

    it('opens a writer’s draft in the form and a posted bill in the read view', async () => {
        seed()
        const draft = renderScreen({ id: draftId })
        await waitFor(() => expect(draft.result.current.state).toBe('form'))
        const posted = renderScreen({ id: postedId })
        await waitFor(() => expect(posted.result.current.state).toBe('read'))
    })

    it('gives a non-writer at new the no-access state', async () => {
        seed({ level: 'read_only' })
        const hook = renderScreen({ id: null })
        await waitFor(() => expect(hook.result.current.state).toBe('no-access'))
    })

    it('gives a missing id the not-found state', async () => {
        seed()
        const hook = renderScreen({ id: 'billmissing0001' })
        await waitFor(() => expect(hook.result.current.state).toBe('not-found'))
    })

    it('gives ?replaces of a draft the cannot-edit state', async () => {
        seed()
        const hook = renderScreen({ id: null, replaces: draftId })
        await waitFor(() => expect(hook.result.current.state).toBe('cannot-edit'))
    })

    it('is loading while the settings read is not ready', async () => {
        seed({ settingsNeverReady: true })
        const hook = renderScreen({ id: null })
        await waitFor(() => expect(hook.result.current.state).toBe('loading'))
        expect(hook.result.current.state).toBe('loading')
    })

    it('shows a refused read of the bill as the error, and Retry recovers it', async () => {
        const { bills } = seed({ bill: draftId })
        expectLiveQueryError(bills.id)
        const hook = renderScreen({ id: draftId })
        await waitFor(() => expect(hook.result.current.state).toBe('error'))
        expect(hook.result.current.errorText).toBe('Books could not load this bill.')
        act(() => hook.result.current.retry())
        await waitFor(() => expect(hook.result.current.state).toBe('form'))
        expect(hook.result.current.record?.id).toBe(draftId)
    })

    it('shows a refused read of the bill’s lines as the error, and Retry recovers it', async () => {
        const { lines } = seed({ lines: draftId })
        expectLiveQueryError(lines.id)
        const hook = renderScreen({ id: draftId })
        await waitFor(() => expect(hook.result.current.state).toBe('error'))
        act(() => hook.result.current.retry())
        await waitFor(() => expect(hook.result.current.state).toBe('form'))
        expect(hook.result.current.lines?.map(line => line.id)).toEqual(
            LINE_ROWS.filter(line => line.bill === draftId).map(line => line.id)
        )
    })

    it('shows a refused read of the vendor as the error, and Retry recovers it', async () => {
        const { vendors } = seed({ vendor: draftVendor })
        expectLiveQueryError(vendors.id)
        const hook = renderScreen({ id: draftId })
        await waitFor(() => expect(hook.result.current.state).toBe('error'))
        act(() => hook.result.current.retry())
        await waitFor(() => expect(hook.result.current.state).toBe('form'))
        expect(hook.result.current.party?.id).toBe(draftVendor)
    })

    it('shows a refused read of the ?copy source as the error, and Retry recovers it', async () => {
        const { bills } = seed({ bill: postedId })
        expectLiveQueryError(bills.id)
        const hook = renderScreen({ id: null, copy: postedId })
        await waitFor(() => expect(hook.result.current.state).toBe('error'))
        act(() => hook.result.current.retry())
        await waitFor(() => expect(hook.result.current.state).toBe('form'))
        expect(hook.result.current.party?.id).toBe(postedVendor)
        expect(hook.result.current.startValues).toMatchObject({ vendor: postedVendor, ref_no: '' })
    })

    it('shows a refused read of the ?replaces source as the error, and Retry recovers it', async () => {
        const { bills } = seed({ bill: postedId })
        expectLiveQueryError(bills.id)
        const hook = renderScreen({ id: null, replaces: postedId })
        await waitFor(() => expect(hook.result.current.state).toBe('error'))
        act(() => hook.result.current.retry())
        await waitFor(() => expect(hook.result.current.state).toBe('form'))
        expect(hook.result.current.startValues).toMatchObject({
            vendor: postedVendor,
            replaces: postedId,
            ref_no: 'OSW-INV-558213',
        })
    })

    it('shows a refused settings read as the error, and Retry recovers it', async () => {
        seed({ settingsFailsOnce: true })
        expectLiveQueryError(settingsStore().id)
        const hook = renderScreen({ id: null })
        await waitFor(() => expect(hook.result.current.state).toBe('error'))
        act(() => hook.result.current.retry())
        await waitFor(() => expect(hook.result.current.state).toBe('form'))
        expect(hook.result.current.start).toEqual({ kind: 'bill', purchaseLines: 'both' })
    })

    // Pay bills §3.9, §4.4: a posted bill's Payments block reads its bill payment lines with
    // their payments; the read joins the screen's state, and Retry reruns it.
    it('lists a posted bill’s posted payments, not its void ones', async () => {
        seed()
        const hook = renderScreen({ id: postedId })
        await waitFor(() => expect(hook.result.current.state).toBe('read'))
        await waitFor(() =>
            expect(hook.result.current.documentPayments.map(payment => payment.payment)).toEqual([
                'billpayposted01',
            ])
        )
        expect(hook.result.current.documentPayments[0]).toMatchObject({
            id: 'billpaylinepos1',
            amount: 10_000,
            payment: 'billpayposted01',
            number: '1004',
            date: '2026-11-05',
        })
    })

    it('shows a refused Payments read of a bill as the error, and Retry reruns it', async () => {
        const { paymentLines } = seed({ paymentLines: postedId })
        expectLiveQueryError(paymentLines.id)
        const hook = renderScreen({ id: postedId })
        await waitFor(() => expect(hook.result.current.state).toBe('error'))
        expect(hook.result.current.errorText).toBe('Books could not load this bill.')
        act(() => hook.result.current.retry())
        await waitFor(() => expect(hook.result.current.state).toBe('read'))
        await waitFor(() =>
            expect(hook.result.current.documentPayments.map(payment => payment.payment)).toEqual([
                'billpayposted01',
            ])
        )
    })

    it('keeps a posted bill loading while its Payments read is not ready', async () => {
        seed({ paymentLinesNeverReady: true })
        const hook = renderScreen({ id: postedId })
        // The bill and its lines have loaded; only the Payments read is pending.
        await waitFor(() => {
            expect(hook.result.current.record?.id).toBe(postedId)
            expect(hook.result.current.lines?.length).toBeGreaterThan(0)
        })
        expect(hook.result.current.state).toBe('loading')
    })
})

// The expense's states (expense spec §3.9) and the texts its screen shows for them.
describe('documentScreenState for an expense', () => {
    // Read inside each test, so a missing kind fails those tests and not the file.
    const texts = () => EXPENSE_KIND.messages

    it('a non-writer at books/expenses/new gets no-access with the expense text', () => {
        expect(documentScreenState({ ...NEW, canWrite: false })).toBe('no-access')
        expect(texts().noAccess).toBe('You need bookkeeper access to create expenses')
    })

    it('an id with no row is not-found with the expense text', () => {
        expect(documentScreenState({ ...DRAFT, status: null })).toBe('not-found')
        expect(texts().notFound).toBe('This expense does not exist')
    })

    it('a correction of a draft cannot be edited, with the expense text', () => {
        expect(documentScreenState({ ...NEW, replacesStatus: 'draft' })).toBe('cannot-edit')
        expect(texts().cannotEdit).toBe('This expense cannot be edited')
    })

    it('a failed load is the error with the expense text', () => {
        expect(documentScreenState({ ...DRAFT, isError: true })).toBe('error')
        expect(texts().loadFailed).toBe('Books could not load this expense.')
    })

    it('posts: the expense kind has the posting lifecycle', () => {
        expect(EXPENSE_KIND.lifecycle).toBe('posting')
        expect(EXPENSE_DOCUMENT.doc).toBe(EXPENSE_KIND)
    })
})

// The big figure (Amount paid) over the expense's two tables, summed by the shared helper.
describe('the expense big figure', () => {
    const account = (amount: string) => ({ id: `a${amount}`, kind: 'account', amount })

    const figureOf = (values: Record<string, unknown>) =>
        bigFigureText(shownDocumentTotals(values, null, 'USD', EXPENSE_KIND.lineTables), 'USD')

    it('is a dash while an account amount does not parse', () => {
        const values = { account_lines: [account('125.00'), account('12..5')], item_lines: [] }
        expect(figureOf(values)).toBe('—')
    })

    it('is Too large when the expense total is over the stored-amount limit', () => {
        const lines = Array.from({ length: 10 }, () => account('10,000,000,000,000.00'))
        const values = { account_lines: lines, item_lines: [] as unknown[] }
        const subtotals = lineTableSubtotals(values, EXPENSE_KIND.lineTables)
        const total = subtotals.reduce((sum, row) => sum + row.cents, 0)
        expect(total).toBeGreaterThan(maxStoredAmount)
        expect(figureOf(values)).toBe('Too large')
    })

    it('is the sum of both tables as money', () => {
        const values = {
            account_lines: [account('125.00'), account('-25.00')],
            item_lines: [
                { id: 'p1', kind: 'item', product: 'prodwifiap00001', quantity: 2, rate: '121.40' },
            ],
        }
        expect(figureOf(values)).toBe('$342.80')
    })
})

// The expense screen's reads over the harness's real collections (expense spec §3.9):
// each failing read is the error state, and Retry recovers exactly it; a read still
// loading is the loading state. Paid from reads the harness chart's accounts with their
// balances (`usePaidFromAccounts`), so a fixture expense's Paid from is mapped onto that
// chart by number.
describe('useDocumentScreen(EXPENSE_DOCUMENT)', () => {
    const lineAccountId = (number: string) => `acc-${number}`
    const PAID_FROM_IDS: Record<string, string> = {
        '1000': 'acct_bank_0001',
        '2100': 'acct_cc_00001',
    }
    const paidFromId = (number: string) => {
        const id = PAID_FROM_IDS[number]
        if (!id) throw new Error(`no harness account for ${number}`)
        return id
    }

    const EXPENSE_ROWS: BooksExpenses[] = EXPENSES.map(({ paid_from_number, ...row }) => ({
        ...row,
        paid_from: paidFromId(paid_from_number),
    }))
    const LINE_ROWS: BooksExpenseLines[] = EXPENSE_LINES.map(({ account_number, ...line }) => ({
        ...line,
        account: account_number ? lineAccountId(account_number) : '',
    }))
    const VENDOR_ROWS: BooksVendors[] = VENDORS.map(({ expense_account_number, ...vendor }) => ({
        ...vendor,
        expense_account: expense_account_number ? lineAccountId(expense_account_number) : '',
        name_key: '',
        sort_key: '',
    }))
    const NO_PRODUCTS: BooksProducts[] = []

    type Refusals = {
        expense?: string
        lines?: string
        vendor?: string
    }

    function seed(
        opts: { level?: 'read_only' | 'bookkeeper' } & Refusals & {
                settingsFailsOnce?: boolean
                settingsNeverReady?: boolean
                accountsFailsOnce?: boolean
                accountsNeverReady?: boolean
                holdAccountsRead?: boolean
                purchaseLines?: BooksSettings['purchase_lines']
            } = {}
    ) {
        const settings = { ...SETTINGS, purchase_lines: opts.purchaseLines ?? 'both' }
        seedBooks({
            level: opts.level,
            settingsFailsOnce: opts.settingsFailsOnce,
            settingsNeverReady: opts.settingsNeverReady,
            accountsFailsOnce: opts.accountsFailsOnce,
            accountsNeverReady: opts.accountsNeverReady,
            holdAccountsRead: opts.holdAccountsRead,
            ledger: { lines: [], entries: [], balances: [], settings: [settings] },
        })
        const expenses = onDemandStore<BooksExpenses>('books_expenses', EXPENSE_ROWS, opts.expense)
        const lines = onDemandStore<BooksExpenseLines>(
            'books_expense_lines',
            LINE_ROWS,
            opts.lines === undefined ? undefined : { field: 'expense', value: opts.lines }
        )
        const vendors = onDemandStore<BooksVendors>('books_vendors', VENDOR_ROWS, opts.vendor)
        onDemandStore<BooksProducts>('books_products', NO_PRODUCTS)
        return { expenses, lines, vendors }
    }

    function renderScreen(input: DocumentScreenInput) {
        return renderHook(() => useDocumentScreen(EXPENSE_DOCUMENT, input))
    }

    const draftId = EXPENSE_IDS.draft
    const postedId = EXPENSE_IDS.officeSupply
    const correctedId = EXPENSE_IDS.pacificPower
    const postedVendor = EXPENSES.find(row => row.id === postedId)?.vendor ?? ''

    it('opens a writer’s draft in the form and a posted expense in the read view', async () => {
        seed()
        const draft = renderScreen({ id: draftId })
        await waitFor(() => expect(draft.result.current.state).toBe('form'))
        const posted = renderScreen({ id: postedId })
        await waitFor(() => expect(posted.result.current.state).toBe('read'))
    })

    it('gives a non-writer at new the no-access state', async () => {
        seed({ level: 'read_only' })
        const hook = renderScreen({ id: null })
        await waitFor(() => expect(hook.result.current.state).toBe('no-access'))
    })

    it('gives a missing id the not-found state', async () => {
        seed()
        const hook = renderScreen({ id: 'expmissing00001' })
        await waitFor(() => expect(hook.result.current.state).toBe('not-found'))
    })

    it('gives ?replaces of a draft the cannot-edit state', async () => {
        seed()
        const hook = renderScreen({ id: null, replaces: draftId })
        await waitFor(() => expect(hook.result.current.state).toBe('cannot-edit'))
    })

    // The first render is loading for every read, so each loading case waits until every
    // OTHER read has settled (its data is on the hook) and then reads the state.
    it('is not loading on a new expense once every read is ready', async () => {
        seed()
        const hook = renderScreen({ id: null })
        await waitFor(() => expect(hook.result.current.state).toBe('form'))
    })

    it('is loading while the settings read is not ready', async () => {
        seed({ settingsNeverReady: true })
        const hook = renderScreen({ id: null })
        // Access, tax options and the Paid from accounts have all settled.
        await waitFor(() => {
            const screen = hook.result.current
            const start = screen.start
            expect(screen.canWrite).toBe(true)
            expect(screen.taxOptions.isReady).toBe(true)
            expect(start?.kind === 'expense' && start.activePaidFromIds.size > 0).toBe(true)
        })
        expect(hook.result.current.state).toBe('loading')
    })

    it('is loading while the Paid from accounts read is not ready', async () => {
        seed({ holdAccountsRead: true, purchaseLines: 'accounts' })
        const hook = renderScreen({ id: null })
        // Access, tax options and the settings row (its Purchase lines) have all settled;
        // only the held accounts read is pending.
        await waitFor(() => {
            const screen = hook.result.current
            const start = screen.start
            expect(screen.canWrite).toBe(true)
            expect(screen.taxOptions.isReady).toBe(true)
            expect(start?.kind === 'expense' && start.purchaseLines).toBe('accounts')
        })
        const start = hook.result.current.start
        expect(start?.kind === 'expense' && start.activePaidFromIds.size).toBe(0)
        expect(hook.result.current.state).toBe('loading')
        act(() => releaseAccountsRead())
        await waitFor(() => expect(hook.result.current.state).toBe('form'))
    })

    it('shows a refused read of the expense as the error, and Retry recovers it', async () => {
        const { expenses } = seed({ expense: draftId })
        expectLiveQueryError(expenses.id)
        const hook = renderScreen({ id: draftId })
        await waitFor(() => expect(hook.result.current.state).toBe('error'))
        expect(hook.result.current.errorText).toBe('Books could not load this expense.')
        act(() => hook.result.current.retry())
        await waitFor(() => expect(hook.result.current.state).toBe('form'))
        expect(hook.result.current.record?.id).toBe(draftId)
    })

    it('shows a refused read of the expense’s lines as the error, and Retry recovers it', async () => {
        const { lines } = seed({ lines: draftId })
        expectLiveQueryError(lines.id)
        const hook = renderScreen({ id: draftId })
        await waitFor(() => expect(hook.result.current.state).toBe('error'))
        act(() => hook.result.current.retry())
        await waitFor(() => expect(hook.result.current.state).toBe('form'))
        expect(hook.result.current.lines?.map(line => line.id)).toEqual(
            LINE_ROWS.filter(line => line.expense === draftId).map(line => line.id)
        )
    })

    it('shows a refused read of the ?vendor vendor as the error, and Retry recovers it', async () => {
        const { vendors } = seed({ vendor: VENDOR_IDS.summit })
        expectLiveQueryError(vendors.id)
        const hook = renderScreen({ id: null, vendor: VENDOR_IDS.summit })
        await waitFor(() => expect(hook.result.current.state).toBe('error'))
        act(() => hook.result.current.retry())
        await waitFor(() => expect(hook.result.current.state).toBe('form'))
        expect(hook.result.current.party?.id).toBe(VENDOR_IDS.summit)
    })

    it('shows a refused read of the ?copy source as the error, and Retry recovers it', async () => {
        const { expenses } = seed({ expense: postedId })
        expectLiveQueryError(expenses.id)
        const hook = renderScreen({ id: null, copy: postedId })
        await waitFor(() => expect(hook.result.current.state).toBe('error'))
        act(() => hook.result.current.retry())
        await waitFor(() => expect(hook.result.current.state).toBe('form'))
        expect(hook.result.current.startValues).toMatchObject({
            vendor: postedVendor,
            paid_from: paidFromId('2100'),
            payment_method: 'credit_card',
            reference_no: '',
        })
    })

    it('shows a refused read of the ?replaces source as the error, and Retry recovers it', async () => {
        const { expenses } = seed({ expense: correctedId })
        expectLiveQueryError(expenses.id)
        const hook = renderScreen({ id: null, replaces: correctedId })
        await waitFor(() => expect(hook.result.current.state).toBe('error'))
        act(() => hook.result.current.retry())
        await waitFor(() => expect(hook.result.current.state).toBe('form'))
        expect(hook.result.current.startValues).toMatchObject({
            replaces: correctedId,
            paid_from: paidFromId('1000'),
            reference_no: '1042',
        })
    })

    it('shows a refused settings read as the error, and Retry recovers it', async () => {
        seed({ settingsFailsOnce: true })
        expectLiveQueryError(settingsStore().id)
        const hook = renderScreen({ id: null })
        await waitFor(() => expect(hook.result.current.state).toBe('error'))
        act(() => hook.result.current.retry())
        await waitFor(() => expect(hook.result.current.state).toBe('form'))
        expect(hook.result.current.start).toMatchObject({ kind: 'expense', purchaseLines: 'both' })
    })

    it('shows a refused Paid from accounts read as the error, and Retry recovers it', async () => {
        seed({ accountsFailsOnce: true })
        expectLiveQueryError(accountsStore().id)
        const hook = renderScreen({ id: null })
        await waitFor(() => expect(hook.result.current.state).toBe('error'))
        act(() => hook.result.current.retry())
        await waitFor(() => expect(hook.result.current.state).toBe('form'))
        const start = hook.result.current.start
        if (start?.kind !== 'expense') throw new Error('not an expense start')
        expect(start.activePaidFromIds.has(paidFromId('1000'))).toBe(true)
        expect(start.activePaidFromIds.has(paidFromId('2100'))).toBe(true)
        expect(start.activePaidFromIds.has('acct_ar_00001')).toBe(false)
    })
})

// The vendor credit's states (vendor credit spec §3.7) and the texts its screen shows for
// them.
describe('documentScreenState for a vendor credit', () => {
    // Read inside each test, so a missing kind fails those tests and not the file.
    const texts = () => VENDOR_CREDIT_KIND.messages

    it('a non-writer at books/vendor-credits/new gets no-access with the vendor credit text', () => {
        expect(documentScreenState({ ...NEW, canWrite: false })).toBe('no-access')
        expect(texts().noAccess).toBe('You need bookkeeper access to create vendor credits')
    })

    it('an id with no row is not-found with the vendor credit text', () => {
        expect(documentScreenState({ ...DRAFT, status: null })).toBe('not-found')
        expect(texts().notFound).toBe('This vendor credit does not exist')
    })

    it('a correction of a draft cannot be edited, with the vendor credit text', () => {
        expect(documentScreenState({ ...NEW, replacesStatus: 'draft' })).toBe('cannot-edit')
        expect(texts().cannotEdit).toBe('This vendor credit cannot be edited')
    })

    it('a failed load is the error with the vendor credit text', () => {
        expect(documentScreenState({ ...DRAFT, isError: true })).toBe('error')
        expect(texts().loadFailed).toBe('Books could not load this vendor credit.')
    })

    it('posts: the vendor credit kind has the posting lifecycle', () => {
        expect(VENDOR_CREDIT_KIND.lifecycle).toBe('posting')
        expect(VENDOR_CREDIT_DOCUMENT.doc).toBe(VENDOR_CREDIT_KIND)
    })
})

// The vendor credit screen's reads over the harness's real collections (vendor credit
// spec §3.7, §4 Client reads): each failing read is the error state with the vendor
// credit's text, and Retry recovers exactly it.
describe('useDocumentScreen(VENDOR_CREDIT_DOCUMENT)', () => {
    const accountId = (number: string) => `acc-${number}`

    const CREDIT_ROWS: BooksVendorCredits[] = VENDOR_CREDITS
    const LINE_ROWS: BooksVendorCreditLines[] = VENDOR_CREDIT_LINES.map(
        ({ account_number, ...line }) => ({
            ...line,
            account: account_number ? accountId(account_number) : '',
        })
    )
    const VENDOR_ROWS: BooksVendors[] = VENDORS.map(({ expense_account_number, ...vendor }) => ({
        ...vendor,
        expense_account: expense_account_number ? accountId(expense_account_number) : '',
        name_key: '',
        sort_key: '',
    }))
    const NO_PRODUCTS: BooksProducts[] = []

    type Refusals = {
        credit?: string
        lines?: string
        vendor?: string
    }

    function seed(
        opts: { level?: 'read_only' | 'bookkeeper' } & Refusals & {
                settingsFailsOnce?: boolean
                purchaseLines?: BooksSettings['purchase_lines']
            } = {}
    ) {
        const settings = { ...SETTINGS, purchase_lines: opts.purchaseLines ?? 'both' }
        seedBooks({
            level: opts.level,
            settingsFailsOnce: opts.settingsFailsOnce,
            ledger: { lines: [], entries: [], balances: [], settings: [settings] },
        })
        const credits = onDemandStore<BooksVendorCredits>(
            'books_vendor_credits',
            CREDIT_ROWS,
            opts.credit
        )
        const lines = onDemandStore<BooksVendorCreditLines>(
            'books_vendor_credit_lines',
            LINE_ROWS,
            opts.lines === undefined ? undefined : { field: 'vendor_credit', value: opts.lines }
        )
        const vendors = onDemandStore<BooksVendors>('books_vendors', VENDOR_ROWS, opts.vendor)
        onDemandStore<BooksProducts>('books_products', NO_PRODUCTS)
        return { credits, lines, vendors }
    }

    function renderScreen(input: DocumentScreenInput) {
        return renderHook(() => useDocumentScreen(VENDOR_CREDIT_DOCUMENT, input))
    }

    const draftId = VENDOR_CREDIT_IDS.draft
    const postedId = VENDOR_CREDIT_IDS.unapplied
    const draftVendor = VENDOR_CREDITS.find(row => row.id === draftId)?.vendor ?? ''
    const postedVendor = VENDOR_CREDITS.find(row => row.id === postedId)?.vendor ?? ''

    it('opens a writer’s draft in the form and a posted credit in the read view', async () => {
        seed()
        const draft = renderScreen({ id: draftId })
        await waitFor(() => expect(draft.result.current.state).toBe('form'))
        const posted = renderScreen({ id: postedId })
        await waitFor(() => expect(posted.result.current.state).toBe('read'))
    })

    it('gives a non-writer at new the no-access state', async () => {
        seed({ level: 'read_only' })
        const hook = renderScreen({ id: null })
        await waitFor(() => expect(hook.result.current.state).toBe('no-access'))
    })

    it('gives a missing id the not-found state', async () => {
        seed()
        const hook = renderScreen({ id: 'vcrdmissing0001' })
        await waitFor(() => expect(hook.result.current.state).toBe('not-found'))
    })

    it('gives ?replaces of a draft the cannot-edit state', async () => {
        seed()
        const hook = renderScreen({ id: null, replaces: draftId })
        await waitFor(() => expect(hook.result.current.state).toBe('cannot-edit'))
    })

    it('shows a refused read of the credit as the error, and Retry recovers it', async () => {
        const { credits } = seed({ credit: draftId })
        expectLiveQueryError(credits.id)
        const hook = renderScreen({ id: draftId })
        await waitFor(() => expect(hook.result.current.state).toBe('error'))
        expect(hook.result.current.errorText).toBe('Books could not load this vendor credit.')
        act(() => hook.result.current.retry())
        await waitFor(() => expect(hook.result.current.state).toBe('form'))
        expect(hook.result.current.record?.id).toBe(draftId)
    })

    it('shows a refused read of the credit’s lines as the error, and Retry recovers it', async () => {
        const { lines } = seed({ lines: draftId })
        expectLiveQueryError(lines.id)
        const hook = renderScreen({ id: draftId })
        await waitFor(() => expect(hook.result.current.state).toBe('error'))
        act(() => hook.result.current.retry())
        await waitFor(() => expect(hook.result.current.state).toBe('form'))
        expect(hook.result.current.lines?.map(line => line.id)).toEqual(
            LINE_ROWS.filter(line => line.vendor_credit === draftId).map(line => line.id)
        )
    })

    it('shows a refused read of the vendor as the error, and Retry recovers it', async () => {
        const { vendors } = seed({ vendor: draftVendor })
        expectLiveQueryError(vendors.id)
        const hook = renderScreen({ id: draftId })
        await waitFor(() => expect(hook.result.current.state).toBe('error'))
        act(() => hook.result.current.retry())
        await waitFor(() => expect(hook.result.current.state).toBe('form'))
        expect(hook.result.current.party?.id).toBe(draftVendor)
    })

    it('shows a refused read of the ?copy source as the error, and Retry recovers it', async () => {
        const { credits } = seed({ credit: postedId })
        expectLiveQueryError(credits.id)
        const hook = renderScreen({ id: null, copy: postedId })
        await waitFor(() => expect(hook.result.current.state).toBe('error'))
        act(() => hook.result.current.retry())
        await waitFor(() => expect(hook.result.current.state).toBe('form'))
        expect(hook.result.current.startValues).toMatchObject({ vendor: postedVendor, ref_no: '' })
    })

    it('shows a refused read of the ?replaces source as the error, and Retry recovers it', async () => {
        const { credits } = seed({ credit: postedId })
        expectLiveQueryError(credits.id)
        const hook = renderScreen({ id: null, replaces: postedId })
        await waitFor(() => expect(hook.result.current.state).toBe('error'))
        act(() => hook.result.current.retry())
        await waitFor(() => expect(hook.result.current.state).toBe('form'))
        expect(hook.result.current.startValues).toMatchObject({
            vendor: postedVendor,
            replaces: postedId,
            ref_no: 'CM-8841',
        })
    })

    it('shows a refused settings read as the error, and Retry recovers it', async () => {
        seed({ settingsFailsOnce: true, purchaseLines: 'products' })
        expectLiveQueryError(settingsStore().id)
        const hook = renderScreen({ id: null })
        await waitFor(() => expect(hook.result.current.state).toBe('error'))
        act(() => hook.result.current.retry())
        await waitFor(() => expect(hook.result.current.state).toBe('form'))
        expect(hook.result.current.start).toMatchObject({
            kind: 'vendor_credit',
            purchaseLines: 'products',
        })
    })
})
