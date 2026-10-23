// @vitest-environment happy-dom
import { act, fireEvent, render, renderHook } from '@testing-library/react'
import { router } from 'expo-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountsScreenView } from '../tinycld/books/components/accounts/AccountsScreenView'
import { useAccountTree } from '../tinycld/books/hooks/useAccountTree'
import { byTestId, fixtureRows } from './accounts-test-rows'

function renderView(
    props: {
        isReady?: boolean
        isWide?: boolean
        canWrite?: boolean
        isError?: boolean
        tree?: ReturnType<typeof useAccountTree>
    } = {}
) {
    const tree = props.tree ?? renderHook(() => useAccountTree(fixtureRows())).result.current
    const handlers = { onOpen: vi.fn(), onNew: vi.fn(), onRetry: vi.fn() }
    const view = render(
        <AccountsScreenView
            isReady={props.isReady ?? true}
            isWide={props.isWide ?? true}
            canWrite={props.canWrite ?? true}
            isError={props.isError ?? false}
            tree={tree}
            {...handlers}
        />
    )
    return { ...view, ...handlers }
}

describe('AccountsScreenView', () => {
    beforeEach(() => {
        vi.mocked(router.push).mockClear()
    })

    it('renders LoadingState and no table while the query is not ready', () => {
        const { container } = renderView({ isReady: false })
        expect(container.querySelector('rn-activityindicator')).not.toBeNull()
        expect(byTestId(container, 'account-row-acct_bank_0001')).toBeNull()
        expect(byTestId(container, 'account-card-acct_bank_0001')).toBeNull()
    })

    it('renders the table and not cards when ready and wide', () => {
        const { container } = renderView({ isWide: true })
        expect(container.querySelector('rn-activityindicator')).toBeNull()
        expect(byTestId(container, 'account-row-acct_bank_0001')).not.toBeNull()
        expect(byTestId(container, 'account-card-acct_bank_0001')).toBeNull()
    })

    it('renders cards and not the table when ready and not wide', () => {
        const { container } = renderView({ isWide: false })
        expect(byTestId(container, 'account-card-acct_bank_0001')).not.toBeNull()
        expect(byTestId(container, 'account-row-acct_bank_0001')).toBeNull()
    })

    it('shows the back link All lists that goes to books/lists', () => {
        const { getByText } = renderView()
        fireEvent.click(getByText('All lists'))
        expect(router.push).toHaveBeenCalledWith('/a/books/lists')
    })

    it('shows the title Chart of Accounts', () => {
        const { getByText } = renderView()
        expect(getByText('Chart of Accounts')).toBeTruthy()
    })

    it('gives a phone writer a New account header button and renders no FAB', () => {
        const { container, onNew } = renderView({ isWide: false, canWrite: true })
        const button = byTestId(container, 'account-new-header')
        expect(button).not.toBeNull()
        expect(button?.textContent).toContain('New account')
        fireEvent.click(button as HTMLElement)
        expect(onNew).toHaveBeenCalledTimes(1)
        expect(container.querySelector('[accessibilitylabel="New"]')).toBeNull()
    })

    it('gives a read-only user no New account button', () => {
        const { container, queryByText } = renderView({ isWide: false, canWrite: false })
        expect(byTestId(container, 'account-new-header')).toBeNull()
        expect(queryByText('New account')).toBeNull()
    })
})

describe('AccountsScreenView error state', () => {
    it('shows an alert message and no spinner when the query failed', () => {
        const { container, getByText } = renderView({ isReady: false, isError: true })
        expect(byTestId(container, 'accounts-error')).not.toBeNull()
        expect(getByText(/Could not load accounts/)).toBeTruthy()
        expect(container.querySelector('rn-activityindicator')).toBeNull()
    })

    it('shows only the error when the query is ready and failed', () => {
        const { container } = renderView({ isReady: true, isError: true })
        expect(byTestId(container, 'accounts-error')).not.toBeNull()
        expect(byTestId(container, 'account-row-acct_bank_0001')).toBeNull()
        expect(byTestId(container, 'account-card-acct_bank_0001')).toBeNull()
        expect(container.querySelector('rn-activityindicator')).toBeNull()
    })

    it('calls onRetry when Retry is pressed', () => {
        const { getByText, onRetry } = renderView({ isReady: false, isError: true })
        fireEvent.click(getByText('Retry'))
        expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('shows no error element when the query is healthy', () => {
        const { container, queryByText } = renderView()
        expect(byTestId(container, 'accounts-error')).toBeNull()
        expect(queryByText('Retry')).toBeNull()
    })
})

describe('AccountsScreenView loading keeps the header', () => {
    it.each([true, false])('keeps back link and title while loading (wide=%s)', isWide => {
        const { container, getByText } = renderView({ isReady: false, isWide })
        expect(getByText('All lists')).toBeTruthy()
        expect(getByText('Chart of Accounts')).toBeTruthy()
        expect(container.querySelector('rn-activityindicator')).not.toBeNull()
        expect(byTestId(container, 'account-row-acct_bank_0001')).toBeNull()
        expect(byTestId(container, 'account-card-acct_bank_0001')).toBeNull()
    })
})

describe('AccountsScreenView with a search query', () => {
    function searchTree() {
        const hook = renderHook(() => useAccountTree(fixtureRows()))
        act(() => hook.result.current.setQuery('rent'))
        return hook.result.current
    }

    it.each([true, false])('renders no caret while searching (wide=%s)', isWide => {
        const { container } = renderView({ isWide, tree: searchTree() })
        expect(
            container.querySelectorAll('[testID^="account-caret-"], [testid^="account-caret-"]')
        ).toHaveLength(0)
    })

    it('renders carets with no query', () => {
        const { container } = renderView({ isWide: true })
        expect(byTestId(container, 'account-caret-acct_exp_0001')).not.toBeNull()
    })
})
