// @vitest-environment happy-dom
import { act, fireEvent, render, renderHook } from '@testing-library/react'
import { OverlayProvider } from '@tinycld/core/ui/overlay'
import { router } from 'expo-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountsEmptyState } from '../tinycld/books/components/accounts/AccountsEmptyState'
import { AccountsScreenView } from '../tinycld/books/components/accounts/AccountsScreenView'
import { useAccountTree } from '../tinycld/books/hooks/useAccountTree'
import { accountTypeDef } from '../tinycld/books/lib/account-types'
import { byTestId, fixtureRows } from './accounts-test-rows'
import { viewProps } from './accounts-view-props'

// Assumed signature: AccountsEmptyState({ hasFilters, hasHiddenInactive, canWrite,
// onNew, onClear, onShowInactive }). hasFilters means a query or group is active;
// hasHiddenInactive means accounts exist but all are hidden as inactive.
function renderEmpty(
    props: { hasFilters?: boolean; hasHiddenInactive?: boolean; canWrite?: boolean } = {}
) {
    const onNew = vi.fn()
    const onClear = vi.fn()
    const onShowInactive = vi.fn()
    const view = render(
        <AccountsEmptyState
            hasFilters={props.hasFilters ?? false}
            hasHiddenInactive={props.hasHiddenInactive ?? false}
            canWrite={props.canWrite ?? true}
            onNew={onNew}
            onClear={onClear}
            onShowInactive={onShowInactive}
        />
    )
    return { ...view, onNew, onClear, onShowInactive }
}

describe('AccountsEmptyState without filters', () => {
    beforeEach(() => {
        vi.mocked(router.push).mockClear()
    })

    it('shows No accounts yet, New account and Import from CSV to a writer', () => {
        const { getByText } = renderEmpty({ canWrite: true })
        expect(getByText('No accounts yet')).toBeTruthy()
        expect(getByText('New account')).toBeTruthy()
        expect(getByText('Import from CSV')).toBeTruthy()
    })

    it('Import from CSV goes to books/accounts/import', () => {
        const { container } = renderEmpty()
        fireEvent.click(byTestId(container, 'account-empty-import') as HTMLElement)
        expect(router.push).toHaveBeenCalledWith('/a/books/accounts/import')
    })

    it('New account calls onNew', () => {
        const { getByText, onNew } = renderEmpty()
        fireEvent.click(getByText('New account'))
        expect(onNew).toHaveBeenCalledTimes(1)
    })

    it('a read-only user sees the message with no button and no link', () => {
        const { getByText, queryByText, container } = renderEmpty({ canWrite: false })
        expect(getByText('No accounts yet')).toBeTruthy()
        expect(queryByText('New account')).toBeNull()
        expect(queryByText('Import from CSV')).toBeNull()
        expect(byTestId(container, 'account-empty-import')).toBeNull()
    })
})

describe('AccountsEmptyState with filters', () => {
    it('shows No accounts match and a Clear filters button that calls onClear', () => {
        const { getByText, queryByText, onClear } = renderEmpty({ hasFilters: true })
        expect(getByText('No accounts match')).toBeTruthy()
        expect(queryByText('No accounts yet')).toBeNull()
        fireEvent.click(getByText('Clear filters'))
        expect(onClear).toHaveBeenCalledTimes(1)
    })

    it('offers no Import link while filters hide the accounts', () => {
        const { queryByText } = renderEmpty({ hasFilters: true })
        expect(queryByText('Import from CSV')).toBeNull()
    })
})

function renderView(
    tree: ReturnType<typeof useAccountTree>,
    isWide: boolean,
    opts: { canWrite?: boolean; onNew?: () => void } = {}
) {
    return render(
        <OverlayProvider>
            <AccountsScreenView
                isReady={true}
                isWide={isWide}
                canWrite={opts.canWrite ?? true}
                isError={false}
                tree={tree}
                {...viewProps()}
                onOpen={vi.fn()}
                onNew={opts.onNew ?? vi.fn()}
                onRetry={vi.fn()}
            />
        </OverlayProvider>
    )
}

describe('AccountsScreenView empty states', () => {
    it.each([true, false])('zero accounts shows the empty state and no table (wide=%s)', isWide => {
        const tree = renderHook(() => useAccountTree(fixtureRows().slice(0, 0))).result.current
        const { getByText, queryByText, container } = renderView(tree, isWide)
        expect(getByText('No accounts yet')).toBeTruthy()
        expect(queryByText('Balance')).toBeNull()
        expect(byTestId(container, 'account-row-acct_bank_0001')).toBeNull()
        expect(byTestId(container, 'account-card-acct_bank_0001')).toBeNull()
    })

    it.each([
        true,
        false,
    ])('a query matching nothing shows no-match and no table (wide=%s)', isWide => {
        const hook = renderHook(() => useAccountTree(fixtureRows()))
        act(() => hook.result.current.setQuery('zzzz-no-such-account'))
        const { getByText, queryByText, container } = renderView(hook.result.current, isWide)
        expect(getByText('No accounts match')).toBeTruthy()
        expect(queryByText('No accounts yet')).toBeNull()
        expect(queryByText('Balance')).toBeNull()
        expect(byTestId(container, 'account-row-acct_bank_0001')).toBeNull()
        expect(byTestId(container, 'account-card-acct_bank_0001')).toBeNull()
    })

    it('Clear filters in the view resets the query', () => {
        const hook = renderHook(() => useAccountTree(fixtureRows()))
        act(() => hook.result.current.setQuery('zzzz-no-such-account'))
        const { getByText } = renderView(hook.result.current, true)
        act(() => {
            fireEvent.click(getByText('Clear filters'))
        })
        expect(hook.result.current.query).toBe('')
    })

    it('mounts the toolbar above the tree', () => {
        const tree = renderHook(() => useAccountTree(fixtureRows())).result.current
        const { container } = renderView(tree, true)
        const search = byTestId(container, 'account-search') as HTMLElement
        const firstRow = byTestId(container, 'account-row-acct_bank_0001') as HTMLElement
        expect(search).not.toBeNull()
        expect(firstRow).not.toBeNull()
        expect(
            search.compareDocumentPosition(firstRow) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
    })

    it.each([true, false])('mounts the toolbar above the empty message (wide=%s)', isWide => {
        const rows = fixtureRows().map(row => ({ ...row, inactive: true }))
        const tree = renderHook(() => useAccountTree(rows)).result.current
        const { container, getByText } = renderView(tree, isWide)
        const search = byTestId(container, 'account-search') as HTMLElement
        const message = getByText('No accounts match')
        expect(
            search.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
    })
})

describe('AccountsScreenView empty message follows whether accounts exist', () => {
    it.each([
        true,
        false,
    ])('all accounts inactive with Show inactive off says No accounts match and keeps the toolbar (wide=%s)', isWide => {
        const rows = fixtureRows().map(row => ({ ...row, inactive: true }))
        const tree = renderHook(() => useAccountTree(rows)).result.current
        const { getByText, queryByText, container } = renderView(tree, isWide)
        expect(getByText('No accounts match')).toBeTruthy()
        expect(queryByText('No accounts yet')).toBeNull()
        expect(byTestId(container, 'account-search')).not.toBeNull()
    })

    it.each([
        true,
        false,
    ])('zero accounts says No accounts yet with no toolbar (wide=%s)', isWide => {
        const tree = renderHook(() => useAccountTree(fixtureRows().slice(0, 0))).result.current
        const { getByText, queryByText, container } = renderView(tree, isWide)
        expect(getByText('No accounts yet')).toBeTruthy()
        expect(queryByText('No accounts match')).toBeNull()
        expect(byTestId(container, 'account-search')).toBeNull()
    })

    it.each([
        true,
        false,
    ])('a read-only user with zero accounts sees No accounts yet without New account or Import (wide=%s)', isWide => {
        const tree = renderHook(() => useAccountTree(fixtureRows().slice(0, 0))).result.current
        const { getByText, queryByText, container } = renderView(tree, isWide, { canWrite: false })
        expect(getByText('No accounts yet')).toBeTruthy()
        expect(queryByText('New account')).toBeNull()
        expect(queryByText('Import from CSV')).toBeNull()
        expect(byTestId(container, 'account-empty-import')).toBeNull()
    })

    it.each([
        true,
        false,
    ])('the empty state New account button calls onNew for a writer (wide=%s)', isWide => {
        const tree = renderHook(() => useAccountTree(fixtureRows().slice(0, 0))).result.current
        const onNew = vi.fn()
        const { container } = renderView(tree, isWide, { onNew })
        const empty = byTestId(container, 'accounts-empty') as HTMLElement
        const button = Array.from(empty.querySelectorAll('*')).find(
            el => el.children.length === 0 && el.textContent === 'New account'
        ) as HTMLElement
        fireEvent.click(button)
        expect(onNew).toHaveBeenCalledTimes(1)
    })
})

describe('AccountsEmptyState with every account hidden as inactive', () => {
    it('shows No accounts match and a Show inactive action that calls onShowInactive', () => {
        const { getByText, queryByText, container, onShowInactive, onClear } = renderEmpty({
            hasHiddenInactive: true,
        })
        expect(getByText('No accounts match')).toBeTruthy()
        expect(queryByText('Clear filters')).toBeNull()
        const action = byTestId(container, 'account-empty-show-inactive') as HTMLElement
        expect(action.textContent).toContain('Show inactive')
        fireEvent.click(action)
        expect(onShowInactive).toHaveBeenCalledTimes(1)
        expect(onClear).not.toHaveBeenCalled()
    })

    it('shows the same for a read-only user', () => {
        const { container, queryByText } = renderEmpty({ hasHiddenInactive: true, canWrite: false })
        expect(byTestId(container, 'account-empty-show-inactive')).not.toBeNull()
        expect(queryByText('New account')).toBeNull()
        expect(queryByText('Import from CSV')).toBeNull()
    })

    it('an active query or group wins: Clear filters, no Show inactive action', () => {
        const { getByText, container, onClear } = renderEmpty({
            hasFilters: true,
            hasHiddenInactive: true,
        })
        expect(byTestId(container, 'account-empty-show-inactive')).toBeNull()
        fireEvent.click(getByText('Clear filters'))
        expect(onClear).toHaveBeenCalledTimes(1)
    })

    it('plain filters give no Show inactive action', () => {
        const { container } = renderEmpty({ hasFilters: true })
        expect(byTestId(container, 'account-empty-show-inactive')).toBeNull()
    })
})

// A harness holds real useAccountTree state so the view re-renders after each action.
function Harness({ rows, isWide }: { rows: ReturnType<typeof fixtureRows>; isWide: boolean }) {
    const tree = useAccountTree(rows)
    return (
        <AccountsScreenView
            isReady={true}
            isWide={isWide}
            canWrite={true}
            isError={false}
            tree={tree}
            {...viewProps()}
            onOpen={vi.fn()}
            onNew={vi.fn()}
            onRetry={vi.fn()}
        />
    )
}

function renderHarness(rows: ReturnType<typeof fixtureRows>, isWide: boolean) {
    return render(
        <OverlayProvider>
            <Harness rows={rows} isWide={isWide} />
        </OverlayProvider>
    )
}

const rowId = (isWide: boolean, id: string) => (isWide ? `account-row-${id}` : `account-card-${id}`)

describe('AccountsScreenView recovery from an empty result (real tree state)', () => {
    it.each([
        true,
        false,
    ])('all inactive: Show inactive replaces Clear filters and brings rows back (wide=%s)', isWide => {
        const rows = fixtureRows().map(row => ({ ...row, inactive: true }))
        const { getByText, queryByText, container } = renderHarness(rows, isWide)
        expect(getByText('No accounts match')).toBeTruthy()
        expect(queryByText('Clear filters')).toBeNull()
        expect(byTestId(container, 'account-search')).not.toBeNull()
        expect(byTestId(container, rowId(isWide, 'acct_bank_0001'))).toBeNull()
        const action = byTestId(container, 'account-empty-show-inactive') as HTMLElement
        expect(action.textContent).toContain('Show inactive')
        fireEvent.click(action)
        expect(byTestId(container, rowId(isWide, 'acct_bank_0001'))).not.toBeNull()
        expect(queryByText('No accounts match')).toBeNull()
    })

    it.each([
        true,
        false,
    ])('a query with no match: Clear filters, not Show inactive, restores rows (wide=%s)', isWide => {
        const { getByText, container } = renderHarness(fixtureRows(), isWide)
        fireEvent.input(byTestId(container, 'account-search') as HTMLElement, {
            target: { value: 'zzzz-no-such-account' },
        })
        expect(getByText('No accounts match')).toBeTruthy()
        expect(byTestId(container, 'account-empty-show-inactive')).toBeNull()
        fireEvent.click(getByText('Clear filters'))
        expect(byTestId(container, rowId(isWide, 'acct_bank_0001'))).not.toBeNull()
    })

    it.each([
        true,
        false,
    ])('a group with no accounts: Clear filters restores rows (wide=%s)', isWide => {
        const assetsOnly = fixtureRows().filter(row => accountTypeDef(row.type)?.group === 'asset')
        const { getByText, container } = renderHarness(assetsOnly, isWide)
        if (!isWide) {
            fireEvent.click(byTestId(container, 'account-filter-button') as HTMLElement)
        }
        const root = isWide ? container : document.body
        fireEvent.click(byTestId(root, 'account-filter-income') as HTMLElement)
        expect(getByText('No accounts match')).toBeTruthy()
        expect(byTestId(container, 'account-empty-show-inactive')).toBeNull()
        fireEvent.click(getByText('Clear filters'))
        expect(byTestId(container, rowId(isWide, 'acct_bank_0001'))).not.toBeNull()
    })
})
