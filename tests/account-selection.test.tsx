// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAccountSelection } from '../tinycld/books/hooks/useAccountSelection'
import { useAccountsScreen } from '../tinycld/books/hooks/useAccountsScreen'
import {
    enteredWrites,
    holdWrites,
    messageRefusal,
    seedBooks,
    storedAccounts,
} from './accounts-form-harness'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
    seedBooks()
})

describe('useAccountSelection', () => {
    it('toggle adds an id and a second toggle removes it', () => {
        const { result } = renderHook(() => useAccountSelection())
        act(() => result.current.toggle('a'))
        expect(result.current.isSelected('a')).toBe(true)
        expect([...result.current.selectedIds]).toEqual(['a'])
        act(() => result.current.toggle('a'))
        expect(result.current.isSelected('a')).toBe(false)
        expect(result.current.selectedIds.size).toBe(0)
    })

    it('clear empties the selection', () => {
        const { result } = renderHook(() => useAccountSelection())
        act(() => result.current.toggle('a'))
        act(() => result.current.toggle('b'))
        expect(result.current.selectedIds.size).toBe(2)
        act(() => result.current.clear())
        expect(result.current.selectedIds.size).toBe(0)
        expect(result.current.isSelected('b')).toBe(false)
    })

    it('toggling a parent id does not add its children', async () => {
        const { result } = renderHook(
            () => ({
                selection: useAccountSelection(),
                screen: useAccountsScreen(),
            }),
            { wrapper }
        )
        await waitFor(() => expect(result.current.screen.isReady).toBe(true))
        act(() => result.current.selection.toggle('acct_bank_0001'))
        expect([...result.current.selection.selectedIds]).toEqual(['acct_bank_0001'])
        expect(result.current.selection.isSelected('acct_bank_0002')).toBe(false)
    })
})

describe('useAccountsScreen makeSelectedInactive', () => {
    async function renderScreen() {
        const rendered = renderHook(() => useAccountsScreen(), { wrapper })
        await waitFor(() => expect(rendered.result.current.isReady).toBe(true))
        return rendered
    }

    it('makes exactly the selected ids inactive and clears the selection on success', async () => {
        const { result } = await renderScreen()
        const inactiveBefore = storedAccounts()
            .filter(a => a.inactive)
            .map(a => a.id)
        act(() => result.current.selection.toggle('acct_ar_00001'))
        act(() => result.current.selection.toggle('acct_ap_00001'))
        await act(async () => {
            await result.current.makeSelectedInactive()
        })
        const inactive = storedAccounts()
            .filter(a => a.inactive)
            .map(a => a.id)
            .sort()
        expect(inactive).toEqual(
            [...new Set([...inactiveBefore, 'acct_ar_00001', 'acct_ap_00001'])].sort()
        )
        expect(result.current.selection.selectedIds.size).toBe(0)
        expect(result.current.actionError).toBeNull()
    })

    it('keeps the selection and shows the refusal when the server refuses', async () => {
        seedBooks({ refusal: messageRefusal('Make the 2 active sub-accounts inactive first.') })
        const { result } = await renderScreen()
        act(() => result.current.selection.toggle('acct_bank_0001'))
        await act(async () => {
            await result.current.makeSelectedInactive()
        })
        expect(result.current.actionError).toContain(
            'Make the 2 active sub-accounts inactive first.'
        )
        expect([...result.current.selection.selectedIds]).toEqual(['acct_bank_0001'])
    })
})

const A = 'acct_ar_00001'
const B = 'acct_ap_00001'
const C = 'acct_cc_00001'
const PARENT = 'acct_bank_0001'
const INACTIVE = 'acct_fa_00007'
const KID1 = 'acct_bank_0002'
const KID2 = 'acct_bank_0003'
const REFUSAL = 'Make the 2 active sub-accounts inactive first.'

async function renderScreenHook() {
    const rendered = renderHook(() => useAccountsScreen(), { wrapper })
    await waitFor(() => expect(rendered.result.current.isReady).toBe(true))
    return rendered
}

function select(result: { current: ReturnType<typeof useAccountsScreen> }, ...ids: string[]) {
    for (const id of ids) act(() => result.current.selection.toggle(id))
}

function inactiveOf(id: string) {
    return storedAccounts().find(a => a.id === id)?.inactive
}

describe('useAccountsScreen effective selection', () => {
    it('selectedCount counts the selected visible rows', async () => {
        const { result } = await renderScreenHook()
        select(result, A, B)
        expect(result.current.selectedCount).toBe(2)
    })

    it('deleting a selected account removes it from the count', async () => {
        const { result } = await renderScreenHook()
        select(result, B, C)
        await act(async () => {
            await result.current.actions.deleteAccount(C)
        })
        await waitFor(() => expect(result.current.selectedCount).toBe(1))
    })

    it('a search that hides a selected row removes it from the count and from the batch', async () => {
        const { result } = await renderScreenHook()
        select(result, A, B)
        act(() => result.current.tree.setQuery('payable'))
        expect(result.current.selectedCount).toBe(1)
        await act(async () => {
            await result.current.makeSelectedInactive()
        })
        expect(enteredWrites()).toEqual([B])
        expect(inactiveOf(A)).toBe(false)
        expect(inactiveOf(B)).toBe(true)
    })

    it('collapsing a parent removes its selected children from the count and from the batch', async () => {
        const { result } = await renderScreenHook()
        select(result, KID1, A)
        act(() => result.current.tree.toggleCollapsed(PARENT))
        expect(result.current.selectedCount).toBe(1)
        await act(async () => {
            await result.current.makeSelectedInactive()
        })
        expect(enteredWrites()).toEqual([A])
        expect(inactiveOf(KID1)).toBe(false)
    })

    it('after a partial refusal drops exactly the made-inactive ids and keeps the failed and unattempted ones', async () => {
        seedBooks({ refusalFor: { [A]: messageRefusal(REFUSAL) } })
        const { result } = await renderScreenHook()
        select(result, A, B, C)
        await act(async () => {
            await result.current.makeSelectedInactive()
        })
        expect(enteredWrites()).toEqual([B, A])
        expect(inactiveOf(B)).toBe(true)
        expect(result.current.actionError).toBe(`1 of 3 made inactive. ${REFUSAL}`)
        expect([...result.current.selection.selectedIds].sort()).toEqual([A, C])
        expect(result.current.selectedCount).toBe(2)
    })

    it('after a refusal keeps the refused row and the ticked rows a search hides', async () => {
        seedBooks({ refusalFor: { [B]: messageRefusal(REFUSAL) } })
        const { result } = await renderScreenHook()
        select(result, A, B, C)
        act(() => result.current.tree.setQuery('payable'))
        expect(result.current.selectedCount).toBe(1)
        await act(async () => {
            await result.current.makeSelectedInactive()
        })
        expect(enteredWrites()).toEqual([B])
        expect([...result.current.selection.selectedIds].sort()).toEqual([A, B, C].sort())
    })

    it('after a partial refusal keeps a hidden, already inactive ticked row ticked', async () => {
        seedBooks({ refusalFor: { [A]: messageRefusal(REFUSAL) } })
        const { result } = await renderScreenHook()
        select(result, INACTIVE, A, B, C)
        expect(result.current.selectedCount).toBe(3)
        await act(async () => {
            await result.current.makeSelectedInactive()
        })
        expect(enteredWrites()).toEqual([B, A])
        expect([...result.current.selection.selectedIds].sort()).toEqual([A, C, INACTIVE].sort())
    })

    it('on success drops only the acted-on ids and leaves a ticked row a search hides ticked', async () => {
        const { result } = await renderScreenHook()
        select(result, A, B)
        act(() => result.current.tree.setQuery('payable'))
        expect(result.current.selectedCount).toBe(1)
        await act(async () => {
            await result.current.makeSelectedInactive()
        })
        expect(enteredWrites()).toEqual([B])
        expect([...result.current.selection.selectedIds]).toEqual([A])
    })
})

describe('useAccountsScreen batch order', () => {
    it('makes children inactive before their parent even when the parent was selected first', async () => {
        const { result } = await renderScreenHook()
        select(result, PARENT, KID1, KID2)
        await act(async () => {
            await result.current.makeSelectedInactive()
        })
        expect(enteredWrites()).toEqual([KID1, KID2, PARENT])
        expect([PARENT, KID1, KID2].map(inactiveOf)).toEqual([true, true, true])
        expect(result.current.actionError).toBeNull()
        expect(result.current.selection.selectedIds.size).toBe(0)
    })
})

describe('useAccountsScreen isWorking', () => {
    it('is false when idle', async () => {
        const { result } = await renderScreenHook()
        expect(result.current.isWorking).toBe(false)
    })

    it('is true while a batch is pending and a second call does nothing', async () => {
        const release = holdWrites()
        const { result } = await renderScreenHook()
        select(result, A, B)
        let first: Promise<void> = Promise.resolve()
        act(() => {
            first = result.current.makeSelectedInactive()
        })
        await waitFor(() => expect(result.current.isWorking).toBe(true))
        await act(async () => {
            await result.current.makeSelectedInactive()
        })
        release()
        await act(async () => {
            await first
        })
        expect(enteredWrites()).toEqual([B, A])
        await waitFor(() => expect(result.current.isWorking).toBe(false))
    })

    function rowOf(result: { current: ReturnType<typeof useAccountsScreen> }, id: string) {
        const row = result.current.accounts.find(a => a.id === id)
        if (!row) throw new Error(`no row ${id}`)
        return row
    }

    async function settle() {
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 50))
        })
    }

    it('menu.onToggleInactive called twice in one tick writes once', async () => {
        const release = holdWrites()
        const { result } = await renderScreenHook()
        act(() => {
            result.current.menu.onToggleInactive(rowOf(result, A))
            result.current.menu.onToggleInactive(rowOf(result, B))
        })
        await settle()
        expect(enteredWrites()).toEqual([A])
        release()
        await waitFor(() => expect(result.current.isWorking).toBe(false))
        expect(enteredWrites()).toEqual([A])
        expect(inactiveOf(B)).toBe(false)
    })

    it('menu.onToggleInactive is ignored while a batch is working', async () => {
        const release = holdWrites()
        const { result } = await renderScreenHook()
        select(result, A, B)
        let batch: Promise<void> = Promise.resolve()
        act(() => {
            batch = result.current.makeSelectedInactive()
        })
        await waitFor(() => expect(result.current.isWorking).toBe(true))
        act(() => result.current.menu.onToggleInactive(rowOf(result, C)))
        await settle()
        release()
        await act(async () => {
            await batch
        })
        expect(enteredWrites()).toEqual([B, A])
        expect(inactiveOf(C)).toBe(false)
    })

    it('menu.onToggleInactive writes nothing while a delete is working', async () => {
        const release = holdWrites()
        const { result } = await renderScreenHook()
        let pending: Promise<boolean> = Promise.resolve(true)
        act(() => {
            pending = result.current.actions.deleteAccount(C)
        })
        await waitFor(() => expect(result.current.isWorking).toBe(true))
        act(() => result.current.menu.onToggleInactive(rowOf(result, A)))
        await settle()
        release()
        await act(async () => {
            await pending
        })
        expect(enteredWrites()).toEqual([C])
        expect(inactiveOf(A)).toBe(false)
    })

    it('accepts a later menu.onToggleInactive after an earlier call was refused', async () => {
        seedBooks({ refusalFor: { [A]: messageRefusal(REFUSAL) } })
        const { result } = await renderScreenHook()
        await act(async () => {
            await result.current.actions.setInactive([A], true)
        })
        expect(inactiveOf(A)).toBe(false)
        act(() => result.current.menu.onToggleInactive(rowOf(result, B)))
        await waitFor(() => expect(inactiveOf(B)).toBe(true))
        expect(result.current.actionError).toBeNull()
    })

    it('is true while a delete is pending', async () => {
        const release = holdWrites()
        const { result } = await renderScreenHook()
        let pending: Promise<boolean> = Promise.resolve(true)
        act(() => {
            pending = result.current.actions.deleteAccount(C)
        })
        await waitFor(() => expect(result.current.isWorking).toBe(true))
        release()
        await act(async () => {
            await pending
        })
        await waitFor(() => expect(result.current.isWorking).toBe(false))
    })
})

describe('useAccountsScreen owns the one actions instance', () => {
    it('clears a refused delete when the dialog target is cancelled', async () => {
        seedBooks({ refusalFor: { [C]: messageRefusal('This account has journal lines.') } })
        const { result } = await renderScreenHook()
        act(() => result.current.menu.onDelete(C))
        expect(result.current.deleteTarget?.id).toBe(C)
        await act(async () => {
            await result.current.actions.deleteAccount(C)
        })
        expect(result.current.actionError).toBe('This account has journal lines.')
        act(() => result.current.cancelDelete())
        expect(result.current.deleteTarget).toBeNull()
        expect(result.current.actionError).toBeNull()
        expect(result.current.actions.actionError).toBeNull()
    })

    it('opening Delete clears an error left by an earlier refused action', async () => {
        seedBooks({ refusal: messageRefusal(REFUSAL) })
        const { result } = await renderScreenHook()
        await act(async () => {
            await result.current.actions.setInactive([PARENT], true)
        })
        expect(result.current.actionError).toBe(REFUSAL)
        act(() => result.current.menu.onDelete(C))
        expect(result.current.deleteTarget?.id).toBe(C)
        expect(result.current.actionError).toBeNull()
    })

    it('after a refused batch, opening Delete on another row shows no error', async () => {
        seedBooks({ refusalFor: { [A]: messageRefusal(REFUSAL) } })
        const { result } = await renderScreenHook()
        select(result, A, B)
        await act(async () => {
            await result.current.makeSelectedInactive()
        })
        expect(result.current.actionError).toBe(`1 of 2 made inactive. ${REFUSAL}`)
        act(() => result.current.menu.onDelete(C))
        expect(result.current.deleteTarget?.id).toBe(C)
        expect(result.current.actionError).toBeNull()
        expect(result.current.actions.actionError).toBeNull()
    })

    it('shows a refused make-inactive from the actions in the screen actionError', async () => {
        seedBooks({ refusal: messageRefusal(REFUSAL) })
        const { result } = await renderScreenHook()
        await act(async () => {
            await result.current.actions.setInactive([PARENT], true)
        })
        expect(result.current.actionError).toBe(REFUSAL)
    })

    it('clearActionError clears the shared error', async () => {
        seedBooks({ refusal: messageRefusal(REFUSAL) })
        const { result } = await renderScreenHook()
        await act(async () => {
            await result.current.actions.setInactive([PARENT], true)
        })
        act(() => result.current.clearActionError())
        await waitFor(() => expect(result.current.actionError).toBeNull())
    })
})
