// @vitest-environment happy-dom

import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAdjustmentForm } from '../tinycld/books/hooks/useAdjustmentForm'
import { ADJUSTMENT_MESSAGES } from '../tinycld/books/lib/adjustment-schema'
import { emptyAdjustmentLine } from '../tinycld/books/lib/adjustment-values'
import { onDemandStore, seedBooks } from './accounts-form-harness'

// After a submit, an edit of a line validates the line again. The line's inputs are
// controlled (no register), so the check runs on each path of the line: an error stays
// while its value is still wrong (a blur that formats "-1" as "-1.00" keeps it) and goes
// when the value is right.

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const ITEM = 'prodrevalid0001'

function renderForm() {
    seedBooks()
    onDemandStore('books_products', [
        {
            id: ITEM,
            name: ITEM,
            type: 'inventory',
            inactive: false,
            quantity_on_hand: 10,
            default_bin: '',
            asset_account: '',
        },
    ])
    onDemandStore('books_bin_stock', [])
    return renderHook(() =>
        useAdjustmentForm({
            initial: {
                date: '2026-11-27',
                account: '',
                memo: '',
                lines: [emptyAdjustmentLine(), emptyAdjustmentLine()],
            },
            hasBins: false,
            isActiveBin: () => true,
        })
    )
}

describe('useAdjustmentForm: a line validated again after a submit', () => {
    it('keeps an error while the value is wrong, and drops it once it is right', async () => {
        const hook = renderForm()
        act(() => hook.result.current.line.setItem(0, ITEM))
        await waitFor(() => expect(hook.result.current.stock.isKnown(ITEM)).toBe(true))
        act(() => hook.result.current.line.setChange(0, '5'))
        act(() => hook.result.current.line.setValue(0, '-1'))
        await act(async () => {
            await hook.result.current.form.handleSubmit(() => {})()
        })
        const valueError = () =>
            hook.result.current.form.control._formState.errors.lines?.[0]?.value?.message

        expect(valueError()).toBe(ADJUSTMENT_MESSAGES.increaseBelowZero)
        // The blur's format of the same value.
        await act(async () => {
            hook.result.current.line.setValue(0, '-1.00')
            await new Promise(resolve => setTimeout(resolve, 20))
        })
        expect(valueError()).toBe(ADJUSTMENT_MESSAGES.increaseBelowZero)

        await act(async () => {
            hook.result.current.line.setValue(0, '1.00')
            await new Promise(resolve => setTimeout(resolve, 20))
        })
        expect(valueError()).toBeUndefined()
    })
})
