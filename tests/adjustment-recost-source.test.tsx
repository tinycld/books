// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useRecostSourceNumber } from '../tinycld/books/hooks/useRecostSourceNumber'
import { ADJUSTMENT_IDS, adjustmentOf } from '../tinycld/books/lib/inventory-adjust-fixture'
import { heldOnDemandStore, seedBooks } from './accounts-form-harness'
import { expectLiveQueryError } from './silence-log'

// The number of a re-cost's source document (inventory-adjust spec §3.5, §3.13): read from
// the source's own collection, nothing read for any other kind, and a failed read gives a
// recovery that names the source collection, so the screen shows its load error and Retry.

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

// The fixture's re-cost names Bill 318 (`billstockmov318`).
const BILL_318 = { id: 'billstockmov318', number: '318' }

const OTHER_SOURCES = [
    'books_credit_memos',
    'books_expenses',
    'books_invoices',
    'books_refund_receipts',
    'books_sales_receipts',
    'books_vendor_credits',
    'books_inventory_adjustments',
] as const

// The eight collections whose documents move stock, with Bill 318 in the bills.
function seedSources(opts: { refuseBills?: boolean } = {}) {
    seedBooks()
    const bills = heldOnDemandStore('books_bills', [BILL_318], {
        refuseFirstLoad: opts.refuseBills,
    })
    const others = OTHER_SOURCES.map(name => heldOnDemandStore<{ id: string }>(name, []))
    return { bills, others }
}

function noticeInput(id: string) {
    const { kind, source, document } = adjustmentOf(id)
    return { kind, source, document }
}

describe('useRecostSourceNumber', () => {
    it("gives the number of a re-cost's bill", async () => {
        seedSources()
        const hook = renderHook(() => useRecostSourceNumber(noticeInput(ADJUSTMENT_IDS.recost)))
        await waitFor(() => expect(hook.result.current.number).toBe('318'))
        expect(hook.result.current.recovery.queries).toEqual([])
    })

    it('reads nothing for a manual adjustment', async () => {
        const { bills, others } = seedSources()
        const hook = renderHook(() => useRecostSourceNumber(noticeInput(ADJUSTMENT_IDS.posted)))
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 20))
        })
        expect(hook.result.current.number).toBeUndefined()
        expect([bills, ...others].map(store => store.loads())).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
        expect(hook.result.current.recovery.queries).toEqual([])
    })

    it('gives a recovery naming the bills when the bill read fails', async () => {
        const { bills } = seedSources({ refuseBills: true })
        expectLiveQueryError(bills.id)
        const hook = renderHook(() => useRecostSourceNumber(noticeInput(ADJUSTMENT_IDS.recost)))
        await waitFor(() => expect(hook.result.current.recovery.queries).toHaveLength(1))
        expect(hook.result.current.recovery.sources).toContain(bills)
        expect(hook.result.current.number).toBeUndefined()
    })
})
