// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { notify } from '@tinycld/core/lib/notify/dispatcher'
import { type UseFormReturn, useForm } from '@tinycld/core/ui/form'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAccountForm } from '../tinycld/books/hooks/useAccountForm'
import { useBooksAccess } from '../tinycld/books/hooks/useBooksAccess'
import { typeLockMessage } from '../tinycld/books/lib/account-messages'
import type { AccountFormValues } from '../tinycld/books/lib/account-schema'
import { activeChildCount, parentChoices } from '../tinycld/books/lib/account-tree'
import { accountTypeDef } from '../tinycld/books/lib/account-types'
import {
    type PanelTarget,
    useAccountsPanelStore,
} from '../tinycld/books/stores/accounts-panel-store'
import {
    accountsStore,
    holdWrites,
    messageRefusal,
    seedBooks,
    serverRefusal,
    storedAccounts,
} from './accounts-form-harness'
import { fixtureRows } from './accounts-test-rows'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const rows = fixtureRows()

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function renderForm(initial: PanelTarget) {
    return renderHook(
        ({ target }: { target: PanelTarget }) => {
            const access = useBooksAccess()
            const account = useAccountForm(target, rows, true)
            // Read during render so the hook re-renders when an error is set.
            const errors = account.form.formState.errors
            return { access, errors, ...account }
        },
        { wrapper, initialProps: { target: initial } }
    )
}

type Rendered = ReturnType<typeof renderForm>

async function ready(rendered: Rendered) {
    await waitFor(() => expect(rendered.result.current.access.isReady).toBe(true))
}

function fill(rendered: Rendered, values: Partial<AccountFormValues>) {
    act(() => {
        for (const [key, value] of Object.entries(values)) {
            rendered.result.current.form.setValue(key as keyof AccountFormValues, value as never)
        }
    })
}

function rootMessage(rendered: Rendered): string | undefined {
    const root = rendered.result.current.errors.root as
        | { message?: string; server?: { message?: string } }
        | undefined
    return root?.message ?? root?.server?.message
}

function tick(ms = 30) {
    return act(async () => {
        await new Promise(resolve => setTimeout(resolve, ms))
    })
}

const newAccount = {
    name: 'Petty cash',
    number: '1005',
    type: 'bank',
    detail_type: 'cash_on_hand',
} as const

const blankNew: PanelTarget = { mode: 'new', parentId: '' }

beforeEach(() => {
    seedBooks()
})

describe('useAccountForm defaults', () => {
    it('gives a new target blank defaults and isEditing false', () => {
        const { result } = renderForm(blankNew)
        expect(result.current.form.getValues()).toEqual({
            name: '',
            number: '',
            type: '',
            detail_type: '',
            isSubAccount: false,
            parent: '',
            description: '',
        })
        expect(result.current.isEditing).toBe(false)
    })

    it('pre-fills isSubAccount, parent and type from the parent of a new sub-account', () => {
        const { result } = renderForm({ mode: 'new', parentId: 'acct_bank_0001' })
        expect(result.current.form.getValues()).toMatchObject({
            isSubAccount: true,
            parent: 'acct_bank_0001',
            type: 'bank',
        })
        expect(result.current.isEditing).toBe(false)
    })

    it('resets the form to row B when the edit target changes from row A to row B', async () => {
        const rendered = renderForm({ mode: 'edit', id: 'acct_bank_0002' })
        expect(rendered.result.current.isEditing).toBe(true)
        expect(rendered.result.current.form.getValues()).toMatchObject({
            name: 'Operating checking',
            number: '1010',
            type: 'bank',
            detail_type: 'checking',
            isSubAccount: true,
            parent: 'acct_bank_0001',
        })

        rendered.rerender({ target: { mode: 'edit', id: 'acct_ar_00001' } })

        await waitFor(() =>
            expect(rendered.result.current.form.getValues()).toMatchObject({
                name: 'Accounts receivable',
                number: '1100',
                type: 'accounts_receivable',
                detail_type: 'accounts_receivable',
                isSubAccount: false,
                parent: '',
            })
        )
    })
})

describe('useAccountForm options', () => {
    it('has no detail type options until a type is chosen, then that type detail types', () => {
        const rendered = renderForm(blankNew)
        expect(rendered.result.current.detailTypeOptions).toEqual([])

        fill(rendered, { type: 'bank' })

        const expected = accountTypeDef('bank')?.detailTypes.map(({ key, label }) => ({
            key,
            label,
        }))
        expect(expected?.length).toBeGreaterThan(1)
        expect(rendered.result.current.detailTypeOptions).toEqual(expected)
    })

    it('lists as parentOptions the parentChoices for the chosen type', () => {
        const rendered = renderForm(blankNew)
        fill(rendered, { type: 'fixed_asset' })

        const expected = parentChoices(rows, { type: 'fixed_asset', editingId: '' }).map(a => a.id)
        expect(expected.length).toBeGreaterThan(0)
        expect(rendered.result.current.parentOptions.map(a => a.id)).toEqual(expected)
    })

    it('excludes the edited account and its descendants from parentOptions', () => {
        const rendered = renderForm({ mode: 'edit', id: 'acct_fa_00002' })
        const ids = rendered.result.current.parentOptions.map(a => a.id)

        const expected = parentChoices(rows, { type: 'fixed_asset', editingId: 'acct_fa_00002' })
        expect(ids).toEqual(expected.map(a => a.id))
        expect(ids).toContain('acct_fa_00001')
        for (const excluded of [
            'acct_fa_00002',
            'acct_fa_00003',
            'acct_fa_00004',
            'acct_fa_00005',
        ]) {
            expect(ids).not.toContain(excluded)
        }
    })
})

describe('useAccountForm type lock', () => {
    it('gives typeLockReason for an edited account with sub-accounts, counting inactive ones', async () => {
        const id = 'acct_fa_00001'
        const children = rows.filter(r => r.parent === id).length
        // The fixture must tell "all sub-accounts" from "active sub-accounts".
        expect(children).toBeGreaterThan(activeChildCount(rows, id))

        const { result } = renderForm({ mode: 'edit', id })

        await waitFor(() =>
            expect(result.current.typeLockReason).toBe(typeLockMessage({ lines: 0, children }))
        )
    })

    it('gives the line message with the count for an edited account with journal lines', async () => {
        seedBooks({ linesOn: { acct_oca_0001: 4 } })
        const { result } = renderForm({ mode: 'edit', id: 'acct_oca_0001' })

        await waitFor(() =>
            expect(result.current.typeLockReason).toBe(typeLockMessage({ lines: 4, children: 0 }))
        )
        expect(result.current.typeLockReason).toContain('4')
    })
})

describe('useAccountForm save', () => {
    it('is read-only for a read-only user and save writes nothing', async () => {
        seedBooks({ level: 'read_only' })
        const rendered = renderForm({ mode: 'edit', id: 'acct_oca_0001' })
        await ready(rendered)
        const before = JSON.stringify(storedAccounts())
        const insert = vi.spyOn(accountsStore(), 'insert')
        const update = vi.spyOn(accountsStore(), 'update')

        expect(rendered.result.current.isReadOnly).toBe(true)
        fill(rendered, { name: 'Changed by a reader' })
        await act(async () => {
            await rendered.result.current.save()
        })

        expect(insert).not.toHaveBeenCalled()
        expect(update).not.toHaveBeenCalled()
        expect(JSON.stringify(storedAccounts())).toBe(before)
    })

    it('is not read-only for a bookkeeper', async () => {
        const rendered = renderForm(blankNew)
        await ready(rendered)
        expect(rendered.result.current.isReadOnly).toBe(false)
    })

    it('inserts exactly one books_accounts row with no currency field for a valid new account', async () => {
        const rendered = renderForm(blankNew)
        await ready(rendered)
        const before = storedAccounts().length
        fill(rendered, newAccount)

        await act(async () => {
            await rendered.result.current.save()
        })

        await waitFor(() => expect(storedAccounts()).toHaveLength(before + 1))
        const row = storedAccounts().find(r => r.name === 'Petty cash')
        expect(row).toMatchObject({
            number: '1005',
            type: 'bank',
            detail_type: 'cash_on_hand',
            parent: '',
        })
        expect('currency' in (row ?? {})).toBe(false)
        expect('isSubAccount' in (row ?? {})).toBe(false)
    })

    it('calls update with only the form fields for an edit target', async () => {
        const rendered = renderForm({ mode: 'edit', id: 'acct_oca_0001' })
        await ready(rendered)
        const update = vi.spyOn(accountsStore(), 'update')
        fill(rendered, { name: 'Renamed funds' })

        await act(async () => {
            await rendered.result.current.save()
        })

        expect(update).toHaveBeenCalledTimes(1)
        expect(update.mock.calls[0][0]).toBe('acct_oca_0001')
        const changed = Object.keys(update.mock.results[0].value.mutations[0].changes)
        expect(changed).toContain('name')
        const formFields = ['name', 'number', 'type', 'detail_type', 'parent', 'description']
        expect(changed.filter(key => !formFields.includes(key))).toEqual([])
        const row = storedAccounts().find(r => r.id === 'acct_oca_0001')
        expect(row?.name).toBe('Renamed funds')
        expect(row?.currency).toBe('USD')
        expect('isSubAccount' in (row ?? {})).toBe(false)
    })

    it('sets an error on number, and does not throw, when the server refuses a duplicate number', async () => {
        const message = 'Another account already uses number 1005.'
        seedBooks({ refusal: serverRefusal('number', message) })
        const rendered = renderForm(blankNew)
        await ready(rendered)
        fill(rendered, newAccount)

        await act(async () => {
            await expect(rendered.result.current.save()).resolves.toBeUndefined()
        })

        await waitFor(() => expect(rendered.result.current.errors.number?.message).toBe(message))
    })
})

describe('useAccountForm edit seeding', () => {
    it('keeps typed values when the rows re-render with a changed description', async () => {
        const rendered = renderHook(
            ({ accounts }: { accounts: typeof rows }) =>
                useAccountForm({ mode: 'edit', id: 'acct_oca_0001' }, accounts, true),
            { wrapper, initialProps: { accounts: rows } }
        )
        act(() => rendered.result.current.form.setValue('name', 'Typed name'))

        const changed = rows.map(r =>
            r.id === 'acct_oca_0001' ? { ...r, description: 'changed elsewhere' } : r
        )
        rendered.rerender({ accounts: changed })
        await tick()

        expect(rendered.result.current.form.getValues('name')).toBe('Typed name')
    })

    it('keeps the typed values and sets the field error when the server refuses an edit', async () => {
        seedBooks({ refusal: serverRefusal('number', 'Another account already uses number 1010.') })
        const rendered = renderForm({ mode: 'edit', id: 'acct_oca_0001' })
        await ready(rendered)
        fill(rendered, { name: 'Typed name', number: '1010' })

        await act(async () => {
            await rendered.result.current.save()
        })

        await waitFor(() =>
            expect(rendered.result.current.errors.number?.message).toBe(
                'Another account already uses number 1010.'
            )
        )
        expect(rendered.result.current.form.getValues()).toMatchObject({
            name: 'Typed name',
            number: '1010',
        })
    })
})

describe('useAccountForm type lock while usage loads', () => {
    it('exposes typeLocked true while the usage query is not ready for an edit target', async () => {
        seedBooks({ linesNeverReady: true })
        const rendered = renderForm({ mode: 'edit', id: 'acct_oca_0001' })
        await ready(rendered)
        await tick()
        expect(rendered.result.current.typeLocked).toBe(true)
    })

    it('exposes typeLocked false for an unused account once usage is ready, and for a new target', async () => {
        const edit = renderForm({ mode: 'edit', id: 'acct_oca_0001' })
        await waitFor(() => expect(edit.result.current.typeLocked).toBe(false))
        const created = renderForm(blankNew)
        expect(created.result.current.typeLocked).toBe(false)
    })

    it('exposes typeLocked true for an account with journal lines', async () => {
        seedBooks({ linesOn: { acct_oca_0001: 2 } })
        const rendered = renderForm({ mode: 'edit', id: 'acct_oca_0001' })
        await waitFor(() => expect(rendered.result.current.typeLocked).toBe(true))
    })
})

describe('useAccountForm refusals', () => {
    it('puts a message-only refusal in the root error and resolves without throwing', async () => {
        const message = 'Cannot place an account under an inactive parent.'
        seedBooks({ refusal: messageRefusal(message) })
        const rendered = renderForm(blankNew)
        await ready(rendered)
        fill(rendered, newAccount)

        await act(async () => {
            await expect(rendered.result.current.save()).resolves.toBeUndefined()
        })

        await waitFor(() => expect(rootMessage(rendered)).toBe(message))
        expect(rendered.result.current.errors.name).toBeUndefined()
    })

    it('still sets a field error for a field-shaped refusal', async () => {
        seedBooks({ refusal: serverRefusal('name', 'Name already used here.') })
        const rendered = renderForm(blankNew)
        await ready(rendered)
        fill(rendered, newAccount)

        await act(async () => {
            await rendered.result.current.save()
        })

        await waitFor(() =>
            expect(rendered.result.current.errors.name?.message).toBe('Name already used here.')
        )
    })
})

describe('useAccountForm save completion', () => {
    it('shows the new row in the store as soon as an awaited save() resolves', async () => {
        const rendered = renderForm(blankNew)
        await ready(rendered)
        const before = storedAccounts().length
        fill(rendered, newAccount)

        await act(async () => {
            await rendered.result.current.save()
        })

        expect(storedAccounts()).toHaveLength(before + 1)
    })

    it('does not resolve save() until the held write finishes', async () => {
        const rendered = renderForm(blankNew)
        await ready(rendered)
        fill(rendered, newAccount)
        const release = holdWrites()
        let settled = false
        let pending: Promise<void> = Promise.resolve()
        act(() => {
            pending = rendered.result.current.save().then(() => {
                settled = true
            })
        })

        await tick(60)
        expect(settled).toBe(false)

        release()
        await act(async () => {
            await pending
        })
        expect(settled).toBe(true)
    })

    it('does not resolve saveAndNew() until the held write finishes', async () => {
        const rendered = renderForm(blankNew)
        await ready(rendered)
        fill(rendered, newAccount)
        const release = holdWrites()
        let settled = false
        let pending: Promise<void> = Promise.resolve()
        act(() => {
            pending = rendered.result.current.saveAndNew().then(() => {
                settled = true
            })
        })

        await tick(60)
        expect(settled).toBe(false)

        release()
        await act(async () => {
            await pending
        })
        expect(settled).toBe(true)
    })

    it('inserts one row when save() is fired twice while the first is pending', async () => {
        const rendered = renderForm(blankNew)
        await ready(rendered)
        fill(rendered, newAccount)
        const release = holdWrites()
        let calls: Promise<void>[] = []
        act(() => {
            calls = [rendered.result.current.save(), rendered.result.current.save()]
        })
        await tick(60)
        release()
        await act(async () => {
            await Promise.all(calls)
        })

        expect(storedAccounts().filter(r => r.name === 'Petty cash')).toHaveLength(1)
    })

    it('sends no currency, and only form fields, in the update draft', async () => {
        const rendered = renderForm({ mode: 'edit', id: 'acct_oca_0001' })
        await ready(rendered)
        const store = accountsStore()
        const original = store.update.bind(store) as (
            id: string,
            cb: (draft: Record<string, unknown>) => void
        ) => unknown
        const assigned: string[] = []
        vi.spyOn(store, 'update').mockImplementation(((
            id: string,
            cb: (draft: Record<string, unknown>) => void
        ) =>
            original(id, draft =>
                cb(
                    new Proxy(draft, {
                        set(target, key, value) {
                            assigned.push(String(key))
                            target[String(key)] = value
                            return true
                        },
                    })
                )
            )) as never)
        fill(rendered, { name: 'Renamed funds' })

        await act(async () => {
            await rendered.result.current.save()
        })

        expect(assigned).not.toContain('currency')
        expect(assigned).toContain('name')
        const formFields = ['name', 'number', 'type', 'detail_type', 'parent', 'description']
        expect(assigned.filter(key => !formFields.includes(key))).toEqual([])
    })
})

describe('useAccountForm after a refused save', () => {
    const message = 'Cannot place an account under an inactive parent.'

    it('clears a message-only root error when any field changes', async () => {
        seedBooks({ refusal: messageRefusal(message) })
        const rendered = renderForm(blankNew)
        await ready(rendered)
        fill(rendered, newAccount)
        await act(async () => {
            await rendered.result.current.save()
        })
        expect(rootMessage(rendered)).toBe(message)

        fill(rendered, { name: 'Petty cash 2' })

        await waitFor(() => expect(rendered.result.current.errors.root).toBeUndefined())
    })

    it('keeps the fields and the stored rows when saveAndNew is refused', async () => {
        seedBooks({ refusal: messageRefusal(message) })
        const rendered = renderForm(blankNew)
        await ready(rendered)
        fill(rendered, newAccount)
        const before = storedAccounts().length

        await act(async () => {
            await rendered.result.current.saveAndNew()
        })

        expect(rendered.result.current.form.getValues()).toMatchObject(newAccount)
        expect(rootMessage(rendered)).toBe(message)
        expect(storedAccounts()).toHaveLength(before)
    })

    it('keeps the parent and the type, and blanks the rest, after saveAndNew for a new sub-account', async () => {
        const rendered = renderForm({ mode: 'new', parentId: 'acct_bank_0001' })
        await ready(rendered)
        fill(rendered, { name: 'Petty cash', detail_type: 'cash_on_hand' })

        await act(async () => {
            await rendered.result.current.saveAndNew()
        })

        expect(rendered.result.current.form.getValues()).toEqual({
            name: '',
            number: '',
            type: 'bank',
            detail_type: '',
            isSubAccount: true,
            parent: 'acct_bank_0001',
            description: '',
        })
    })
})

describe('useAccountForm save in flight while the target changes', () => {
    it('leaves the store target alone when the write of the old target completes', async () => {
        const first: PanelTarget = { mode: 'edit', id: 'acct_oca_0001' }
        const second: PanelTarget = { mode: 'edit', id: 'acct_bank_0002' }
        act(() => useAccountsPanelStore.setState({ target: first }))
        const rendered = renderForm(first)
        await ready(rendered)
        fill(rendered, { name: 'Renamed funds' })
        const release = holdWrites()
        let pending: Promise<void> = Promise.resolve()
        act(() => {
            pending = rendered.result.current.save()
        })
        await tick(30)

        act(() => useAccountsPanelStore.setState({ target: second }))
        rendered.rerender({ target: second })
        release()
        await act(async () => {
            await pending
        })

        expect(storedAccounts().find(a => a.id === 'acct_oca_0001')?.name).toBe('Renamed funds')
        expect(useAccountsPanelStore.getState().target).toMatchObject(second)
    })
})

describe('useAccountForm retarget detection by object identity', () => {
    const realClose = useAccountsPanelStore.getState().close

    afterEach(() => {
        vi.restoreAllMocks()
        act(() => useAccountsPanelStore.setState({ target: null, close: realClose }))
    })

    function openStore(target: PanelTarget) {
        act(() => useAccountsPanelStore.setState({ target }))
    }

    function closeSpy() {
        const close = vi.fn()
        act(() => useAccountsPanelStore.setState({ close }))
        return close
    }

    it('does not close or reset anything when a save succeeds after the panel was closed', async () => {
        const close = closeSpy()
        const t1: PanelTarget = { mode: 'new', parentId: '' }
        openStore(t1)
        const rendered = renderForm(t1)
        await ready(rendered)
        fill(rendered, newAccount)
        const release = holdWrites()
        let pending: Promise<void> = Promise.resolve()
        act(() => {
            pending = rendered.result.current.save()
        })
        await tick(30)

        act(() => useAccountsPanelStore.setState({ target: null }))
        release()
        await act(async () => {
            await pending
        })

        expect(close).not.toHaveBeenCalled()
        expect(useAccountsPanelStore.getState().target).toBeNull()
    })

    it('does not reset the form when a saveAndNew succeeds after the panel was closed', async () => {
        const t1: PanelTarget = { mode: 'new', parentId: '' }
        openStore(t1)
        const rendered = renderForm(t1)
        await ready(rendered)
        fill(rendered, newAccount)
        const release = holdWrites()
        let pending: Promise<void> = Promise.resolve()
        act(() => {
            pending = rendered.result.current.saveAndNew()
        })
        await tick(30)

        act(() => useAccountsPanelStore.setState({ target: null }))
        release()
        await act(async () => {
            await pending
        })

        expect(rendered.result.current.form.getValues()).toMatchObject(newAccount)
    })

    it('sends a refusal to notify, not to the dead form, when the panel was closed during the save', async () => {
        const emit = vi.spyOn(notify, 'emit').mockImplementation(() => {})
        seedBooks({ refusal: serverRefusal('number', 'Another account already uses number 1005.') })
        const t1: PanelTarget = { mode: 'new', parentId: '' }
        openStore(t1)
        const rendered = renderForm(t1)
        await ready(rendered)
        fill(rendered, newAccount)
        const release = holdWrites()
        let pending: Promise<void> = Promise.resolve()
        act(() => {
            pending = rendered.result.current.save()
        })
        await tick(30)

        act(() => useAccountsPanelStore.setState({ target: null }))
        release()
        await act(async () => {
            await pending
        })

        expect(emit).toHaveBeenCalled()
        expect(rendered.result.current.errors.number).toBeUndefined()
        expect(rootMessage(rendered)).toBeUndefined()
    })

    it.each([
        'save',
        'saveAndNew',
    ] as const)('leaves the fresh panel open and its form untouched when %s completes after Cancel and a new New account', async method => {
        const t1: PanelTarget = { mode: 'new', parentId: '' }
        openStore(t1)
        const rendered = renderForm(t1)
        await ready(rendered)
        fill(rendered, newAccount)
        const release = holdWrites()
        let pending: Promise<void> = Promise.resolve()
        act(() => {
            pending = rendered.result.current[method]()
        })
        await tick(30)

        // Same key as t1, but a new object: this is a different panel.
        const t2: PanelTarget = { mode: 'new', parentId: '' }
        act(() => useAccountsPanelStore.setState({ target: null }))
        openStore(t2)
        rendered.rerender({ target: t2 })
        fill(rendered, { name: 'Fresh typing' })
        release()
        await act(async () => {
            await pending
        })

        expect(useAccountsPanelStore.getState().target).toBe(t2)
        expect(rendered.result.current.form.getValues('name')).toBe('Fresh typing')
    })
})

describe('useAccountForm when the edited row is gone', () => {
    it('does not call update, even when save() is called directly with valid values', async () => {
        const without = rows.filter(r => r.id !== 'acct_oca_0001')
        const rendered = renderHook(
            () => {
                const access = useBooksAccess()
                return {
                    access,
                    ...useAccountForm({ mode: 'edit', id: 'acct_oca_0001' }, without, true),
                }
            },
            { wrapper }
        )
        await waitFor(() => expect(rendered.result.current.access.isReady).toBe(true))
        const update = vi.spyOn(accountsStore(), 'update')
        const insert = vi.spyOn(accountsStore(), 'insert')
        act(() => {
            for (const [key, value] of Object.entries(newAccount)) {
                rendered.result.current.form.setValue(
                    key as keyof AccountFormValues,
                    value as never
                )
            }
        })

        await act(async () => {
            await rendered.result.current.save()
        })

        expect(update).not.toHaveBeenCalled()
        expect(insert).not.toHaveBeenCalled()
    })
})

describe('useAccountForm root error clearing', () => {
    // Plain react-hook-form is the floor: typing may re-render it, but the
    // hook must not add renders of its own while there is no root error.
    async function rendersWhileTyping(useProbe: () => UseFormReturn<AccountFormValues>) {
        let renders = 0
        const rendered = renderHook(
            () => {
                renders += 1
                const form = useProbe()
                // Read during render so the probe subscribes to formState, as the panel does.
                return form.formState.errors && form
            },
            { wrapper }
        )
        await tick()
        const baseline = renders
        const text = 'Petty cash'
        for (let i = 1; i <= text.length; i += 1) {
            act(() => {
                rendered.result.current.setValue('name', text.slice(0, i))
            })
        }
        return renders - baseline
    }

    it('adds no renders over plain react-hook-form while typing with no root error', async () => {
        const plain = await rendersWhileTyping(() =>
            useForm<AccountFormValues>({ defaultValues: { name: '' } })
        )
        const hook = await rendersWhileTyping(() => useAccountForm(blankNew, rows, true).form)

        expect(hook).toBeLessThanOrEqual(plain)
    })
})

describe('useAccountForm isMissing while the accounts query loads', () => {
    const target: PanelTarget = { mode: 'edit', id: 'acct_oca_0001' }

    function renderMissing(initial: { accounts: typeof rows; isReady: boolean }) {
        return renderHook(
            ({ accounts, isReady }: { accounts: typeof rows; isReady: boolean }) =>
                useAccountForm(target, accounts, isReady),
            { wrapper, initialProps: initial }
        )
    }

    it('is false when the row is absent and the query is not ready', () => {
        const rendered = renderMissing({ accounts: [], isReady: false })
        expect(rendered.result.current.isMissing).toBe(false)
    })

    it('stays false through a transient empty result while the query is not ready', () => {
        const rendered = renderMissing({ accounts: rows, isReady: true })
        expect(rendered.result.current.isMissing).toBe(false)
        rendered.rerender({ accounts: [], isReady: false })
        expect(rendered.result.current.isMissing).toBe(false)
    })

    it('is true once the query is ready and the row is gone', () => {
        const rendered = renderMissing({ accounts: rows, isReady: true })
        rendered.rerender({ accounts: [], isReady: false })
        rendered.rerender({ accounts: [], isReady: true })
        expect(rendered.result.current.isMissing).toBe(true)
    })

    it('is false when the row is present and the query is ready', () => {
        const rendered = renderMissing({ accounts: rows, isReady: true })
        expect(rendered.result.current.isMissing).toBe(false)
    })
})
