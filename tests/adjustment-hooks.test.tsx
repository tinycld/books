// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAdjustmentRecord } from '../tinycld/books/hooks/useAdjustmentRecord'
import { useAdjustmentScreen } from '../tinycld/books/hooks/useAdjustmentScreen'
import {
    type AdjustmentListFilters,
    useAdjustmentsQuery,
} from '../tinycld/books/hooks/useAdjustmentsQuery'
import {
    ADJUSTMENT_IDS,
    adjustmentOf,
    BINS,
    INVENTORY_ITEM_IDS,
    INVENTORY_ITEMS,
} from '../tinycld/books/lib/inventory-adjust-fixture'
import { heldOnDemandStore, onDemandStore, seedBooks } from './accounts-form-harness'
import { expectLiveQueryError } from './silence-log'

// The inventory adjustment reads on the Books harness (inventory-adjust spec §3.5, §3.13):
// which rows decide the list's empty state, the order of rows that tie on the date, the
// opening item's name, and the screen's one Retry over a failed bin read or a failed read
// of a Books-made adjustment's item or source document.

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

// A stored adjustment row of the fixture's adjustment `id`, with the stored fields the
// fixture leaves out.
function storedAdjustment(id: string, over: Record<string, unknown> = {}) {
    return { ...adjustmentOf(id), account: '', entry: '', sort_key: '', ...over }
}

const NEWEST_FIRST: AdjustmentListFilters = {
    search: '',
    chip: 'all',
    madeByBooks: false,
    sort: { key: 'date', isAscending: false },
}

function seedList(adjustments: ReturnType<typeof storedAdjustment>[]) {
    seedBooks()
    heldOnDemandStore('books_inventory_adjustments', adjustments)
    heldOnDemandStore('books_inventory_adjustment_lines', [])
    heldOnDemandStore('books_products', [])
}

describe('useAdjustmentsQuery: the empty state', () => {
    it('is empty while the book has only adjustments Books made and Made by Books is off', async () => {
        seedList([storedAdjustment(ADJUSTMENT_IDS.opening)])
        const hook = renderHook(() => useAdjustmentsQuery(NEWEST_FIRST))
        await waitFor(() => expect(hook.result.current.isReady).toBe(true))
        expect(hook.result.current.rows).toEqual([])
        await waitFor(() => expect(hook.result.current.anyRecord).not.toBeUndefined())
        // No manual adjustment exists: "No inventory adjustments yet", not "no match".
        expect(hook.result.current.anyRecord).toBe(false)
    })

    it('lists the adjustment Books made while Made by Books is on', async () => {
        seedList([storedAdjustment(ADJUSTMENT_IDS.opening)])
        const hook = renderHook(() => useAdjustmentsQuery({ ...NEWEST_FIRST, madeByBooks: true }))
        await waitFor(() =>
            expect(hook.result.current.rows.map(row => row.id)).toEqual([ADJUSTMENT_IDS.opening])
        )
    })

    it('is no match, not empty, when a manual adjustment exists outside the chip', async () => {
        seedList([storedAdjustment(ADJUSTMENT_IDS.opening), storedAdjustment(ADJUSTMENT_IDS.draft)])
        const hook = renderHook(() => useAdjustmentsQuery({ ...NEWEST_FIRST, chip: 'void' }))
        await waitFor(() => expect(hook.result.current.isReady).toBe(true))
        expect(hook.result.current.rows).toEqual([])
        await waitFor(() => expect(hook.result.current.anyRecord).not.toBeUndefined())
        expect(hook.result.current.anyRecord).toBe(true)
    })
})

describe('useAdjustmentsQuery: the order', () => {
    it('lists adjustments of one date by id, whatever their number or load order', async () => {
        const day = '2026-07-01'
        seedList([
            storedAdjustment(ADJUSTMENT_IDS.posted, {
                id: 'iadjtieccc00003',
                number: 'IA-1',
                date: day,
            }),
            storedAdjustment(ADJUSTMENT_IDS.posted, {
                id: 'iadjtieaaa00001',
                number: 'IA-3',
                date: day,
            }),
            storedAdjustment(ADJUSTMENT_IDS.posted, {
                id: 'iadjtiebbb00002',
                number: 'IA-2',
                date: day,
            }),
            storedAdjustment(ADJUSTMENT_IDS.posted, {
                id: 'iadjlater000004',
                number: 'IA-4',
                date: '2026-07-02',
            }),
        ])
        const hook = renderHook(() => useAdjustmentsQuery(NEWEST_FIRST))
        await waitFor(() =>
            expect(hook.result.current.rows.map(row => row.id)).toEqual([
                'iadjlater000004',
                'iadjtieaaa00001',
                'iadjtiebbb00002',
                'iadjtieccc00003',
            ])
        )
    })
})

// The collections a re-cost's source can be in, other than the adjustments (spec §3.5),
// so the screen's source read has a store for each.
const SOURCE_DOCUMENTS = [
    'books_credit_memos',
    'books_expenses',
    'books_invoices',
    'books_refund_receipts',
    'books_sales_receipts',
    'books_vendor_credits',
] as const

function seedSourceDocuments(bills: { id: string; number: string }[] = []) {
    for (const name of SOURCE_DOCUMENTS) onDemandStore<{ id: string }>(name, [])
    onDemandStore('books_bills', bills)
}

const LABELS = INVENTORY_ITEMS.find(item => item.id === INVENTORY_ITEM_IDS.labels)

describe('useAdjustmentRecord: the opening item', () => {
    it("reads the opening adjustment's item name with the header", async () => {
        seedBooks()
        onDemandStore('books_inventory_adjustments', [storedAdjustment(ADJUSTMENT_IDS.opening)])
        onDemandStore('books_inventory_adjustment_lines', [])
        onDemandStore('books_products', LABELS ? [LABELS] : [])
        onDemandStore('books_bins', [...BINS])
        const hook = renderHook(() => useAdjustmentRecord(ADJUSTMENT_IDS.opening))
        await waitFor(() => expect(hook.result.current.isReady).toBe(true))
        expect(hook.result.current.adjustment?.openingItemName).toBe(
            'Shipping labels, 4 x 6 in, roll of 500'
        )
    })
})

describe('useAdjustmentScreen: a failed read of a notice', () => {
    it("shows the load error when the opening item's read fails, and Retry recovers it", async () => {
        seedBooks()
        // No line, so only the notice's item read asks books_products for rows.
        onDemandStore('books_inventory_adjustments', [storedAdjustment(ADJUSTMENT_IDS.opening)])
        onDemandStore('books_inventory_adjustment_lines', [])
        onDemandStore('books_stock_moves', [])
        onDemandStore('books_bins', [...BINS])
        seedSourceDocuments()
        const products = heldOnDemandStore('books_products', LABELS ? [LABELS] : [], {
            refuseFirstLoad: true,
        })
        expectLiveQueryError(products.id)
        const hook = renderHook(() => useAdjustmentScreen(ADJUSTMENT_IDS.opening))
        await waitFor(() => expect(hook.result.current.state).not.toBe('loading'))
        expect(hook.result.current.state).toBe('error')
        act(() => hook.result.current.retry())
        await waitFor(() => expect(hook.result.current.state).toBe('read'))
    })

    it("shows the load error when the re-cost's bill read fails, and Retry recovers it", async () => {
        seedBooks()
        // No line, so only the notice's source read asks books_bills for rows.
        onDemandStore('books_inventory_adjustments', [storedAdjustment(ADJUSTMENT_IDS.recost)])
        onDemandStore('books_inventory_adjustment_lines', [])
        onDemandStore('books_stock_moves', [])
        onDemandStore('books_products', [])
        onDemandStore('books_bins', [...BINS])
        for (const name of SOURCE_DOCUMENTS) onDemandStore<{ id: string }>(name, [])
        const bills = heldOnDemandStore('books_bills', [{ id: 'billstockmov318', number: '318' }], {
            refuseFirstLoad: true,
        })
        expectLiveQueryError(bills.id)
        const hook = renderHook(() => useAdjustmentScreen(ADJUSTMENT_IDS.recost))
        await waitFor(() => expect(hook.result.current.state).not.toBe('loading'))
        expect(hook.result.current.state).toBe('error')
        act(() => hook.result.current.retry())
        await waitFor(() => expect(hook.result.current.state).toBe('read'))
    })
})

describe('useAdjustmentScreen: a failed bin read', () => {
    it('shows the load error, and Retry recovers the bin read into the read view', async () => {
        seedBooks()
        seedSourceDocuments()
        // No line, so only the screen's own bin read asks books_bins for rows.
        onDemandStore('books_inventory_adjustments', [storedAdjustment(ADJUSTMENT_IDS.posted)])
        onDemandStore('books_inventory_adjustment_lines', [])
        onDemandStore('books_stock_moves', [])
        onDemandStore('books_products', [])
        const bins = heldOnDemandStore('books_bins', [...BINS], { refuseFirstLoad: true })
        expectLiveQueryError(bins.id)
        const hook = renderHook(() => useAdjustmentScreen(ADJUSTMENT_IDS.posted))
        await waitFor(() => expect(hook.result.current.state).not.toBe('loading'))
        expect(hook.result.current.state).toBe('error')
        act(() => hook.result.current.retry())
        await waitFor(() => expect(hook.result.current.state).toBe('read'))
    })
})
