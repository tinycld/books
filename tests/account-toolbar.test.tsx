// @vitest-environment happy-dom
import { fireEvent, render, renderHook } from '@testing-library/react'
import { OverlayProvider } from '@tinycld/core/ui/overlay'
import { router } from 'expo-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountToolbar } from '../tinycld/books/components/accounts/AccountToolbar'
import { useAccountTree } from '../tinycld/books/hooks/useAccountTree'
import { byTestId, fixtureRows } from './accounts-test-rows'

type Tree = ReturnType<typeof useAccountTree>

function makeTree(overrides: Partial<Tree> = {}) {
    const real = renderHook(() => useAccountTree(fixtureRows())).result.current
    const spies = {
        setQuery: vi.fn(),
        setGroup: vi.fn(),
        setShowInactive: vi.fn(),
        toggleAllCollapsed: vi.fn(),
    }
    return { tree: { ...real, ...spies, ...overrides } as Tree, spies }
}

function renderToolbar(props: { isWide?: boolean; canWrite?: boolean; tree?: Partial<Tree> } = {}) {
    const { tree, spies } = makeTree(props.tree)
    const onNew = vi.fn()
    const view = render(
        <OverlayProvider>
            <AccountToolbar
                tree={tree}
                canWrite={props.canWrite ?? true}
                isWide={props.isWide ?? true}
                onNew={onNew}
            />
        </OverlayProvider>
    )
    return { ...view, ...spies, onNew }
}

const CHIPS = [
    ['asset', 'Assets'],
    ['liability', 'Liabilities'],
    ['equity', 'Equity'],
    ['income', 'Income'],
    ['expense', 'Expenses'],
] as const

describe('AccountToolbar search', () => {
    it.each([true, false])('typing in the search field calls setQuery (wide=%s)', isWide => {
        const { container, setQuery } = renderToolbar({ isWide })
        const input = byTestId(container, 'account-search') as HTMLElement
        fireEvent.input(input, { target: { value: 'cash' } })
        expect(setQuery).toHaveBeenCalledWith('cash')
    })
})

describe('AccountToolbar group chips (wide)', () => {
    it('shows the five chips with their labels', () => {
        const { container } = renderToolbar()
        const labels = CHIPS.map(
            ([group]) => byTestId(container, `account-filter-${group}`)?.textContent
        )
        expect(labels).toEqual(CHIPS.map(([, label]) => label))
    })

    it.each(CHIPS)('pressing the %s chip calls setGroup with that group', (group, label) => {
        const { container, getByText, setGroup } = renderToolbar()
        fireEvent.click(getByText(label))
        expect(setGroup).toHaveBeenCalledWith(group)
        expect(byTestId(container, `account-filter-${group}`)).not.toBeNull()
    })

    it('pressing the active chip calls setGroup with an empty string', () => {
        const { container, setGroup } = renderToolbar({ tree: { group: 'income' } })
        fireEvent.click(byTestId(container, 'account-filter-income') as HTMLElement)
        expect(setGroup).toHaveBeenCalledWith('')
    })

    it('pressing an inactive chip while another is active selects the pressed one', () => {
        const { container, setGroup } = renderToolbar({ tree: { group: 'income' } })
        fireEvent.click(byTestId(container, 'account-filter-asset') as HTMLElement)
        expect(setGroup).toHaveBeenCalledWith('asset')
    })

    it('renders no filter button on a wide screen', () => {
        const { container } = renderToolbar()
        expect(byTestId(container, 'account-filter-button')).toBeNull()
    })
})

describe('AccountToolbar Show inactive and expand all', () => {
    it('the Show inactive toggle calls setShowInactive with true when off', () => {
        const { container, setShowInactive, getByText } = renderToolbar()
        expect(getByText('Show inactive')).toBeTruthy()
        fireEvent.click(byTestId(container, 'account-show-inactive') as HTMLElement)
        expect(setShowInactive).toHaveBeenCalledWith(true)
    })

    it('the Show inactive toggle calls setShowInactive with false when on', () => {
        const { container, setShowInactive } = renderToolbar({ tree: { showInactive: true } })
        fireEvent.click(byTestId(container, 'account-show-inactive') as HTMLElement)
        expect(setShowInactive).toHaveBeenCalledWith(false)
    })

    it('the expand/collapse button calls toggleAllCollapsed', () => {
        const { container, toggleAllCollapsed } = renderToolbar()
        fireEvent.click(byTestId(container, 'account-toggle-all') as HTMLElement)
        expect(toggleAllCollapsed).toHaveBeenCalledTimes(1)
    })

    it('its label is Collapse all while some parent is expanded', () => {
        const { container } = renderToolbar({ tree: { areAllCollapsed: false } })
        expect(byTestId(container, 'account-toggle-all')?.textContent).toContain('Collapse all')
    })

    it('its label is Expand all once every parent is collapsed', () => {
        const { container } = renderToolbar({ tree: { areAllCollapsed: true } })
        expect(byTestId(container, 'account-toggle-all')?.textContent).toContain('Expand all')
    })
})

describe('AccountToolbar actions', () => {
    beforeEach(() => {
        vi.mocked(router.push).mockClear()
    })

    it('a writer sees New account and it calls onNew', () => {
        const { container, onNew } = renderToolbar({ canWrite: true })
        const button = byTestId(container, 'account-new-toolbar')
        expect(button?.textContent).toContain('New account')
        fireEvent.click(button as HTMLElement)
        expect(onNew).toHaveBeenCalledTimes(1)
    })

    it('a writer sees Import and it goes to books/accounts/import', () => {
        const { container } = renderToolbar({ canWrite: true })
        const link = byTestId(container, 'account-import-link')
        expect(link?.textContent).toContain('Import')
        fireEvent.click(link as HTMLElement)
        expect(router.push).toHaveBeenCalledWith('/a/books/accounts/import')
    })

    it('a read-only user sees neither New account nor Import', () => {
        const { container, queryByText } = renderToolbar({ canWrite: false })
        expect(byTestId(container, 'account-new-toolbar')).toBeNull()
        expect(byTestId(container, 'account-import-link')).toBeNull()
        expect(queryByText('New account')).toBeNull()
        expect(queryByText('Import')).toBeNull()
    })

    it('a read-only user still sees search, chips and expand all', () => {
        const { container } = renderToolbar({ canWrite: false })
        expect(byTestId(container, 'account-search')).not.toBeNull()
        expect(byTestId(container, 'account-filter-asset')).not.toBeNull()
        expect(byTestId(container, 'account-toggle-all')).not.toBeNull()
    })

    it('does not duplicate New account on phone', () => {
        const { container } = renderToolbar({ isWide: false, canWrite: true })
        expect(byTestId(container, 'account-new-toolbar')).toBeNull()
    })
})

// The toolbar has no root testID, and the overlay host renders inside the RTL
// container, so "inline" means inside the row that holds both the search field
// and the filter button.
function toolbarRow(container: HTMLElement) {
    const search = byTestId(container, 'account-search') as HTMLElement
    let node = byTestId(container, 'account-filter-button')?.parentElement ?? null
    while (node && !node.contains(search)) node = node.parentElement
    return node as HTMLElement
}

describe('AccountToolbar on phone', () => {
    it('shows the search field and a filter button instead of inline chips', () => {
        const { container } = renderToolbar({ isWide: false })
        expect(byTestId(container, 'account-search')).not.toBeNull()
        expect(byTestId(container, 'account-filter-button')).not.toBeNull()
        for (const [group] of CHIPS) {
            expect(byTestId(container, `account-filter-${group}`)).toBeNull()
        }
    })

    // Assumes the core ui/popover Popover (a sheet on the mobile breakpoint),
    // mounted through the core OverlayProvider: its content portals outside
    // the toolbar's own container.
    it('pressing the filter button reveals the five chips inside the overlay, not inline', () => {
        const { container } = renderToolbar({ isWide: false })
        const row = toolbarRow(container)
        expect(row).not.toBeNull()
        for (const [group] of CHIPS) {
            expect(byTestId(document.body, `account-filter-${group}`)).toBeNull()
        }
        fireEvent.click(byTestId(container, 'account-filter-button') as HTMLElement)
        for (const [group, label] of CHIPS) {
            const chip = byTestId(document.body, `account-filter-${group}`)
            expect(chip?.textContent).toBe(label)
            expect(row.contains(chip)).toBe(false)
        }
    })

    it('the overlay panel also holds the Show inactive control', () => {
        const { container } = renderToolbar({ isWide: false })
        const row = toolbarRow(container)
        expect(row).not.toBeNull()
        expect(byTestId(document.body, 'account-show-inactive')).toBeNull()
        fireEvent.click(byTestId(container, 'account-filter-button') as HTMLElement)
        const toggle = byTestId(document.body, 'account-show-inactive')
        expect(toggle?.textContent).toContain('Show inactive')
        expect(row.contains(toggle)).toBe(false)
    })

    it('a revealed chip calls setGroup', () => {
        const { container, setGroup } = renderToolbar({ isWide: false })
        fireEvent.click(byTestId(container, 'account-filter-button') as HTMLElement)
        fireEvent.click(byTestId(document.body, 'account-filter-equity') as HTMLElement)
        expect(setGroup).toHaveBeenCalledWith('equity')
    })

    it('keeps Expand/Collapse all on phone', () => {
        const { container } = renderToolbar({ isWide: false })
        expect(byTestId(container, 'account-toggle-all')).not.toBeNull()
    })

    it('shows Import on phone to a writer', () => {
        const { container } = renderToolbar({ isWide: false, canWrite: true })
        expect(byTestId(container, 'account-import-link')?.textContent).toContain('Import')
    })

    it('hides Import on phone from a read-only user', () => {
        const { container } = renderToolbar({ isWide: false, canWrite: false })
        expect(byTestId(container, 'account-import-link')).toBeNull()
    })
})

// The test renderer keeps accessibilityState as an object prop, which the DOM
// attribute flattens to "[object Object]", so read the React props directly.
function propsOf(el: HTMLElement | null) {
    const key = el && Object.keys(el).find(k => k.startsWith('__reactProps$'))
    return (key ? (el as unknown as Record<string, unknown>)[key] : {}) as {
        accessibilityRole?: string
        accessibilityState?: { checked?: boolean; selected?: boolean; disabled?: boolean }
        'aria-disabled'?: boolean | string
    }
}

function expectDisabled(el: HTMLElement | null) {
    expect(el).not.toBeNull()
    expect(propsOf(el).accessibilityState?.disabled).toBe(true)
    const aria = propsOf(el)['aria-disabled'] ?? el?.getAttribute('aria-disabled')
    expect(String(aria)).toBe('true')
    // The core Button renders its disabled look from isDisabled as data-disabled.
    expect(el?.getAttribute('data-disabled')).toBe('true')
}

function expectEnabled(el: HTMLElement | null) {
    expect(el).not.toBeNull()
    expect(propsOf(el).accessibilityState?.disabled).not.toBe(true)
    expect(String(propsOf(el)['aria-disabled'] ?? el?.getAttribute('aria-disabled'))).not.toBe(
        'true'
    )
    expect(el?.getAttribute('data-disabled')).not.toBe('true')
}

describe('AccountToolbar toggle-all stays mounted and is disabled when it cannot act', () => {
    it.each([true, false])('is mounted and disabled when canToggle is false (wide=%s)', isWide => {
        const { container } = renderToolbar({ isWide, tree: { canToggle: false } })
        expectDisabled(byTestId(container, 'account-toggle-all'))
    })

    it.each([
        true,
        false,
    ])('is mounted and disabled when the chart has no parents (wide=%s)', isWide => {
        const { container } = renderToolbar({ isWide, tree: { hasParents: false } })
        expectDisabled(byTestId(container, 'account-toggle-all'))
    })

    it('is enabled when canToggle is true and the chart has parents', () => {
        const { container } = renderToolbar({ tree: { canToggle: true, hasParents: true } })
        expectEnabled(byTestId(container, 'account-toggle-all'))
    })

    it.each([
        { canToggle: false, hasParents: true },
        { canToggle: true, hasParents: false },
    ])('pressing the disabled control does not call toggleAllCollapsed (%o)', tree => {
        const { container, toggleAllCollapsed } = renderToolbar({ tree })
        fireEvent.click(byTestId(container, 'account-toggle-all') as HTMLElement)
        expect(toggleAllCollapsed).not.toHaveBeenCalled()
    })
})

describe('AccountToolbar phone Filters label', () => {
    const label = (tree: Partial<Tree>) => {
        const { container } = renderToolbar({ isWide: false, tree })
        return byTestId(container, 'account-filter-button')?.textContent
    }

    it('says Filters with nothing active', () => {
        expect(label({ group: '', showInactive: false })).toBe('Filters')
    })

    it('says Filters (1) for an active group only', () => {
        expect(label({ group: 'income', showInactive: false })).toBe('Filters (1)')
    })

    it('says Filters (1) for Show inactive only', () => {
        expect(label({ group: '', showInactive: true })).toBe('Filters (1)')
    })

    it('says Filters (2) for both', () => {
        expect(label({ group: 'income', showInactive: true })).toBe('Filters (2)')
    })
})

describe('AccountToolbar phone read-only layout', () => {
    it('renders no empty row when the user is read-only and canToggle is false', () => {
        const { container } = renderToolbar({
            isWide: false,
            canWrite: false,
            tree: { canToggle: false },
        })
        const root = toolbarRow(container).parentElement as HTMLElement
        const rows = Array.from(root.children)
        expect(rows.length).toBeGreaterThan(0)
        for (const row of rows) {
            expect(row.children.length).toBeGreaterThan(0)
        }
    })
})

describe('AccountToolbar accessibility state', () => {
    it.each([
        false,
        true,
    ])('Show inactive is a switch whose checked state is showInactive=%s', on => {
        const { container } = renderToolbar({ tree: { showInactive: on } })
        const props = propsOf(byTestId(container, 'account-show-inactive'))
        expect(props.accessibilityRole).toBe('switch')
        expect(props.accessibilityState?.checked).toBe(on)
    })

    it('the active group chip is selected and the others are not', () => {
        const { container } = renderToolbar({ tree: { group: 'income' } })
        for (const [group] of CHIPS) {
            const props = propsOf(byTestId(container, `account-filter-${group}`))
            expect(props.accessibilityState?.selected).toBe(group === 'income')
        }
    })

    it('no chip is selected when no group is active', () => {
        const { container } = renderToolbar({ tree: { group: '' } })
        for (const [group] of CHIPS) {
            const props = propsOf(byTestId(container, `account-filter-${group}`))
            expect(props.accessibilityState?.selected).toBe(false)
        }
    })
})
