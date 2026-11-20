import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    type ApplyCreditSchemaInput,
    type ApplyCreditValues,
    type ApplyRow,
    appliedToastText,
    applyCreditSchema,
    applyDefaultDate,
    applyDialogState,
    applyNoticeVisible,
    applyRefusalTarget,
    applySummaryText,
    sortApplyRows,
    spreadForDocument,
} from '../tinycld/books/lib/apply-credit-schema'
import {
    CREDIT_MEMO_APPLICATION,
    type CreditApplicationKind,
    VENDOR_CREDIT_APPLICATION,
} from '../tinycld/books/lib/credit-application-kinds'
import { amountToApply } from '../tinycld/books/lib/payment-allocation'

// The apply dialog's one zod schema for its three uses (apply credit spec §3.4, plan
// decision 3): vendor credit → bills and credit memo → invoices (`from: 'credit'`, the
// credit fixed) and invoice ← credit memos (`from: 'document'`, the invoice fixed). The
// Apply date reports under `date`, each row under its Credit to apply cell
// (`payments.<row id>.amount`), the sum against the fixed side and "at least one" at the
// root. And the dialog's pure helpers: the state of its body, where a refusal shows, the
// default date, the spread from an invoice, the list order, the notice, the texts.

const USD = 'USD'

// --- The shared case table (server/testdata/credit_application_cases.json). ---

type CreditApplicationCase = {
    name: string
    kind: 'vendor_credit' | 'credit_memo'
    creditDate: string
    closeDate: string
    hasOverride: boolean
    date: string
    creditBalance: number
    documentBalance: number
    amount: number
    goField: string
    tsField: '' | 'date' | 'row' | 'root'
    tsMessage: string
    go?: boolean
}

const CASES: CreditApplicationCase[] = JSON.parse(
    readFileSync(
        join(__dirname, '..', 'server', 'testdata', 'credit_application_cases.json'),
        'utf8'
    )
)

const KINDS: Record<CreditApplicationCase['kind'], CreditApplicationKind> = {
    vendor_credit: VENDOR_CREDIT_APPLICATION,
    credit_memo: CREDIT_MEMO_APPLICATION,
}

const CASE_ROW = 'casedocument001'

function centsText(cents: number) {
    return (cents / 100).toFixed(2)
}

function issuesOf(input: ApplyCreditSchemaInput, values: ApplyCreditValues) {
    const result = applyCreditSchema(input).safeParse(values)
    if (result.success) return []
    return result.error.issues.map(issue => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
    }))
}

function messagesAt(input: ApplyCreditSchemaInput, values: ApplyCreditValues, path: string) {
    return issuesOf(input, values)
        .filter(issue => issue.path === path)
        .map(issue => issue.message)
}

function casePath(field: CreditApplicationCase['tsField']) {
    if (field === 'row') return `payments.${CASE_ROW}.amount`
    return field
}

describe('applyCreditSchema: the shared case table, from the credit', () => {
    const tsCases = CASES.filter(c => c.go !== true)

    it('reads TypeScript cases of both kinds', () => {
        expect(tsCases.some(c => c.kind === 'vendor_credit')).toBe(true)
        expect(tsCases.some(c => c.kind === 'credit_memo')).toBe(true)
    })

    for (const c of tsCases) {
        it(c.name, () => {
            const row: ApplyRow = {
                id: CASE_ROW,
                number: '1001',
                date: '2026-11-01',
                due_date: '2026-12-01',
                total: c.documentBalance,
                open: c.documentBalance,
            }
            const input: ApplyCreditSchemaInput = {
                texts: KINDS[c.kind].texts,
                from: 'credit',
                creditDate: c.creditDate,
                closeDate: c.closeDate,
                hasOverride: c.hasOverride,
                fixedCents: c.creditBalance,
                rows: [row],
                currency: USD,
            }
            const values: ApplyCreditValues = {
                date: c.date,
                payments: {
                    [CASE_ROW]: { amount: centsText(c.amount), open: row.open, number: row.number },
                },
            }
            if (c.tsField === '') {
                expect(issuesOf(input, values)).toEqual([])
                return
            }
            const messages = messagesAt(input, values, casePath(c.tsField))
            if (c.tsMessage === '') expect(messages.length).toBeGreaterThan(0)
            else expect(messages).toEqual([c.tsMessage])
        })
    }
})

// --- From an invoice: the credit memos are the rows, the invoice's balance is fixed. ---

const MEMO_1001: ApplyRow = {
    id: 'memo10010000001',
    number: '1001',
    date: '2026-11-10',
    due_date: '2026-11-10',
    creditDate: '2026-11-10',
    total: 25_000,
    open: 25_000,
}
const MEMO_1002: ApplyRow = {
    id: 'memo10020000001',
    number: '1002',
    date: '2026-11-12',
    due_date: '2026-11-12',
    creditDate: '2026-11-12',
    total: 30_000,
    open: 20_000,
}

const FROM_INVOICE: ApplyCreditSchemaInput = {
    texts: CREDIT_MEMO_APPLICATION.texts,
    from: 'document',
    creditDate: '',
    closeDate: '',
    hasOverride: false,
    // The invoice's open balance.
    fixedCents: 40_000,
    rows: [MEMO_1001, MEMO_1002],
    currency: USD,
}

function entry(row: ApplyRow, amount: string) {
    return { amount, open: row.open, number: row.number }
}

describe('applyCreditSchema: from an invoice', () => {
    it('refuses a row above its memo’s unapplied credit under that row', () => {
        const values = {
            date: '2026-11-16',
            payments: { [MEMO_1001.id]: entry(MEMO_1001, '250.01') },
        }
        expect(messagesAt(FROM_INVOICE, values, `payments.${MEMO_1001.id}.amount`)).toEqual([
            'More than the unapplied credit of $250.00',
        ])
    })

    it('refuses a sum above the invoice’s open balance at the root', () => {
        const values = {
            date: '2026-11-16',
            payments: {
                [MEMO_1001.id]: entry(MEMO_1001, '250.00'),
                [MEMO_1002.id]: entry(MEMO_1002, '200.00'),
            },
        }
        expect(messagesAt(FROM_INVOICE, values, 'root')).toEqual([
            'More than the open balance of $400.00.',
        ])
        expect(messagesAt(FROM_INVOICE, values, `payments.${MEMO_1001.id}.amount`)).toEqual([])
        expect(messagesAt(FROM_INVOICE, values, `payments.${MEMO_1002.id}.amount`)).toEqual([])
    })

    it('asks for at least one credit memo at the root', () => {
        expect(messagesAt(FROM_INVOICE, { date: '2026-11-16', payments: {} }, 'root')).toEqual([
            'Select at least one credit memo.',
        ])
    })

    it('names the ticked memo whose credit date is after the apply date', () => {
        const values = {
            date: '2026-11-11',
            payments: { [MEMO_1002.id]: entry(MEMO_1002, '50.00') },
        }
        expect(messagesAt(FROM_INVOICE, values, 'date')).toEqual([
            "The apply date can't be before the credit date of credit memo 1002, Nov 12, 2026.",
        ])
    })

    it('names the ticked memo with the latest credit date when two are after the date', () => {
        const values = {
            date: '2026-11-09',
            payments: {
                [MEMO_1001.id]: entry(MEMO_1001, '50.00'),
                [MEMO_1002.id]: entry(MEMO_1002, '50.00'),
            },
        }
        expect(messagesAt(FROM_INVOICE, values, 'date')).toEqual([
            "The apply date can't be before the credit date of credit memo 1002, Nov 12, 2026.",
        ])
    })

    it('gives no date issue when the later memo is not ticked', () => {
        const values = {
            date: '2026-11-11',
            payments: { [MEMO_1001.id]: entry(MEMO_1001, '50.00') },
        }
        expect(messagesAt(FROM_INVOICE, values, 'date')).toEqual([])
        expect(issuesOf(FROM_INVOICE, values)).toEqual([])
    })

    it('refuses a day on or before the close date unless the user holds an override', () => {
        const closed = { ...FROM_INVOICE, closeDate: '2026-11-16' }
        const values = {
            date: '2026-11-16',
            payments: { [MEMO_1001.id]: entry(MEMO_1001, '50.00') },
        }
        expect(messagesAt(closed, values, 'date')).toEqual([
            'Books are closed through Nov 16, 2026. Pick a later date.',
        ])
        expect(issuesOf({ ...closed, hasOverride: true }, values)).toEqual([])
    })

    // A memo that left the list (applied or voided elsewhere) can keep an entry in the
    // form's payments; the dialog draws no row for it, so no rule counts it.
    const GONE = 'memogone0000001'
    const gone = { amount: '300.00', open: 10_000, number: '1009' }

    it('does not count a memo that left the list in the sum or its own limit', () => {
        const values = {
            date: '2026-11-16',
            payments: { [MEMO_1001.id]: entry(MEMO_1001, '250.00'), [GONE]: gone },
        }
        expect(issuesOf(FROM_INVOICE, values)).toEqual([])
    })

    it('asks for at least one credit memo when only a memo that left the list is above zero', () => {
        expect(
            messagesAt(FROM_INVOICE, { date: '2026-11-16', payments: { [GONE]: gone } }, 'root')
        ).toEqual(['Select at least one credit memo.'])
    })

    it('passes a valid set, which sums to integer cents', () => {
        const values = {
            date: '2026-11-16',
            payments: {
                [MEMO_1001.id]: entry(MEMO_1001, '250.00'),
                [MEMO_1002.id]: entry(MEMO_1002, '80.10'),
            },
        }
        const result = applyCreditSchema(FROM_INVOICE).safeParse(values)
        expect(result.success).toBe(true)
        if (!result.success) return
        expect(amountToApply(result.data.payments, USD)).toBe(33_010)
    })
})

describe('applyCreditSchema: from a credit memo', () => {
    const INVOICE: ApplyRow = {
        id: 'invoice00000001',
        number: '1009',
        date: '2026-09-14',
        due_date: '2026-10-14',
        total: 40_000,
        open: 40_000,
    }
    const FROM_MEMO: ApplyCreditSchemaInput = {
        texts: CREDIT_MEMO_APPLICATION.texts,
        from: 'credit',
        creditDate: '2026-11-12',
        closeDate: '',
        hasOverride: false,
        fixedCents: 25_000,
        rows: [INVOICE],
        currency: USD,
    }

    it('reads the memo’s texts: the row limit, the sum, at least one invoice', () => {
        const over = { date: '2026-11-16', payments: { [INVOICE.id]: entry(INVOICE, '400.01') } }
        expect(messagesAt(FROM_MEMO, over, `payments.${INVOICE.id}.amount`)).toEqual([
            'More than the open balance of $400.00',
        ])
        expect(messagesAt(FROM_MEMO, over, 'root')).toEqual([
            'More than the unapplied credit of $250.00.',
        ])
        expect(messagesAt(FROM_MEMO, { date: '2026-11-16', payments: {} }, 'root')).toEqual([
            'Select at least one invoice.',
        ])
    })
})

describe('applyDefaultDate', () => {
    it('gives today with no credit date, or with every credit date before today', () => {
        expect(applyDefaultDate('2026-11-19', [])).toBe('2026-11-19')
        expect(applyDefaultDate('2026-11-19', ['2026-11-12', '2026-11-19'])).toBe('2026-11-19')
    })

    it('gives the latest credit date when it is later than today', () => {
        expect(applyDefaultDate('2026-11-19', ['2026-11-20', '2026-11-25', '2026-11-12'])).toBe(
            '2026-11-25'
        )
    })
})

describe('spreadForDocument', () => {
    it('places credit in list order, each memo up to its unapplied credit, up to the open balance', () => {
        const amounts = (payments: ReturnType<typeof spreadForDocument>) =>
            Object.fromEntries(Object.entries(payments).map(([id, e]) => [id, e.amount]))
        expect(amounts(spreadForDocument([MEMO_1001, MEMO_1002], 30_000))).toEqual({
            [MEMO_1001.id]: '250.00',
            [MEMO_1002.id]: '50.00',
        })
        expect(amounts(spreadForDocument([MEMO_1002, MEMO_1001], 30_000))).toEqual({
            [MEMO_1002.id]: '200.00',
            [MEMO_1001.id]: '100.00',
        })
        expect(amounts(spreadForDocument([MEMO_1001, MEMO_1002], 100_000))).toEqual({
            [MEMO_1001.id]: '250.00',
            [MEMO_1002.id]: '200.00',
        })
        expect(spreadForDocument([MEMO_1001, MEMO_1002], 0)).toEqual({})
    })
})

describe('applyDialogState', () => {
    const READY = {
        isLoading: false,
        hasLoadError: false,
        rowCount: 2,
        writesAvailable: true,
        isHeld: false,
    }

    it('shows the rows and lets a writer submit', () => {
        expect(applyDialogState(READY)).toEqual({
            body: 'rows',
            canSubmit: true,
            fieldsDisabled: false,
        })
    })

    it('shows the skeleton while loading, and no submit', () => {
        const state = applyDialogState({ ...READY, isLoading: true, rowCount: 0 })
        expect(state.body).toBe('loading')
        expect(state.canSubmit).toBe(false)
    })

    it('shows the load error after a failed read, and no submit', () => {
        const state = applyDialogState({ ...READY, hasLoadError: true, rowCount: 0 })
        expect(state.body).toBe('load-error')
        expect(state.canSubmit).toBe(false)
    })

    it('shows the empty state with no row, and no submit', () => {
        const state = applyDialogState({ ...READY, rowCount: 0 })
        expect(state.body).toBe('empty')
        expect(state.canSubmit).toBe(false)
    })

    it('keeps the rows but no submit while offline', () => {
        const state = applyDialogState({ ...READY, writesAvailable: false })
        expect(state.body).toBe('rows')
        expect(state.canSubmit).toBe(false)
        expect(state.fieldsDisabled).toBe(false)
    })

    it('disables the fields and the submit while the write is held', () => {
        const state = applyDialogState({ ...READY, isHeld: true })
        expect(state.body).toBe('rows')
        expect(state.canSubmit).toBe(false)
        expect(state.fieldsDisabled).toBe(true)
    })
})

describe('applyRefusalTarget', () => {
    it('puts a refusal of a document or a credit under the refused row', () => {
        for (const key of ['invoice', 'bill', 'credit_memo', 'vendor_credit']) {
            expect(applyRefusalTarget(key), key).toBe('row')
        }
    })

    it('puts the date, the amount and a refusal with no key at the root', () => {
        for (const key of ['date', 'amount', '']) {
            expect(applyRefusalTarget(key), key).toBe('root')
        }
    })
})

describe('applySummaryText and appliedToastText', () => {
    const memo = CREDIT_MEMO_APPLICATION.texts
    const vendor = VENDOR_CREDIT_APPLICATION.texts

    it('reads the credit memo’s summary from the memo, singular and plural', () => {
        expect(applySummaryText(memo, 'credit', 15_000, 1, 10_000, USD)).toBe(
            'Applying $150.00 to 1 invoice · $100.00 stays unapplied'
        )
        expect(applySummaryText(memo, 'credit', 25_000, 2, 0, USD)).toBe(
            'Applying $250.00 to 2 invoices · $0.00 stays unapplied'
        )
    })

    it('reads the summary from an invoice, singular and plural', () => {
        expect(applySummaryText(memo, 'document', 15_000, 1, 25_000, USD)).toBe(
            'Applying $150.00 from 1 credit memo · $250.00 stays due'
        )
        expect(applySummaryText(memo, 'document', 33_000, 2, 7_000, USD)).toBe(
            'Applying $330.00 from 2 credit memos · $70.00 stays due'
        )
    })

    it('reads the toasts, singular and plural', () => {
        expect(appliedToastText(memo, 'credit', 15_000, 1, USD)).toBe(
            'Applied $150.00 to 1 invoice'
        )
        expect(appliedToastText(memo, 'credit', 25_000, 2, USD)).toBe(
            'Applied $250.00 to 2 invoices'
        )
        expect(appliedToastText(memo, 'document', 15_000, 1, USD)).toBe(
            'Applied $150.00 from 1 credit memo'
        )
        expect(appliedToastText(memo, 'document', 33_000, 2, USD)).toBe(
            'Applied $330.00 from 2 credit memos'
        )
    })

    it('keeps the vendor credit’s texts', () => {
        expect(applySummaryText(vendor, 'credit', 5_000, 2, 0, USD)).toBe(
            'Applying $50.00 to 2 bills · $0.00 stays unapplied'
        )
        expect(applySummaryText(vendor, 'credit', 3_000, 1, 2_000, USD)).toBe(
            'Applying $30.00 to 1 bill · $20.00 stays unapplied'
        )
        expect(appliedToastText(vendor, 'credit', 5_000, 2, USD)).toBe('Applied $50.00 to 2 bills')
        expect(appliedToastText(vendor, 'credit', 3_000, 1, USD)).toBe('Applied $30.00 to 1 bill')
    })
})

describe('sortApplyRows', () => {
    const row = (id: string, number: string, due: string): ApplyRow => ({
        id,
        number,
        date: '2026-09-01',
        due_date: due,
        total: 10_000,
        open: 10_000,
    })
    const LATE = row('late00000000001', '1005', '2026-12-01')
    const DUE_A = row('duea00000000001', '1007', '2026-11-20')
    const DUE_B = row('dueb00000000001', '1003', '2026-11-20')
    const SOURCE = row('source000000001', '1001', '2026-12-10')
    const ROWS = [LATE, DUE_A, SOURCE, DUE_B]

    it('puts the source row first, then by due date, then by number', () => {
        expect(sortApplyRows(ROWS, SOURCE.id).map(r => r.id)).toEqual([
            SOURCE.id,
            DUE_B.id,
            DUE_A.id,
            LATE.id,
        ])
    })

    it('orders by due date, then number, when the source is not listed', () => {
        expect(sortApplyRows(ROWS, 'notlisted000001').map(r => r.id)).toEqual([
            DUE_B.id,
            DUE_A.id,
            LATE.id,
            SOURCE.id,
        ])
        expect(sortApplyRows(ROWS, '').map(r => r.id)).toEqual([
            DUE_B.id,
            DUE_A.id,
            LATE.id,
            SOURCE.id,
        ])
    })

    it('orders memos from an invoice by credit date (their due date), then number', () => {
        const memoRow = (id: string, number: string, day: string): ApplyRow => ({
            ...row(id, number, day),
            date: day,
            creditDate: day,
        })
        const later = memoRow('memolater000001', '1001', '2026-11-14')
        const second = memoRow('memosecond00001', '1004', '2026-11-12')
        const first = memoRow('memofirst000001', '1002', '2026-11-12')
        expect(sortApplyRows([later, second, first], '').map(r => r.id)).toEqual([
            first.id,
            second.id,
            later.id,
        ])
    })

    it('does not change the rows it is given', () => {
        const copy = [...ROWS]
        sortApplyRows(ROWS, SOURCE.id)
        expect(ROWS).toEqual(copy)
    })
})

describe('applyNoticeVisible', () => {
    const SHOWN = { canWrite: true, status: 'posted', balance: 25_000, openCount: 2 }

    it('shows for a writer on a posted record with a balance and an open document', () => {
        expect(applyNoticeVisible(SHOWN)).toBe(true)
        expect(applyNoticeVisible({ ...SHOWN, openCount: 1 })).toBe(true)
    })

    it('hides for a reader, a draft, a void record, a zero balance and no open document', () => {
        expect(applyNoticeVisible({ ...SHOWN, canWrite: false })).toBe(false)
        expect(applyNoticeVisible({ ...SHOWN, status: 'draft' })).toBe(false)
        expect(applyNoticeVisible({ ...SHOWN, status: 'void' })).toBe(false)
        expect(applyNoticeVisible({ ...SHOWN, balance: 0 })).toBe(false)
        expect(applyNoticeVisible({ ...SHOWN, openCount: 0 })).toBe(false)
    })
})
