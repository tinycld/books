// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { formHosts } from '@tinycld/core/lib/forms/use-form-hosts'
import type { TableRow } from '@tinycld/core/lib/forms/values'
import { deriveFormHosts } from '@tinycld/core/lib/packages/derive-form-hosts'
import * as expoRouter from 'expo-router'
import { ClientResponseError } from 'pocketbase'
import { createElement, type Provider } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { View } from 'react-native'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { ZodTypeAny } from 'zod'
import { SALES_RECEIPT_DOCUMENT } from '../tinycld/books/components/documents/document-kinds'
import hosts, { SALES_RECEIPT_HOST_KEY } from '../tinycld/books/forms/hosts'
import { useDocumentForm } from '../tinycld/books/hooks/useDocumentForm'
import { useDocumentSave } from '../tinycld/books/hooks/useDocumentSave'
import {
    documentRefusalTarget,
    SALES_RECEIPT_MESSAGES,
} from '../tinycld/books/lib/document-messages'
import { type DepositRule, documentSchema } from '../tinycld/books/lib/document-schema'
import { PRODUCT_IDS } from '../tinycld/books/lib/products-services-fixture'
import { SALES_RECEIPT_KIND } from '../tinycld/books/lib/sales-document-kinds'
import {
    DEPOSIT_ACCOUNT_IDS,
    SALES_RECEIPT_CURRENCY,
    SALES_RECEIPT_TODAY,
} from '../tinycld/books/lib/sales-receipt-form-fixture'
import { useDocumentSaveStore } from '../tinycld/books/stores/document-save-store'
import type { BooksSalesReceiptLines, BooksSalesReceipts } from '../tinycld/books/types'
import {
    enteredWrites,
    guardedStore,
    refuseNthWrite,
    seedBooks,
    seedFormRecords,
} from './accounts-form-harness'
import { silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/mutations', async importOriginal => {
    const actual = await importOriginal<typeof import('@tinycld/core/lib/mutations')>()
    const { atomicStub } = await import('./accounts-form-harness')
    return { ...actual, atomic: atomicStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

silenceLog()

const DEPOSIT_REQUIRED = 'Choose where the money was deposited'
const DEPOSIT_NONE = 'Add a bank account or an Undeposited funds account to the chart of accounts'
const REFERENCE_TOO_LONG = 'Reference no. can be at most 40 characters'
const TOTAL_TOO_LARGE = 'The sales receipt total is more than Books can store.'
const TOTAL_NEGATIVE = 'A sales receipt total cannot be below zero. Use a refund receipt.'
const NEED_ITEM_LINE = 'Add at least one product or service line'

// Deposit to is drawn ("Ask") and the chart offers deposit accounts.
const ASK: DepositRule = { hasOptions: true, hidden: false }

let nextId = 0
function rowId() {
    nextId += 1
    return `row${String(nextId).padStart(12, '0')}`
}

function item(cells: Partial<TableRow> = {}): TableRow {
    return {
        id: rowId(),
        kind: 'item',
        product: 'prodbookkeep001',
        description: '',
        quantity: 1,
        rate: '100.00',
        amount: null,
        taxable: false,
        ...cells,
    }
}

// A receipt form's values: a walk-in sale (no customer) with the given lines.
function valuesWith(lines: TableRow[], overrides: Record<string, unknown> = {}) {
    return {
        customer: '',
        bill_to: null,
        email: '',
        date: SALES_RECEIPT_TODAY,
        tax_rate: '',
        payment_method: 'check',
        reference_no: '43567',
        deposit_to: DEPOSIT_ACCOUNT_IDS.undeposited,
        lines,
        message: '',
        memo: '',
        ...overrides,
    }
}

type Issue = { path: PropertyKey[]; message: string }

function issuesOf(schema: ZodTypeAny, values: unknown): Issue[] {
    const result = schema.safeParse(values)
    return result.success ? [] : result.error.issues
}

function messagesAt(issues: Issue[], path: (string | number)[]): string[] {
    const key = path.join('.')
    return issues.filter(issue => issue.path.join('.') === key).map(issue => issue.message)
}

function draftIssues(values: unknown, deposit: DepositRule = ASK) {
    return issuesOf(
        documentSchema(SALES_RECEIPT_KIND, SALES_RECEIPT_CURRENCY, 'draft', null, deposit),
        values
    )
}

function postIssues(values: unknown, deposit: DepositRule = ASK) {
    return issuesOf(
        documentSchema(SALES_RECEIPT_KIND, SALES_RECEIPT_CURRENCY, 'post', null, deposit),
        values
    )
}

describe("documentSchema(SALES_RECEIPT_KIND, 'USD', 'draft')", () => {
    it('accepts a walk-in sale with a payment and a deposit account', () => {
        expect(draftIssues(valuesWith([item()]))).toEqual([])
    })

    it('refuses an empty Deposit to at deposit_to while the chart offers accounts', () => {
        const issues = draftIssues(valuesWith([item()], { deposit_to: '' }))
        expect(messagesAt(issues, ['deposit_to'])).toEqual([DEPOSIT_REQUIRED])
    })

    it('refuses an empty Deposit to at deposit_to with the chart text when there is no deposit account', () => {
        const issues = draftIssues(valuesWith([item()], { deposit_to: '' }), {
            hasOptions: false,
            hidden: false,
        })
        expect(messagesAt(issues, ['deposit_to'])).toEqual([DEPOSIT_NONE])
    })

    it('refuses a 41-character Reference no. at reference_no', () => {
        const forty = 'A'.repeat(40)
        expect(
            messagesAt(draftIssues(valuesWith([item()], { reference_no: forty })), ['reference_no'])
        ).toEqual([])
        const issues = draftIssues(valuesWith([item()], { reference_no: `${forty}B` }))
        expect(messagesAt(issues, ['reference_no'])).toEqual([REFERENCE_TOO_LONG])
    })

    it('refuses a total over the stored-amount limit at lines with the receipt text', () => {
        // Ten lines of 10^15 cents each: every line is at its limit, the total is past
        // 2^53 - 1.
        const lines = Array.from({ length: 10 }, () => item({ rate: '10,000,000,000,000.00' }))
        const issues = draftIssues(valuesWith(lines))
        expect(messagesAt(issues, ['lines'])).toEqual([TOTAL_TOO_LARGE])
    })

    it('refuses lines that sum below zero at lines with the receipt text', () => {
        const issues = draftIssues(valuesWith([item({ rate: '10.00' }), item({ rate: '-20.00' })]))
        expect(messagesAt(issues, ['lines'])).toEqual([TOTAL_NEGATIVE])
    })

    it('has no due-date rule: a due date before the sale date is not checked', () => {
        const issues = draftIssues(
            valuesWith([item()], { date: '2026-11-11', due_date: '2026-11-01' })
        )
        expect(messagesAt(issues, ['due_date'])).toEqual([])
        expect(issues).toEqual([])
    })
})

// Checkpoint 5: with an account set in "Sales deposited to" Deposit to is hidden and the
// server stamps the set account, so an empty Deposit to passes; with "Ask" it is refused.
describe('documentSchema(SALES_RECEIPT_KIND) with Deposit to hidden', () => {
    const HIDDEN: DepositRule = { hasOptions: true, hidden: true }

    it('accepts an empty Deposit to on a draft and a post', () => {
        const values = valuesWith([item()], { deposit_to: '' })
        expect(draftIssues(values, HIDDEN)).toEqual([])
        expect(postIssues(values, HIDDEN)).toEqual([])
    })

    it('refuses it with Deposit to shown, as in checkpoint 4', () => {
        const values = valuesWith([item()], { deposit_to: '' })
        expect(messagesAt(postIssues(values, ASK), ['deposit_to'])).toEqual([DEPOSIT_REQUIRED])
    })
})

describe("documentSchema(SALES_RECEIPT_KIND, 'USD', 'post')", () => {
    it('adds the one-product-line rule', () => {
        const issues = postIssues(valuesWith([item({ product: '' })]))
        expect(messagesAt(issues, ['lines'])).toContain(NEED_ITEM_LINE)
        expect(postIssues(valuesWith([item()]))).toEqual([])
    })
})

describe('SALES_RECEIPT_MESSAGES (schema texts)', () => {
    it('holds the deposit and reference texts the schema shows', () => {
        expect(SALES_RECEIPT_MESSAGES.depositRequired).toBe(DEPOSIT_REQUIRED)
        expect(SALES_RECEIPT_MESSAGES.depositNone).toBe(DEPOSIT_NONE)
        expect(SALES_RECEIPT_MESSAGES.referenceTooLong).toBe(REFERENCE_TOO_LONG)
    })
})

// Server refusals carry PocketBase's final period.
describe('documentRefusalTarget(message, SALES_RECEIPT_KIND)', () => {
    const target = (message: string) => documentRefusalTarget(message, SALES_RECEIPT_KIND)

    it('sends both deposit refusals to Deposit to', () => {
        expect(target('Choose an active bank or Undeposited funds account.')).toBe('deposit_to')
        expect(
            target('Add a bank account or an Undeposited funds account to the chart of accounts.')
        ).toBe('deposit_to')
    })

    it('sends an inactive customer refusal to Customer', () => {
        expect(target('Old Mill Bakery is inactive. Choose an active customer.')).toBe('customer')
    })

    it("sends the invoice's day and tax-rate texts to Sale date and Tax", () => {
        // server/sales_documents.go msgDocumentDay.
        expect(target('Enter a date that exists, in the form YYYY-MM-DD.')).toBe('date')
        // server/sales_documents.go msgDocumentDayTooEarly.
        expect(target('Enter a date in 1900 or later.')).toBe('date')
        expect(target('Tax rate Old is inactive. Choose an active rate.')).toBe('tax_rate')
    })

    it('never sends a refusal to a due date, which a receipt does not have', () => {
        expect(target('The due date cannot be before the invoice date.')).not.toBe('due_date')
    })
})

// A PocketBase schema refusal (reference_no over its max) is keyed by the field, not
// matched by text. It is driven through the real save of a new sales receipt form (the
// real form and save hooks over the harness's local-only collections): the refused
// insert puts the server's field text under Reference no., not in the form's summary.

type ScreenStubValue = {
    pathname: string
    navigation: { isFocused: () => boolean; dispatch: (action: unknown) => void }
}
// Vitest serves expo-router from the app shell's test stub, which adds ScreenStub: the
// screen whose navigation `useNavigation` answers inside it.
const { ScreenStub } = expoRouter as unknown as { ScreenStub: Provider<ScreenStubValue | null> }

const receiptHost = hosts.find(h => h.key === SALES_RECEIPT_HOST_KEY)
if (!receiptHost) throw new Error('no books:sales_receipt host in forms/hosts.ts')

// The shared unit setup registers no package hosts: register the real Books receipt host
// and its real host UI, as the generated config does in the app.
formHosts.push(
    ...deriveFormHosts([
        {
            manifest: { name: 'Books', slug: 'books' },
            formHosts: [receiptHost],
            formHostsUi: () => import('../tinycld/books/forms/ui'),
        },
    ])
)

// The form is ready only after the host UI module is loaded. Load it before the first
// test: with the whole suite running, the first load can take longer than waitFor waits,
// and that time is not part of what a test measures.
beforeAll(async () => {
    await import('../tinycld/books/forms/ui')
})

const REFERENCE_FIELD_TEXT = 'Must be less than 40 character(s).'

type ReceiptForm = UseFormReturn<Record<string, unknown>>
type Seen = {
    form: ReceiptForm
    isReady: boolean
    save: ReturnType<typeof useDocumentSave>
}

// The new sales receipt form as the screen builds it, and its save.
function ReceiptProbe({ seen }: { seen: { current: Seen | null } }) {
    const state = useDocumentForm(SALES_RECEIPT_DOCUMENT, {
        record: undefined,
        lines: [],
        customer: undefined,
        currency: SALES_RECEIPT_CURRENCY,
        taxRows: [],
    })
    const save = useDocumentSave(state)
    seen.current = { form: state.form as unknown as ReceiptForm, isReady: state.isReady, save }
    return createElement(View, { ref: save.surfaceRef })
}

async function openNewReceipt() {
    const seen: { current: Seen | null } = { current: null }
    const screen: ScreenStubValue = {
        pathname: '/a/books/sales-receipts/new',
        navigation: { isFocused: () => true, dispatch: () => {} },
    }
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    render(
        createElement(
            QueryClientProvider,
            { client },
            createElement(ScreenStub, { value: screen }, createElement(ReceiptProbe, { seen }))
        )
    )
    const current = () => {
        if (!seen.current) throw new Error('the probe has not rendered')
        return seen.current
    }
    await waitFor(() => expect(current().isReady).toBe(true))
    return current
}

function messageOf(error: unknown): string | undefined {
    if (error === null || typeof error !== 'object') return undefined
    const { message } = error as { message?: unknown }
    return typeof message === 'string' ? message : undefined
}

describe('a reference_no field refusal', () => {
    it('shows the server text under Reference no., not in the summary', async () => {
        seedBooks()
        seedFormRecords([receiptHost])
        const receipts = guardedStore<BooksSalesReceipts>('books_sales_receipts', [])
        guardedStore<BooksSalesReceiptLines>('books_sales_receipt_lines', [])
        useDocumentSaveStore.setState({ heldId: null })
        const current = await openNewReceipt()
        act(() => {
            const { form } = current()
            form.setValue('reference_no', '43567', { shouldDirty: true })
            form.setValue('deposit_to', DEPOSIT_ACCOUNT_IDS.undeposited, { shouldDirty: true })
            form.setValue('lines', [item({ product: PRODUCT_IDS.patchCable })], {
                shouldDirty: true,
            })
        })
        // The save is one batch: the receipt and its line enter together.
        refuseNthWrite(
            2,
            new ClientResponseError({
                url: 'http://127.0.0.1:7100/api/collections/books_sales_receipts/records',
                status: 400,
                response: {
                    code: 400,
                    message: 'Failed to create record.',
                    data: {
                        reference_no: {
                            code: 'validation_length_out_of_range',
                            message: REFERENCE_FIELD_TEXT,
                        },
                    },
                },
            })
        )

        await act(async () => {
            await current().save.saveDraft()
        })

        const { form } = current()
        await waitFor(() =>
            expect(messageOf(form.getFieldState('reference_no').error)).toBe(REFERENCE_FIELD_TEXT)
        )
        await waitFor(() => expect(current().save.isSaving).toBe(false))
        // The refused batch is the only write: no delete follows it, and nothing is stored.
        expect(enteredWrites()).toHaveLength(2)
        expect(receipts.toArray).toEqual([])
        expect(messageOf(form.getFieldState('root.server').error)).toBeUndefined()
        expect(messageOf(form.getFieldState('root').error)).toBeUndefined()
    })
})
