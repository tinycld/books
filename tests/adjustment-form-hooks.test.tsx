// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { helpGroups } from '@tinycld/core/lib/shortcuts/help-list'
import { getShortcuts, useShortcutRegistry } from '@tinycld/core/lib/shortcuts/registry'
import { pushScope, resetScopes } from '@tinycld/core/lib/shortcuts/scopes'
import { useConnectivityStore } from '@tinycld/core/lib/stores/connectivity-store'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adjustmentLineView } from '../tinycld/books/components/inventory-adjustments/AdjustmentLineCells'
import { useAdjustmentForm } from '../tinycld/books/hooks/useAdjustmentForm'
import { useAdjustmentLineStock } from '../tinycld/books/hooks/useAdjustmentLineStock'
import {
    useAdjustmentLeaveGuard,
    useAdjustmentSave,
} from '../tinycld/books/hooks/useAdjustmentSave'
import { useAdjustmentShortcuts } from '../tinycld/books/hooks/useAdjustmentShortcuts'
import { ADJUSTMENT_FORM_KEYS } from '../tinycld/books/lib/adjustment-shortcuts'
import { emptyAdjustmentLine } from '../tinycld/books/lib/adjustment-values'
import { heldOnDemandStore, onDemandStore, seedBooks } from './accounts-form-harness'

// The adjustment form's hooks on the Books harness (inventory-adjust spec §3.3, §3.4):
// the lines' stock keeps the rows it has while a new item's stock loads, a Change typed
// before the stock arrived gives New quantity when it arrives, and the ⇧? list shows ⌘S
// Save draft only while Save draft is offered.

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const ITEM_A = 'prodadjhooka001'
const ITEM_B = 'prodadjhookb001'
const BIN_X = 'binadjhookx0001'
const BIN_Y = 'binadjhooky0001'

function item(id: string, quantity: number) {
    return {
        id,
        name: id,
        type: 'inventory',
        inactive: false,
        quantity_on_hand: quantity,
        default_bin: '',
        asset_account: '',
    }
}

// Item A: 4 in bin X and 6 in bin Y (10 in all); item B: 10, in no bin. The harness
// serves every row of `rows` to a load whose filter it cannot read (the stock's `inArray`),
// so a test that needs item B to arrive later adds it to `rows` after the first load.
function seedStock(rows = [item(ITEM_A, 10), item(ITEM_B, 10)]) {
    seedBooks()
    const products = heldOnDemandStore('books_products', rows)
    onDemandStore('books_bin_stock', [
        { id: 'bstkadjhooka001', product: ITEM_A, bin: BIN_X, quantity: 4 },
        { id: 'bstkadjhooka002', product: ITEM_A, bin: BIN_Y, quantity: 6 },
    ])
    return products
}

describe('useAdjustmentLineStock: a new item on a line', () => {
    it("keeps the other lines' stock while the new item's stock loads", async () => {
        const rows = [item(ITEM_A, 10)]
        const products = seedStock(rows)
        const hook = renderHook(({ ids }: { ids: string[] }) => useAdjustmentLineStock(ids, true), {
            initialProps: { ids: [ITEM_A] },
        })
        await waitFor(() => expect(hook.result.current.isKnown(ITEM_A)).toBe(true))
        expect(hook.result.current.onHandOf(ITEM_A, BIN_X)).toEqual({ quantity: 4, total: 10 })
        expect(hook.result.current.isKnown(ITEM_B)).toBe(false)

        rows.push(item(ITEM_B, 10))
        products.hold()
        hook.rerender({ ids: [ITEM_A, ITEM_B] })
        // The first render with the new key, and each render while item B loads.
        expect(hook.result.current.isKnown(ITEM_A)).toBe(true)
        await act(() => new Promise(resolve => setTimeout(resolve, 50)))
        // Item B is still loading; item A's line keeps its On hand (not "…").
        expect(hook.result.current.isKnown(ITEM_B)).toBe(false)
        expect(hook.result.current.isKnown(ITEM_A)).toBe(true)
        expect(hook.result.current.onHandOf(ITEM_A, BIN_X)).toEqual({ quantity: 4, total: 10 })

        products.release()
        await waitFor(() => expect(hook.result.current.isKnown(ITEM_B)).toBe(true))
        expect(hook.result.current.onHandOf(ITEM_A, BIN_X)).toEqual({ quantity: 4, total: 10 })
    })
})

describe('useAdjustmentForm: a Change typed before the stock arrives', () => {
    it('gives New quantity = On hand + Change once the item’s stock arrives', async () => {
        const products = seedStock()
        products.hold()
        const hook = renderHook(() =>
            useAdjustmentForm({
                initial: {
                    date: '2026-11-27',
                    account: '',
                    memo: '',
                    lines: [emptyAdjustmentLine()],
                },
                hasBins: false,
                isActiveBin: () => true,
            })
        )
        act(() => hook.result.current.line.setItem(0, ITEM_B))
        act(() => hook.result.current.line.setChange(0, '2'))
        expect(hook.result.current.values.lines?.[0]?.change).toBe('2')

        products.release()
        await waitFor(() => expect(hook.result.current.stock.isKnown(ITEM_B)).toBe(true))
        // On hand 10 + the typed Change 2, as the line shows it (the cell draws the view's
        // New quantity). The stored form value may stay '': it is computed during render.
        const shownNewQuantity = () => {
            const { values, stock } = hook.result.current
            return adjustmentLineView(values.lines[0], 0, stock, {}).newQuantityText
        }
        await waitFor(() => expect(shownNewQuantity()).toBe('12'))
    })
})

// A new adjustment's refused save that wrote its header hands off to the draft's form
// (useAdjustmentSave, store `handOff`): the form starts from the submitted values. When the
// refusal came at a line write partway through the plan, the lines after it are not stored,
// so the draft form must count them as unsaved edits and the leave asks. The hooks are
// composed as AdjustmentForm composes them (the form, the save, the leave guard).
const DRAFT = 'adjhookdraft001'
const LINE_1 = 'adjhookline0001'
const LINE_2 = 'adjhookline0002'
const LINE_3 = 'adjhookline0003'

const SUBMITTED = {
    date: '2026-11-27',
    account: '',
    memo: 'count',
    lines: [
        { id: LINE_1, product: ITEM_B, bin: '', newQuantity: '12', change: '2', value: '12.00' },
        { id: LINE_2, product: ITEM_B, bin: '', newQuantity: '9', change: '-1', value: '' },
        { id: LINE_3, product: ITEM_B, bin: '', newQuantity: '10', change: '0', value: '5.00' },
        // The new form's unused starting line: the save drops it, so no stored row holds it.
        { id: 'adjhookline0004', product: '', bin: '', newQuantity: '', change: '', value: '' },
    ],
}

const STORED = [
    {
        id: LINE_1,
        product: ITEM_B,
        bin: '',
        quantity: 2,
        value: 1200,
        value_given: true,
        position: 0,
    },
    {
        id: LINE_2,
        product: ITEM_B,
        bin: '',
        quantity: -1,
        value: 0,
        value_given: false,
        position: 1,
    },
    {
        id: LINE_3,
        product: ITEM_B,
        bin: '',
        quantity: 0,
        value: 500,
        value_given: true,
        position: 2,
    },
]

function renderHandedOff(storedLines: typeof STORED) {
    seedStock()
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children)
    return renderHook(
        () => {
            const adjustmentForm = useAdjustmentForm({
                initial: SUBMITTED,
                hasBins: false,
                isActiveBin: () => true,
            })
            const save = useAdjustmentSave({
                adjustmentForm,
                adjustmentId: DRAFT,
                storedLines,
                holdsHandOff: true,
            })
            const leaveGuard = useAdjustmentLeaveGuard(save)
            return { save, leaveGuard }
        },
        { wrapper }
    )
}

describe('useAdjustmentSave: the draft form a refused save handed off to', () => {
    it('is dirty when the refused line write left later lines unstored, so Cancel asks', async () => {
        // The refusal came at line 2's write: only line 1 is stored.
        const hook = renderHandedOff(STORED.slice(0, 1))
        await waitFor(() => expect(hook.result.current.save.isDirty).toBe(true))
        act(() => hook.result.current.save.cancel())
        expect(hook.result.current.save.isDiscardOpen).toBe(true)
        expect(hook.result.current.leaveGuard.dialog.isVisible).toBe(true)
    })

    it('stays not dirty when every line is stored (an ordinary refused post), so no leave asks', async () => {
        const hook = renderHandedOff(STORED)
        await act(() => new Promise(resolve => setTimeout(resolve, 50)))
        expect(hook.result.current.save.isDirty).toBe(false)
        expect(hook.result.current.leaveGuard.dialog.isVisible).toBe(false)
    })
})

// The ⇧? list's entries for ⌘S under the form's scope, as core's help overlay builds them.
function listedSaveDraft() {
    return Object.values(helpGroups(getShortcuts(), null))
        .flat()
        .filter(shortcut => shortcut.keys === ADJUSTMENT_FORM_KEYS.saveDraft)
}

function clearRegistry() {
    const state = useShortcutRegistry.getState()
    for (const id of Array.from(state.shortcuts.keys())) state.unregister(id)
}

type ShortcutInput = Parameters<typeof useAdjustmentShortcuts>[0]

function renderShortcuts(over: Partial<ShortcutInput>) {
    const scopeId = pushScope('compose')
    const input: ShortcutInput = {
        scopeOwner: () => scopeId,
        canWrite: true,
        isPending: false,
        isDialogOpen: false,
        isSavedDraft: false,
        isPhone: true,
        lineCount: 2,
        isLineFocused: () => true,
        run: { saveDraft: vi.fn(), postAndNew: vi.fn(), removeLine: vi.fn() },
        ...over,
    }
    return renderHook(() => useAdjustmentShortcuts(input))
}

describe('useAdjustmentShortcuts: ⌘S in the ⇧? list', () => {
    afterEach(() => {
        clearRegistry()
        resetScopes()
        useConnectivityStore.setState({ isOnline: true, isServerReachable: true })
    })

    it('lists Save draft ⌘S exactly once while Save draft is offered (a phone: the hook holds it)', () => {
        renderShortcuts({ isPhone: true })
        const listed = listedSaveDraft()
        expect(listed).toHaveLength(1)
        expect(listed[0]?.description).toBe('Save draft')
    })

    it('lists no ⌘S while writes are unavailable', () => {
        useConnectivityStore.setState({ isServerReachable: false })
        renderShortcuts({ isPhone: true })
        expect(listedSaveDraft()).toEqual([])
    })

    it('lists no ⌘S while a save holds the form, on a wide screen too', () => {
        renderShortcuts({ isPhone: false, isPending: true })
        expect(listedSaveDraft()).toEqual([])
    })

    it('lists no ⌘S without write access', () => {
        renderShortcuts({ isPhone: false, canWrite: false })
        expect(listedSaveDraft()).toEqual([])
    })
})
