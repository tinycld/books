// @vitest-environment happy-dom
import { eq, useLiveQuery } from '@tanstack/react-db'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useVoidPayment } from '../tinycld/books/hooks/useVoidPayment'
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
