// @vitest-environment happy-dom
import { fireEvent, render, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AccountCard } from '../tinycld/books/components/accounts/AccountCard'
import { DETAIL_CELL_STYLE, NAME_CELL_STYLE } from '../tinycld/books/components/accounts/AccountRow'
import { AccountTree } from '../tinycld/books/components/accounts/AccountTree'
import { GroupChip } from '../tinycld/books/components/accounts/GroupChip'
import {
    buildAccountTree,
    defaultSort,
    flattenAccountTree,
    type SortState,
    type TreeFilters,
} from '../tinycld/books/lib/account-tree'
import { formatMoney } from '../tinycld/books/lib/money'
import { byTestId, classOf, fixtureRows } from './accounts-test-rows'

const open: TreeFilters = { collapsed: new Set(), query: '', group: '', showInactive: true }

function visibleRows(filters: Partial<TreeFilters> = {}) {
    return flattenAccountTree(buildAccountTree(fixtureRows(), defaultSort), { ...open, ...filters })
}

function renderTree(filters: Partial<TreeFilters> = {}) {
    const handlers = { onSort: vi.fn(), onToggle: vi.fn(), onOpen: vi.fn() }
    const rows = visibleRows(filters)
    const view = render(
        <AccountTree
            rows={rows}
            sort={{ key: null, direction: 'asc' }}
            canToggle={true}
            {...handlers}
        />
    )
    return { ...view, rows, ...handlers }
}

// Sum of the leading padding or margin steps between the row and its name text.
function indentOf(row: HTMLElement, name: string): number {
    let total = 0
    let el: HTMLElement | null = within(row).getByText(name)
    while (el && el !== row) {
        total += Number.parseFloat(el.style.paddingLeft || '0') || 0
        total += Number.parseFloat(el.style.marginLeft || '0') || 0
        const match = /(?:^|\s)(?:pl|ml)-(\d+)(?:\s|$)/.exec(classOf(el))
        if (match) total += Number(match[1]) * 4
        el = el.parentElement
    }
    return total
}

describe('AccountTree', () => {
    it('shows the Name, Type, Detail type and Balance headers', () => {
        const { getByText } = renderTree()
        for (const header of ['Name', 'Type', 'Detail type', 'Balance']) {
            expect(getByText(header)).toBeTruthy()
        }
    })

    it('keeps the Type column and shows a group chip on every row of a group filter', () => {
        const { container, getByText, getAllByText, rows } = renderTree({ group: 'liability' })
        expect(rows.length).toBeGreaterThan(0)
        expect(getByText('Type')).toBeTruthy()
        // This row's name, Type cell and Detail type cell all read "Accounts payable".
        const payable = byTestId(container, 'account-row-acct_ap_00001') as HTMLElement
        expect(within(payable).getAllByText('Accounts payable')).toHaveLength(3)
        expect(getAllByText('Liability')).toHaveLength(rows.length)
    })

    it('shows incl. sub-accounts with the roll-up on a collapsed parent only', () => {
        const { container, rows } = renderTree({ collapsed: new Set(['acct_fa_00001']) })
        const collapsed = rows.find(r => r.node.account.id === 'acct_fa_00001')
        expect(collapsed?.balance).not.toBe(collapsed?.node.ownBalance)
        const row = byTestId(container, 'account-row-acct_fa_00001') as HTMLElement
        expect(within(row).getByText('incl. sub-accounts')).toBeTruthy()
        expect(within(row).getByText(formatMoney(collapsed?.balance ?? 0, 'USD'))).toBeTruthy()
        const expanded = byTestId(container, 'account-row-acct_exp_0001') as HTMLElement
        expect(within(expanded).queryByText('incl. sub-accounts')).toBeNull()
    })

    it('marks an inactive row with the text Inactive and a dimmed class', () => {
        const { container } = renderTree()
        const inactive = byTestId(container, 'account-row-acct_fa_00007') as HTMLElement
        const active = byTestId(container, 'account-row-acct_fa_00006') as HTMLElement
        expect(within(inactive).getByText('Inactive')).toBeTruthy()
        expect(within(active).queryByText('Inactive')).toBeNull()
        const dimmed = (el: HTMLElement) =>
            [el, ...Array.from(el.querySelectorAll('*'))].some(n => /opacity-\d+/.test(classOf(n)))
        expect(dimmed(inactive)).toBe(true)
        expect(dimmed(active)).toBe(false)
    })

    it('shows a negative balance with a minus sign', () => {
        const { container } = renderTree()
        const row = byTestId(container, 'account-row-acct_exp_0011') as HTMLElement
        const text = formatMoney(4_500 - 12_500, 'USD')
        expect(text.startsWith('-')).toBe(true)
        expect(within(row).getByText(text)).toBeTruthy()
    })

    it('right aligns the balance cell', () => {
        const { container } = renderTree()
        const row = byTestId(container, 'account-row-acct_exp_0011') as HTMLElement
        const cell = within(row).getByText(formatMoney(-8_000, 'USD'))
        let el: HTMLElement | null = cell
        let aligned = false
        while (el && el !== row) {
            if (/(?:^|\s)text-right(?:\s|$)|(?:^|\s)items-end(?:\s|$)/.test(classOf(el)))
                aligned = true
            el = el.parentElement
        }
        expect(aligned).toBe(true)
    })

    it('indents a depth-3 row two steps more than a depth-1 row', () => {
        const { container } = renderTree()
        const d1 = indentOf(
            byTestId(container, 'account-row-acct_fa_00001') as HTMLElement,
            'Fixed assets'
        )
        const d2 = indentOf(
            byTestId(container, 'account-row-acct_fa_00002') as HTMLElement,
            'Equipment'
        )
        const d3 = indentOf(
            byTestId(container, 'account-row-acct_fa_00003') as HTMLElement,
            'Computers'
        )
        expect(d2).toBeGreaterThan(d1)
        expect(d3 - d1).toBe(2 * (d2 - d1))
    })

    it('calls onSort with name, type and balance from the pressable headers', () => {
        const { getByText, onSort } = renderTree()
        fireEvent.click(getByText('Name'))
        expect(onSort).toHaveBeenLastCalledWith('name')
        fireEvent.click(getByText('Type'))
        expect(onSort).toHaveBeenLastCalledWith('type')
        fireEvent.click(getByText('Balance'))
        expect(onSort).toHaveBeenLastCalledWith('balance')
    })

    it('renders Name, Type and Balance headers as buttons and Detail type as plain text', () => {
        const { getByText, container } = renderTree()
        const buttonOf = (label: string) => getByText(label).closest('[accessibilityrole="button"]')
        for (const label of ['Name', 'Type', 'Balance']) {
            expect(buttonOf(label)).not.toBeNull()
            expect(
                container.querySelector(`[accessibilitylabel="Sort by ${label}"]`)
            ).not.toBeNull()
        }
        expect(buttonOf('Detail type')).toBeNull()
        expect(container.querySelector('[accessibilitylabel="Sort by Detail type"]')).toBeNull()
        // The header row is the only place a "Sort by" control may exist.
        expect(container.querySelectorAll('[accessibilitylabel^="Sort by"]')).toHaveLength(3)
    })

    it('calls onToggle and not onOpen when the caret is pressed', () => {
        const { container, onToggle, onOpen } = renderTree()
        fireEvent.click(byTestId(container, 'account-caret-acct_fa_00001') as HTMLElement)
        expect(onToggle).toHaveBeenCalledWith('acct_fa_00001')
        expect(onOpen).not.toHaveBeenCalled()
    })

    it('calls onOpen with the id when the row is pressed', () => {
        const { container, onOpen, onToggle } = renderTree()
        fireEvent.click(byTestId(container, 'account-row-acct_exp_0007') as HTMLElement)
        expect(onOpen).toHaveBeenCalledWith('acct_exp_0007')
        expect(onToggle).not.toHaveBeenCalled()
    })
})

// Assumed cell order in both the header row and a body row:
// leading, Name, Type, Detail type, Balance, trailing.
const NAME_CELL = 1
const TYPE_CELL = 2
const DETAIL_CELL = 3
const BALANCE_CELL = 4

// Reads flex-grow from an inline style (flexGrow or the flex shorthand) or a
// Tailwind class (flex-N, flex-[N], grow, grow-N). No grow means 0.
function flexGrowOf(el: HTMLElement): number {
    const grow = Number.parseFloat(el.style.flexGrow)
    if (!Number.isNaN(grow)) return grow
    const shorthand = Number.parseFloat(el.style.flex)
    if (!Number.isNaN(shorthand)) return shorthand
    const cls = classOf(el)
    const flexN = /(?:^|\s)flex-\[?(\d+(?:\.\d+)?)\]?(?:\s|$)/.exec(cls)
    if (flexN) return Number(flexN[1])
    const growN = /(?:^|\s)grow(?:-(\d+))?(?:\s|$)/.exec(cls)
    if (growN) return Number(growN[1] ?? 1)
    return 0
}

function headerCells(container: HTMLElement): HTMLElement[] {
    let el: HTMLElement | null = within(container).getByText('Name')
    while (el && el.children.length !== 6) el = el.parentElement
    return Array.from(el?.children ?? []) as HTMLElement[]
}

function rowCells(container: HTMLElement): HTMLElement[] {
    const row = byTestId(container, 'account-row-acct_exp_0007') as HTMLElement
    return Array.from(row.children) as HTMLElement[]
}

function headerGrows(container: HTMLElement): number[] {
    const label = within(container).getByText('Name')
    let el: HTMLElement | null = label
    while (el && el.children.length !== 6) el = el.parentElement
    return Array.from(el?.children ?? []).map(c => flexGrowOf(c as HTMLElement))
}

function rowGrows(container: HTMLElement): number[] {
    const row = byTestId(container, 'account-row-acct_exp_0007') as HTMLElement
    return Array.from(row.children).map(c => flexGrowOf(c as HTMLElement))
}

describe('AccountTree column flex', () => {
    it('gives the Name column more flex-grow than Detail type in the header', () => {
        const grows = headerGrows(renderTree().container)
        expect(grows).toHaveLength(6)
        expect(grows[NAME_CELL]).toBeGreaterThan(grows[DETAIL_CELL])
    })

    it('gives the Name column more flex-grow than Detail type in a row', () => {
        const grows = rowGrows(renderTree().container)
        expect(grows).toHaveLength(6)
        expect(grows[NAME_CELL]).toBeGreaterThan(grows[DETAIL_CELL])
    })

    it('uses the same flex-grow per column in the header and the rows', () => {
        const { container } = renderTree()
        expect(headerGrows(container)).toEqual(rowGrows(container))
    })

    it.each([
        ['header', headerCells],
        ['row', rowCells],
    ])('gives the Name and Detail type cells the shared basis and min width in the %s', (_label, cellsOf) => {
        const cells = cellsOf(renderTree().container)
        const name = cells[NAME_CELL]
        const detail = cells[DETAIL_CELL]
        expect(Number.parseFloat(name.style.minWidth)).toBe(NAME_CELL_STYLE.minWidth)
        expect(Number.parseFloat(name.style.flexBasis)).toBe(NAME_CELL_STYLE.flexBasis)
        expect(Number.parseFloat(detail.style.flexBasis)).toBe(DETAIL_CELL_STYLE.flexBasis)
    })

    it('keeps the Type and Balance columns from growing', () => {
        const grows = rowGrows(renderTree().container)
        expect(grows[TYPE_CELL]).toBe(0)
        expect(grows[BALANCE_CELL]).toBe(0)
    })
})

function renderSorted(sort: SortState) {
    return render(
        <AccountTree
            rows={visibleRows()}
            sort={sort}
            canToggle={true}
            onSort={vi.fn()}
            onToggle={vi.fn()}
            onOpen={vi.fn()}
        />
    )
}

// The header label and its direction mark share one parent element.
function headerText(view: ReturnType<typeof render>, label: string): string {
    return view.getByText(label).parentElement?.textContent ?? ''
}

describe('AccountTree sort indicator', () => {
    it('marks Name ascending with the default sort', () => {
        const view = renderSorted({ key: null, direction: 'asc' })
        expect(headerText(view, 'Name')).toContain('↑')
        expect(headerText(view, 'Type')).not.toMatch(/[↑↓]/)
        expect(headerText(view, 'Balance')).not.toMatch(/[↑↓]/)
        expect(headerText(view, 'Detail type')).not.toMatch(/[↑↓]/)
    })

    it('marks Name descending after a descending name sort', () => {
        const view = renderSorted({ key: 'name', direction: 'desc' })
        expect(headerText(view, 'Name')).toContain('↓')
        expect(headerText(view, 'Name')).not.toContain('↑')
    })

    it('marks only Balance for an ascending balance sort', () => {
        const view = renderSorted({ key: 'balance', direction: 'asc' })
        expect(headerText(view, 'Balance')).toContain('↑')
        expect(headerText(view, 'Name')).not.toMatch(/[↑↓]/)
        expect(headerText(view, 'Type')).not.toMatch(/[↑↓]/)
        expect(headerText(view, 'Detail type')).not.toMatch(/[↑↓]/)
    })

    it('never marks Detail type', () => {
        for (const sort of [
            { key: null, direction: 'asc' },
            { key: 'name', direction: 'desc' },
            { key: 'type', direction: 'asc' },
            { key: 'balance', direction: 'desc' },
        ] as SortState[]) {
            const view = renderSorted(sort)
            expect(headerText(view, 'Detail type')).not.toMatch(/[↑↓]/)
            view.unmount()
        }
    })
})

// jsdom has no layout, so column alignment is asserted structurally: every
// direct child of the row (the column cells) must be identical for any depth,
// and the indent must sit on an element inside the Name cell.
function cellsOf(container: HTMLElement, id: string, name: string) {
    const row = byTestId(container, `account-row-${id}`) as HTMLElement
    const cells = Array.from(row.children) as HTMLElement[]
    const nameCell = cells.find(cell => cell.contains(within(row).getByText(name))) as HTMLElement
    return { row, cells, nameCell }
}

function paddingOf(el: HTMLElement): number {
    const match = /(?:^|\s)pl-(\d+)(?:\s|$)/.exec(classOf(el))
    return (
        (Number.parseFloat(el.style.paddingLeft || '0') || 0) + (match ? Number(match[1]) * 4 : 0)
    )
}

describe('AccountTree column alignment', () => {
    it('leaves every column cell of a depth-3 row identical to a depth-1 row', () => {
        const { container } = renderTree()
        const d1 = cellsOf(container, 'acct_fa_00001', 'Fixed assets')
        const d3 = cellsOf(container, 'acct_fa_00003', 'Computers')
        expect(d3.cells).toHaveLength(d1.cells.length)
        d1.cells.forEach((cell, i) => {
            expect(classOf(d3.cells[i])).toBe(classOf(cell))
            expect(d3.cells[i].getAttribute('style') ?? '').toBe(cell.getAttribute('style') ?? '')
        })
    })

    it('applies the indent only on an element inside the Name cell', () => {
        const { container } = renderTree()
        const d1 = cellsOf(container, 'acct_fa_00001', 'Fixed assets')
        const d3 = cellsOf(container, 'acct_fa_00003', 'Computers')
        expect(paddingOf(d3.nameCell)).toBe(0)
        const inner = Array.from(d3.nameCell.querySelectorAll<HTMLElement>('*'))
        const d3Inner = Math.max(0, ...inner.map(paddingOf))
        const d1Inner = Math.max(
            0,
            ...Array.from(d1.nameCell.querySelectorAll<HTMLElement>('*')).map(paddingOf)
        )
        expect(d3Inner).toBeGreaterThan(d1Inner)
    })
})

describe('GroupChip', () => {
    it('shows the group label', () => {
        const { getByText } = render(<GroupChip group="liability" />)
        expect(getByText('Liability')).toBeTruthy()
    })
})

function renderCard(id: string, filters: Partial<TreeFilters> = {}) {
    const row = visibleRows(filters).find(r => r.node.account.id === id)
    if (!row) throw new Error(`no row ${id}`)
    const handlers = { onToggle: vi.fn(), onOpen: vi.fn() }
    const view = render(<AccountCard row={row} canToggle={true} {...handlers} />)
    return { ...view, row, ...handlers }
}

describe('AccountCard', () => {
    it('renders name, number, balance, type and detail type', () => {
        const { getByText, row } = renderCard('acct_bank_0002')
        expect(getByText('Operating checking')).toBeTruthy()
        expect(getByText('1010')).toBeTruthy()
        expect(getByText(formatMoney(row.balance, 'USD'))).toBeTruthy()
        expect(getByText('Bank')).toBeTruthy()
        expect(getByText('Checking')).toBeTruthy()
    })

    it('indents by level the way the table row does', () => {
        const d1 = renderCard('acct_fa_00001')
        const i1 = indentOf(
            byTestId(d1.container, 'account-card-acct_fa_00001') as HTMLElement,
            'Fixed assets'
        )
        d1.unmount()
        const d2 = renderCard('acct_fa_00002')
        const i2 = indentOf(
            byTestId(d2.container, 'account-card-acct_fa_00002') as HTMLElement,
            'Equipment'
        )
        d2.unmount()
        const d3 = renderCard('acct_fa_00003')
        const i3 = indentOf(
            byTestId(d3.container, 'account-card-acct_fa_00003') as HTMLElement,
            'Computers'
        )
        expect(i2).toBeGreaterThan(i1)
        expect(i3 - i1).toBe(2 * (i2 - i1))
    })

    it('calls onToggle and not onOpen when the caret is pressed', () => {
        const { container, onToggle, onOpen } = renderCard('acct_fa_00001')
        fireEvent.click(byTestId(container, 'account-caret-acct_fa_00001') as HTMLElement)
        expect(onToggle).toHaveBeenCalledWith('acct_fa_00001')
        expect(onOpen).not.toHaveBeenCalled()
    })

    it('calls onOpen with the id when the card is pressed', () => {
        const { container, onOpen } = renderCard('acct_exp_0007')
        fireEvent.click(byTestId(container, 'account-card-acct_exp_0007') as HTMLElement)
        expect(onOpen).toHaveBeenCalledWith('acct_exp_0007')
    })

    it('shows incl. sub-accounts with the roll-up when collapsed and not when expanded', () => {
        const collapsed = renderCard('acct_fa_00001', { collapsed: new Set(['acct_fa_00001']) })
        expect(collapsed.getByText('incl. sub-accounts')).toBeTruthy()
        expect(collapsed.getByText(formatMoney(collapsed.row.balance, 'USD'))).toBeTruthy()
        collapsed.unmount()
        const expanded = renderCard('acct_fa_00001')
        expect(expanded.queryByText('incl. sub-accounts')).toBeNull()
    })
})

function stepOf(depths: [HTMLElement, string][]): number {
    const [d1, d2] = depths.map(([el, name]) => indentOf(el, name))
    return d2 - d1
}

describe('indent step parity', () => {
    it('uses the same per-level indent on the card as on the table row', () => {
        const table = renderTree()
        const rowStep = stepOf([
            [byTestId(table.container, 'account-row-acct_fa_00001') as HTMLElement, 'Fixed assets'],
            [byTestId(table.container, 'account-row-acct_fa_00002') as HTMLElement, 'Equipment'],
        ])
        table.unmount()
        const c1 = renderCard('acct_fa_00001')
        const cardD1 = byTestId(c1.container, 'account-card-acct_fa_00001') as HTMLElement
        const i1 = indentOf(cardD1, 'Fixed assets')
        c1.unmount()
        const c2 = renderCard('acct_fa_00002')
        const i2 = indentOf(
            byTestId(c2.container, 'account-card-acct_fa_00002') as HTMLElement,
            'Equipment'
        )
        expect(rowStep).toBeGreaterThan(0)
        expect(i2 - i1).toBe(rowStep)
    })
})

describe('canToggle false (search query active)', () => {
    it('renders no caret on table rows', () => {
        const rows = visibleRows()
        expect(rows.some(r => r.hasChildren)).toBe(true)
        const { container } = render(
            <AccountTree
                rows={rows}
                sort={{ key: null, direction: 'asc' }}
                canToggle={false}
                onSort={vi.fn()}
                onToggle={vi.fn()}
                onOpen={vi.fn()}
            />
        )
        expect(
            container.querySelectorAll('[testID^="account-caret-"], [testid^="account-caret-"]')
        ).toHaveLength(0)
        expect(byTestId(container, 'account-row-acct_fa_00001')).not.toBeNull()
    })

    it('renders no caret on a card', () => {
        const row = visibleRows().find(r => r.node.account.id === 'acct_fa_00001')
        if (!row) throw new Error('no row')
        const { container } = render(
            <AccountCard row={row} canToggle={false} onToggle={vi.fn()} onOpen={vi.fn()} />
        )
        expect(byTestId(container, 'account-caret-acct_fa_00001')).toBeNull()
    })

    it('renders the caret on a card and on rows when canToggle is true', () => {
        const card = renderCard('acct_fa_00001')
        expect(byTestId(card.container, 'account-caret-acct_fa_00001')).not.toBeNull()
        const table = renderTree()
        expect(byTestId(table.container, 'account-caret-acct_fa_00001')).not.toBeNull()
    })
})
