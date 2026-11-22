// @vitest-environment happy-dom
import { eq, useLiveQuery } from '@tanstack/react-db'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useVoidDialogState, useVoidPayment } from '../tinycld/books/hooks/useVoidPayment'
import {
    type PaymentCollectionName,
    paymentReadActions,
} from '../tinycld/books/lib/payment-read-actions'
import {
    guardedStore,
    holdWrites,
    messageRefusal,
    refuseAfterNow,
    seedBooks,
} from './accounts-form-harness'
import { silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

silenceLog()

// The void of a payment read view over the harness's real local-only collections. The
// update is optimistic: the payment reads `void` (so Void is no longer offered) as soon as
// the write starts. The read view draws its dialog by `isOpen && (isVoidOffered ||
// isPending)` (PaymentReadActions), so the probe below reads the payment row live and
// computes that rule on every render: a render with the row void and the hook not pending
// would hide the dialog during its own void and lose a refusal.

const PAYMENT_ID = 'pay_void_00001'
const CLOSE_DATE_REFUSAL = 'Date the void after the close date, 2026-06-30.'

type PaymentRow = { id: string; status: 'draft' | 'posted' | 'void'; number: string; entry: string }

interface Frame {
    status: string | undefined
    isOpen: boolean
    isPending: boolean
    isVisible: boolean
}

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function renderProbe(collectionName: PaymentCollectionName) {
    seedBooks({ level: 'bookkeeper' })
    const payments = guardedStore<PaymentRow>(collectionName, [
        { id: PAYMENT_ID, status: 'posted', number: '1004', entry: 'entry_1' },
    ])
    const frames: Frame[] = []
    const rendered = renderHook(
        () => {
            const { data: payment } = useLiveQuery(query =>
                query
                    .from({ p: payments })
                    .where(({ p }) => eq(p.id, PAYMENT_ID))
                    .findOne()
            )
            const voidPayment = useVoidPayment(collectionName)
            const isVoidOffered = paymentReadActions(payment?.status ?? 'draft', true).includes(
                'void'
            )
            frames.push({
                status: payment?.status,
                isOpen: voidPayment.isOpen,
                isPending: voidPayment.isPending,
                isVisible: voidPayment.isOpen && (isVoidOffered || voidPayment.isPending),
            })
            return { payment, voidPayment }
        },
        { wrapper }
    )
    return { ...rendered, frames, payments }
}

// Lets a held write reach the handler and the hook re-render.
async function settle() {
    await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50))
    })
}

async function openDialog(result: ReturnType<typeof renderProbe>['result']) {
    await waitFor(() => expect(result.current.payment?.status).toBe('posted'))
    act(() => result.current.voidPayment.open())
    expect(result.current.voidPayment.isOpen).toBe(true)
}

const COLLECTIONS: PaymentCollectionName[] = [
    'books_payments',
    'books_bill_payments',
    'books_vendor_refunds',
]

describe.each(COLLECTIONS)('useVoidPayment on %s', collectionName => {
    it('keeps the dialog drawn through the whole held void, then shows a refusal in it', async () => {
        const { result, frames, payments } = renderProbe(collectionName)
        await openDialog(result)
        refuseAfterNow(0, messageRefusal(CLOSE_DATE_REFUSAL))
        const release = holdWrites()

        const fromConfirm = frames.length
        act(() => result.current.voidPayment.confirm(PAYMENT_ID))
        await settle()
        const held = frames.slice(fromConfirm)

        // The optimistic void reached the probe while the write was held.
        expect(held.some(frame => frame.status === 'void')).toBe(true)
        expect(held.filter(frame => !frame.isVisible)).toEqual([])

        await act(async () => {
            release()
            await new Promise(resolve => setTimeout(resolve, 50))
        })

        await waitFor(() =>
            expect(result.current.voidPayment.errorMessage).toBe(CLOSE_DATE_REFUSAL)
        )
        expect(frames.slice(fromConfirm).filter(frame => !frame.isVisible)).toEqual([])
        expect(result.current.voidPayment.isOpen).toBe(true)
        expect(result.current.voidPayment.isPending).toBe(false)
        expect(payments.get(PAYMENT_ID)?.status).toBe('posted')
    })

    it('keeps the dialog drawn through the held void and closes it when the void succeeds', async () => {
        const { result, frames, payments } = renderProbe(collectionName)
        await openDialog(result)
        const release = holdWrites()

        const fromConfirm = frames.length
        act(() => result.current.voidPayment.confirm(PAYMENT_ID))
        await settle()
        const held = frames.slice(fromConfirm)

        expect(held.some(frame => frame.status === 'void')).toBe(true)
        expect(held.filter(frame => !frame.isVisible)).toEqual([])

        await act(async () => {
            release()
            await new Promise(resolve => setTimeout(resolve, 50))
        })

        await waitFor(() => expect(result.current.voidPayment.isOpen).toBe(false))
        expect(result.current.voidPayment.errorMessage).toBeNull()
        expect(result.current.voidPayment.isPending).toBe(false)
        expect(payments.get(PAYMENT_ID)?.status).toBe('void')
    })
})

// The value-driven dialog state a read view with no list kind (the bank deposit) voids
// through: `markVoid(id)` returns the transaction that writes the void. A refused void (the
// close date) keeps the dialog open with the refusal text; a void that lands closes it.
const DEPOSIT_ID = 'deps_void_00001'

type DepositRow = { id: string; status: 'draft' | 'posted' | 'void' }

function renderDialogState() {
    seedBooks({ level: 'bookkeeper' })
    const deposits = guardedStore<DepositRow>('books_deposits', [
        { id: DEPOSIT_ID, status: 'posted' },
    ])
    const markVoid = (id: string) =>
        deposits.update(id, draft => {
            draft.status = 'void'
        })
    const rendered = renderHook(() => useVoidDialogState(markVoid), { wrapper })
    return { ...rendered, deposits }
}

describe('useVoidDialogState', () => {
    it('keeps the dialog open with the refusal text when markVoid rejects', async () => {
        const { result, deposits } = renderDialogState()
        act(() => result.current.open())
        expect(result.current.isOpen).toBe(true)
        refuseAfterNow(0, messageRefusal(CLOSE_DATE_REFUSAL))

        act(() => result.current.confirm(DEPOSIT_ID))

        await waitFor(() => expect(result.current.errorMessage).toBe(CLOSE_DATE_REFUSAL))
        expect(result.current.isOpen).toBe(true)
        expect(result.current.isPending).toBe(false)
        expect(deposits.get(DEPOSIT_ID)?.status).toBe('posted')
    })

    it('reports the void as pending while it is held, then closes the dialog when it lands', async () => {
        const { result, deposits } = renderDialogState()
        act(() => result.current.open())
        const release = holdWrites()

        act(() => result.current.confirm(DEPOSIT_ID))
        await settle()
        expect(result.current.isPending).toBe(true)
        expect(result.current.isOpen).toBe(true)

        await act(async () => {
            release()
            await new Promise(resolve => setTimeout(resolve, 50))
        })

        await waitFor(() => expect(result.current.isOpen).toBe(false))
        expect(result.current.errorMessage).toBeNull()
        expect(deposits.get(DEPOSIT_ID)?.status).toBe('void')
    })

    it('clears an earlier refusal when the dialog opens again, and close shuts it', async () => {
        const { result } = renderDialogState()
        act(() => result.current.open())
        refuseAfterNow(0, messageRefusal(CLOSE_DATE_REFUSAL))
        act(() => result.current.confirm(DEPOSIT_ID))
        await waitFor(() => expect(result.current.errorMessage).toBe(CLOSE_DATE_REFUSAL))

        act(() => result.current.close())
        expect(result.current.isOpen).toBe(false)
        act(() => result.current.open())
        expect(result.current.isOpen).toBe(true)
        await waitFor(() => expect(result.current.errorMessage).toBeNull())
    })
})
