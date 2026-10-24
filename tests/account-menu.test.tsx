// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, renderHook, screen } from '@testing-library/react'
import { OverlayProvider } from '@tinycld/core/ui/overlay'
import { describe, expect, it, vi } from 'vitest'
import { AccountCard } from '../tinycld/books/components/accounts/AccountCard'
import { LEADING_CELL_WIDTH } from '../tinycld/books/components/accounts/AccountRow'
import { AccountRowMenu } from '../tinycld/books/components/accounts/AccountRowMenu'
import { AccountSelectBox } from '../tinycld/books/components/accounts/AccountSelectBox'
import { AccountsErrorBanner } from '../tinycld/books/components/accounts/AccountsErrorBanner'
import { AccountToolbar } from '../tinycld/books/components/accounts/AccountToolbar'
import { AccountTree } from '../tinycld/books/components/accounts/AccountTree'
import { BatchActions } from '../tinycld/books/components/accounts/BatchActions'
import { useAccountTree } from '../tinycld/books/hooks/useAccountTree'
import {
    buildAccountTree,
    defaultSort,
    flattenAccountTree,
    type TreeFilters,
} from '../tinycld/books/lib/account-tree'
import { byTestId, fixtureRows } from './accounts-test-rows'
import { menuHandlers } from './accounts-view-props'

// Assumed test ids: `account-menu-<id>` (row menu trigger), `account-select-<id>`
// (row checkbox) and `account-batch-actions` (Batch actions trigger).
const open: TreeFilters = { collapsed: new Set(), query: '', group: '', showInactive: true }
const ROW_ID = 'acct_bank_0001'

function visibleRows() {
    return flattenAccountTree(buildAccountTree(fixtureRows(), defaultSort), open)
}

function rowFor(id: string) {
    const row = fixtureRows().find(r => r.id === id)
    if (!row) throw new Error(`no fixture row ${id}`)
    return row
}

function renderMenu(id = ROW_ID) {
    const menu = menuHandlers()
    const view = render(
        <OverlayProvider>
            <AccountRowMenu row={rowFor(id)} menu={menu} isDisabled={false} />
        </OverlayProvider>
    )
    fireEvent.click(byTestId(view.container, `account-menu-${id}`) as HTMLElement)
    return { ...view, menu }
}

describe('AccountRowMenu', () => {
    it('lists Edit, Add sub-account, Make inactive and Delete for an active row', () => {
        renderMenu()
        for (const label of ['Edit', 'Add sub-account', 'Make inactive', 'Delete']) {
            expect(screen.getByText(label)).toBeTruthy()
        }
        expect(screen.queryByText('Make active')).toBeNull()
    })

    it('pressing Edit calls menu.onEdit with the id', () => {
        const { menu } = renderMenu()
        fireEvent.click(screen.getByText('Edit'))
        expect(menu.onEdit).toHaveBeenCalledWith(ROW_ID)
    })

    it('pressing Add sub-account calls menu.onAddSub with the id', () => {
        const { menu } = renderMenu()
        fireEvent.click(screen.getByText('Add sub-account'))
        expect(menu.onAddSub).toHaveBeenCalledWith(ROW_ID)
    })

    it('pressing Make inactive calls menu.onToggleInactive with the row', () => {
        const { menu } = renderMenu()
        fireEvent.click(screen.getByText('Make inactive'))
        expect(menu.onToggleInactive).toHaveBeenCalledWith(rowFor(ROW_ID))
    })

    it('pressing Delete calls menu.onDelete with the id', () => {
        const { menu } = renderMenu()
        fireEvent.click(screen.getByText('Delete'))
        expect(menu.onDelete).toHaveBeenCalledWith(ROW_ID)
    })

    it('shows Make active instead of Make inactive for an inactive row', () => {
        const { menu } = renderMenu('acct_fa_00007')
        expect(screen.queryByText('Make inactive')).toBeNull()
        fireEvent.click(screen.getByText('Make active'))
        expect(menu.onToggleInactive).toHaveBeenCalledWith(rowFor('acct_fa_00007'))
    })
})

function renderTree(canWrite: boolean, isWorking = false) {
    const menu = menuHandlers()
    const onSelect = vi.fn()
    const onOpen = vi.fn()
    const view = render(
        <OverlayProvider>
            <AccountTree
                rows={visibleRows()}
                sort={{ key: null, direction: 'asc' }}
                canToggle={true}
                selectedId=""
                onSort={vi.fn()}
                onToggle={vi.fn()}
                onOpen={onOpen}
                canWrite={canWrite}
                isWorking={isWorking}
                isSelected={(id: string) => id === ROW_ID}
                onSelect={onSelect}
                menu={menu}
            />
        </OverlayProvider>
    )
    return { ...view, onSelect, onOpen, menu }
}

function renderCard(canWrite: boolean, isWorking = false) {
    const menu = menuHandlers()
    const onSelect = vi.fn()
    const onOpen = vi.fn()
    const row = visibleRows().find(r => r.node.account.id === ROW_ID)
    if (!row) throw new Error('no row')
    const view = render(
        <OverlayProvider>
            <AccountCard
                row={row}
                canToggle={true}
                selectedId=""
                onToggle={vi.fn()}
                onOpen={onOpen}
                canWrite={canWrite}
                isWorking={isWorking}
                isSelected={(id: string) => id === ROW_ID}
                onSelect={onSelect}
                menu={menu}
            />
        </OverlayProvider>
    )
    return { ...view, onSelect, onOpen, menu }
}

describe('AccountTree row menu and checkbox', () => {
    it('gives a writer a checkbox and a menu on every row', () => {
        const { container } = renderTree(true)
        for (const { node } of visibleRows()) {
            expect(byTestId(container, `account-select-${node.account.id}`)).not.toBeNull()
            expect(byTestId(container, `account-menu-${node.account.id}`)).not.toBeNull()
        }
    })

    it('renders no menu and no checkbox for a read-only user', () => {
        const writer = renderTree(true)
        expect(byTestId(writer.container, `account-menu-${ROW_ID}`)).not.toBeNull()
        writer.unmount()
        const { container } = renderTree(false)
        expect(byTestId(container, `account-row-${ROW_ID}`)).not.toBeNull()
        for (const { node } of visibleRows()) {
            expect(byTestId(container, `account-select-${node.account.id}`)).toBeNull()
            expect(byTestId(container, `account-menu-${node.account.id}`)).toBeNull()
        }
    })

    it('pressing a row checkbox calls onSelect with that id', () => {
        const { container, onSelect } = renderTree(true)
        fireEvent.click(byTestId(container, 'account-select-acct_bank_0002') as HTMLElement)
        expect(onSelect).toHaveBeenCalledWith('acct_bank_0002')
    })
})

describe('AccountCard row menu and checkbox', () => {
    it('gives a writer the same checkbox and menu as the table row', () => {
        const { container, menu } = renderCard(true)
        expect(byTestId(container, `account-select-${ROW_ID}`)).not.toBeNull()
        fireEvent.click(byTestId(container, `account-menu-${ROW_ID}`) as HTMLElement)
        for (const label of ['Edit', 'Add sub-account', 'Make inactive', 'Delete']) {
            expect(screen.getByText(label)).toBeTruthy()
        }
        fireEvent.click(screen.getByText('Edit'))
        expect(menu.onEdit).toHaveBeenCalledWith(ROW_ID)
    })

    it('pressing the checkbox calls onSelect', () => {
        const { container, onSelect } = renderCard(true)
        fireEvent.click(byTestId(container, `account-select-${ROW_ID}`) as HTMLElement)
        expect(onSelect).toHaveBeenCalledWith(ROW_ID)
    })

    it('renders no menu and no checkbox for a read-only user', () => {
        const writer = renderCard(true)
        expect(byTestId(writer.container, `account-menu-${ROW_ID}`)).not.toBeNull()
        writer.unmount()
        const { container } = renderCard(false)
        expect(byTestId(container, `account-card-${ROW_ID}`)).not.toBeNull()
        expect(byTestId(container, `account-select-${ROW_ID}`)).toBeNull()
        expect(byTestId(container, `account-menu-${ROW_ID}`)).toBeNull()
    })
})

const GLOBAL_CSS = readFileSync(resolve(__dirname, '../../tinycld/global.css'), 'utf8')

function definedColorTokens() {
    const names = new Set<string>()
    for (const m of GLOBAL_CSS.matchAll(/--color-([a-z0-9-]+)\s*:/g)) names.add(m[1])
    return names
}

function semanticColorTokens(classes: string[]) {
    const found: { cls: string; token: string }[] = []
    for (const cls of classes) {
        const m = /^(?:bg|border|text)-([a-z][a-z0-9-]*?)(?:\/\d+)?$/.exec(cls)
        if (!m) continue
        // Size and style utilities share the text-/border- prefixes.
        if (
            /^(xs|sm|base|lg|xl|\dxl|left|right|center|justify|wrap|nowrap|ellipsis|clip|solid|dashed|dotted|none|transparent|current|b|t|l|r|x|y)$/.test(
                m[1]
            )
        )
            continue
        found.push({ cls, token: m[1] })
    }
    return found
}

describe('AccountsErrorBanner', () => {
    it('uses only color utilities that resolve to a token defined in global.css', () => {
        const { container } = render(<AccountsErrorBanner message="Refused." onDismiss={vi.fn()} />)
        const classes = new Set<string>()
        for (const el of Array.from(container.querySelectorAll('*'))) {
            for (const cls of (el.getAttribute('class') ?? '').split(/\s+/)) {
                if (cls) classes.add(cls)
            }
        }
        const defined = definedColorTokens()
        const used = semanticColorTokens([...classes])
        expect(used.length).toBeGreaterThan(0)
        const unresolved = used.filter(u => !defined.has(u.token)).map(u => u.cls)
        expect(unresolved).toEqual([])
    })

    it('renders the message and dismisses', () => {
        const onDismiss = vi.fn()
        render(
            <AccountsErrorBanner
                message="Make the 2 active sub-accounts inactive first."
                onDismiss={onDismiss}
            />
        )
        expect(screen.getByText('Make the 2 active sub-accounts inactive first.')).toBeTruthy()
        const control =
            document.querySelector('[accessibilitylabel="Dismiss"]') ?? screen.getByText('Dismiss')
        fireEvent.click(control)
        expect(onDismiss).toHaveBeenCalledTimes(1)
    })

    it('renders nothing when there is no message', () => {
        const { container } = render(<AccountsErrorBanner message={null} onDismiss={vi.fn()} />)
        expect(container.textContent).toBe('')
    })
})

function menuItem(label: string) {
    return screen.getByText(label).closest('[role="menuitem"]') as HTMLElement
}

function isDisabled(el: HTMLElement) {
    return (
        el.getAttribute('aria-disabled') === 'true' || el.getAttribute('data-disabled') === 'true'
    )
}

describe('BatchActions', () => {
    function renderBatch(
        selectedCount: number,
        opts: { isWorking?: boolean; isIcon?: boolean } = {}
    ) {
        const onMakeInactive = vi.fn()
        const view = render(
            <OverlayProvider>
                <BatchActions
                    selectedCount={selectedCount}
                    onMakeInactive={onMakeInactive}
                    isWorking={opts.isWorking ?? false}
                    isIcon={opts.isIcon ?? false}
                />
            </OverlayProvider>
        )
        const trigger = byTestId(view.container, 'account-batch-actions') as HTMLElement
        return { trigger, onMakeInactive }
    }

    it.each([
        false,
        true,
    ])('disables the trigger and does not open the menu when no row is selected (icon=%s)', isIcon => {
        const { trigger, onMakeInactive } = renderBatch(0, { isIcon })
        expect(isDisabled(trigger)).toBe(true)
        fireEvent.click(trigger)
        expect(screen.queryByText('Make inactive')).toBeNull()
        expect(onMakeInactive).not.toHaveBeenCalled()
    })

    it.each([false, true])('disables the trigger while working (icon=%s)', isIcon => {
        const { trigger } = renderBatch(2, { isWorking: true, isIcon })
        expect(isDisabled(trigger)).toBe(true)
        fireEvent.click(trigger)
        expect(screen.queryByText('Make inactive')).toBeNull()
    })

    it.each([
        false,
        true,
    ])('enables the trigger with one row selected and calls onMakeInactive (icon=%s)', isIcon => {
        const { trigger, onMakeInactive } = renderBatch(1, { isIcon })
        expect(isDisabled(trigger)).toBe(false)
        fireEvent.click(trigger)
        expect(isDisabled(menuItem('Make inactive'))).toBe(false)
        fireEvent.click(screen.getByText('Make inactive'))
        expect(onMakeInactive).toHaveBeenCalledTimes(1)
    })
})

describe('AccountToolbar Batch actions', () => {
    function renderToolbar(canWrite: boolean) {
        const tree = renderHook(() => useAccountTree(fixtureRows())).result.current
        return render(
            <OverlayProvider>
                <AccountToolbar
                    tree={tree}
                    canWrite={canWrite}
                    isWide={true}
                    onNew={vi.fn()}
                    selectedCount={1}
                    onMakeInactive={vi.fn()}
                    isWorking={false}
                />
            </OverlayProvider>
        )
    }

    it('shows Batch actions to a writer only', () => {
        const writer = renderToolbar(true)
        expect(writer.queryByText('Batch actions')).not.toBeNull()
        writer.unmount()
        const reader = renderToolbar(false)
        expect(reader.queryByText('New account')).toBeNull()
        expect(reader.queryByText('Batch actions')).toBeNull()
    })
})

function pxOf(value: string) {
    return Number.parseFloat(value)
}

describe('touch targets', () => {
    it('LEADING_CELL_WIDTH is 44', () => {
        expect(LEADING_CELL_WIDTH).toBe(44)
    })

    it('the select box is at least 44 wide and 44 tall', () => {
        const { container } = render(
            <AccountSelectBox id={ROW_ID} name="Cash" isSelected={() => false} onSelect={vi.fn()} />
        )
        const box = byTestId(container, `account-select-${ROW_ID}`) as HTMLElement
        expect(pxOf(box.style.width)).toBeGreaterThanOrEqual(44)
        expect(pxOf(box.style.minHeight)).toBeGreaterThanOrEqual(44)
    })

    it('the banner Dismiss control is at least 44 by 44', () => {
        render(<AccountsErrorBanner message="Refused." onDismiss={vi.fn()} />)
        const dismiss = document.querySelector('[accessibilitylabel="Dismiss"]') as HTMLElement
        expect(pxOf(dismiss.style.width)).toBeGreaterThanOrEqual(44)
        expect(pxOf(dismiss.style.height)).toBeGreaterThanOrEqual(44)
    })
})

describe('press isolation', () => {
    it('pressing a table row menu trigger does not open the account', () => {
        const { container, onOpen } = renderTree(true)
        fireEvent.click(byTestId(container, `account-menu-${ROW_ID}`) as HTMLElement)
        expect(onOpen).not.toHaveBeenCalled()
    })

    it('pressing a table row checkbox does not open the account', () => {
        const { container, onOpen } = renderTree(true)
        fireEvent.click(byTestId(container, `account-select-${ROW_ID}`) as HTMLElement)
        expect(onOpen).not.toHaveBeenCalled()
    })

    it('pressing a card menu trigger does not open the account', () => {
        const { container, onOpen } = renderCard(true)
        fireEvent.click(byTestId(container, `account-menu-${ROW_ID}`) as HTMLElement)
        expect(onOpen).not.toHaveBeenCalled()
    })

    it('pressing a card checkbox does not open the account', () => {
        const { container, onOpen } = renderCard(true)
        fireEvent.click(byTestId(container, `account-select-${ROW_ID}`) as HTMLElement)
        expect(onOpen).not.toHaveBeenCalled()
    })
})

function opensMenu(container: HTMLElement) {
    fireEvent.click(byTestId(container, `account-menu-${ROW_ID}`) as HTMLElement)
    return screen.queryByText('Edit') !== null
}

describe('row menus while an action is working', () => {
    it('does not open the table row menu', () => {
        const { container } = renderTree(true, true)
        expect(opensMenu(container)).toBe(false)
    })

    it('does not open the card menu', () => {
        const { container } = renderCard(true, true)
        expect(opensMenu(container)).toBe(false)
    })
})

describe('row menu items while an action is working', () => {
    it.each([
        ['acct_bank_0001', 'Make inactive'],
        ['acct_fa_00007', 'Make active'],
    ])('renders %s menu item %s disabled once isWorking turns true', (id, label) => {
        const menu = menuHandlers()
        const tree = (isDisabled: boolean) => (
            <OverlayProvider>
                <AccountRowMenu row={rowFor(id)} menu={menu} isDisabled={isDisabled} />
            </OverlayProvider>
        )
        const view = render(tree(false))
        fireEvent.click(byTestId(view.container, `account-menu-${id}`) as HTMLElement)
        view.rerender(tree(true))
        const item = screen.getByText(label).closest('[role="menuitem"]') as HTMLElement
        const disabled =
            item.getAttribute('aria-disabled') === 'true' ||
            item.getAttribute('data-disabled') === 'true'
        expect(disabled).toBe(true)
        fireEvent.click(screen.getByText(label))
        expect(menu.onToggleInactive).not.toHaveBeenCalled()
    })
})

describe('AccountToolbar Batch actions while working and on phone', () => {
    function renderToolbar(opts: {
        canWrite: boolean
        isWide: boolean
        selectedCount?: number
        isWorking?: boolean
    }) {
        const tree = renderHook(() => useAccountTree(fixtureRows())).result.current
        const onMakeInactive = vi.fn()
        const view = render(
            <OverlayProvider>
                <AccountToolbar
                    tree={tree}
                    canWrite={opts.canWrite}
                    isWide={opts.isWide}
                    onNew={vi.fn()}
                    selectedCount={opts.selectedCount ?? 1}
                    onMakeInactive={onMakeInactive}
                    isWorking={opts.isWorking ?? false}
                />
            </OverlayProvider>
        )
        return { ...view, onMakeInactive }
    }

    function makeInactiveEnabled() {
        const item = screen.queryByText('Make inactive')?.closest('[role="menuitem"]')
        if (!item) return false
        return (
            item.getAttribute('aria-disabled') !== 'true' &&
            item.getAttribute('data-disabled') !== 'true'
        )
    }

    it('shows the icon Batch trigger on phone to a writer, disabled at 0 selected', () => {
        const { container, onMakeInactive } = renderToolbar({
            canWrite: true,
            isWide: false,
            selectedCount: 0,
        })
        const trigger = byTestId(container, 'account-batch-actions') as HTMLElement
        expect(trigger).not.toBeNull()
        expect(screen.queryByText('Batch actions')).toBeNull()
        expect(isDisabled(trigger)).toBe(true)
        fireEvent.click(trigger)
        expect(screen.queryByText('Make inactive')).toBeNull()
        expect(onMakeInactive).not.toHaveBeenCalled()
    })

    it('disables the wide Batch trigger at 0 selected', () => {
        const { container } = renderToolbar({ canWrite: true, isWide: true, selectedCount: 0 })
        const trigger = byTestId(container, 'account-batch-actions') as HTMLElement
        expect(isDisabled(trigger)).toBe(true)
        fireEvent.click(trigger)
        expect(screen.queryByText('Make inactive')).toBeNull()
    })

    it('enables Make inactive on phone with a selection', () => {
        const { container, onMakeInactive } = renderToolbar({ canWrite: true, isWide: false })
        fireEvent.click(byTestId(container, 'account-batch-actions') as HTMLElement)
        expect(makeInactiveEnabled()).toBe(true)
        fireEvent.click(screen.getByText('Make inactive'))
        expect(onMakeInactive).toHaveBeenCalledTimes(1)
    })

    it('renders no Batch trigger on phone for a read-only user', () => {
        const { container } = renderToolbar({ canWrite: false, isWide: false })
        expect(byTestId(container, 'account-batch-actions')).toBeNull()
    })

    it.each([
        true,
        false,
    ])('does not offer an enabled Make inactive while working (wide=%s)', isWide => {
        const { container, onMakeInactive } = renderToolbar({
            canWrite: true,
            isWide,
            isWorking: true,
        })
        const trigger = byTestId(container, 'account-batch-actions') as HTMLElement
        expect(isDisabled(trigger)).toBe(true)
        fireEvent.click(trigger)
        expect(makeInactiveEnabled()).toBe(false)
        const item = screen.queryByText('Make inactive')
        if (item) fireEvent.click(item)
        expect(onMakeInactive).not.toHaveBeenCalled()
    })
})

// The menu content is portaled, but React still bubbles its events through the
// component tree to the row's Pressable. Only AccountRowMenu's PressBoundary
// stops them. Without that wrapper the click on a menu item reaches the row's
// onPress and calls onOpen, and an Enter keydown on the focused item reaches the
// row's key handling, so every case below fails if the wrapper is removed.
type Item = { label: string; handler: 'onEdit' | 'onAddSub' | 'onToggleInactive' | 'onDelete' }

const ITEMS: Item[] = [
    { label: 'Edit', handler: 'onEdit' },
    { label: 'Add sub-account', handler: 'onAddSub' },
    { label: 'Make inactive', handler: 'onToggleInactive' },
    { label: 'Delete', handler: 'onDelete' },
]

describe.each([
    ['table row', renderTree],
    ['card', renderCard],
])('PressBoundary inside a writer %s', (_name, renderRow) => {
    it.each(ITEMS)('pressing $label calls its menu handler and never onOpen', ({
        label,
        handler,
    }) => {
        const { container, menu, onOpen } = renderRow(true)
        fireEvent.click(byTestId(container, `account-menu-${ROW_ID}`) as HTMLElement)
        fireEvent.click(screen.getByText(label))
        expect(menu[handler]).toHaveBeenCalledTimes(1)
        expect(onOpen).not.toHaveBeenCalled()
    })

    it.each(ITEMS)('pressing Enter on the focused $label item never calls onOpen', ({ label }) => {
        const { container, onOpen } = renderRow(true)
        fireEvent.click(byTestId(container, `account-menu-${ROW_ID}`) as HTMLElement)
        const item = menuItem(label)
        item.focus()
        fireEvent.keyDown(item, { key: 'Enter' })
        fireEvent.keyUp(item, { key: 'Enter' })
        expect(onOpen).not.toHaveBeenCalled()
    })
})
