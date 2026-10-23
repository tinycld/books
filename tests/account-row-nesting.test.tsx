// @vitest-environment happy-dom

import { cleanup, fireEvent, render } from '@testing-library/react'
import { OverlayProvider } from '@tinycld/core/ui/overlay'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountCard } from '../tinycld/books/components/accounts/AccountCard'
import { AccountTableRow } from '../tinycld/books/components/accounts/AccountRow'
import {
    buildAccountTree,
    defaultSort,
    flattenAccountTree,
    type TreeFilters,
} from '../tinycld/books/lib/account-tree'
import { fixtureRows } from './accounts-test-rows'
import { listProps } from './accounts-view-props'

afterEach(cleanup)

const open: TreeFilters = { collapsed: new Set(), query: '', group: '', showInactive: true }
const BUTTON = 'button, [role="button"], [accessibilityrole="button"]'

// A row with children, so the caret renders next to the checkbox and the menu trigger.
function parentRow() {
    const rows = flattenAccountTree(buildAccountTree(fixtureRows(), defaultSort), open)
    const row = rows.find(r => r.hasChildren)
    if (!row) throw new Error('fixture has no account with children')
    return row
}

function rowProps() {
    const { canWrite, isWorking, isSelected, onSelect, menu } = listProps({ canWrite: true })
    return {
        row: parentRow(),
        canToggle: true,
        onToggle: vi.fn(),
        onOpen: vi.fn(),
        selectedId: '',
        canWrite,
        isWorking,
        isSelected,
        onSelect,
        menu,
    }
}

function nestedButtons(root: ParentNode): string[] {
    return Array.from(root.querySelectorAll<HTMLElement>(BUTTON))
        .filter(el => el.querySelector(BUTTON) !== null)
        .map(el => el.getAttribute('testid') ?? el.getAttribute('testID') ?? el.tagName)
}

const cases = [
    ['wide table row', (p: ReturnType<typeof rowProps>) => <AccountTableRow {...p} />],
    ['phone card', (p: ReturnType<typeof rowProps>) => <AccountCard {...p} />],
] as const

describe.each(cases)('%s button nesting', (_label, make) => {
    it('logs no DOM nesting warning', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        render(<OverlayProvider>{make(rowProps())}</OverlayProvider>)
        const nesting = error.mock.calls.filter(call =>
            /validateDOMNesting|cannot contain a nested/.test(String(call[0]) + String(call[1]))
        )
        error.mockRestore()
        expect(nesting).toEqual([])
    })

    it('has no button or role=button element inside another', () => {
        const { container } = render(<OverlayProvider>{make(rowProps())}</OverlayProvider>)
        expect(container.querySelectorAll(BUTTON).length).toBeGreaterThan(1)
        expect(nestedButtons(container)).toEqual([])
    })

    it('still opens the account when the row is pressed', () => {
        const props = rowProps()
        const { container } = render(<OverlayProvider>{make(props)}</OverlayProvider>)
        const id = props.row.node.account.id
        const target = container.querySelector(
            `[testID="account-row-${id}"], [testid="account-row-${id}"], [testID="account-card-${id}"], [testid="account-card-${id}"]`
        )
        fireEvent.click(target as HTMLElement)
        expect(props.onOpen).toHaveBeenCalledWith(id)
    })

    it('toggles the caret and the checkbox without opening the account', () => {
        const props = rowProps()
        const id = props.row.node.account.id
        const { container } = render(<OverlayProvider>{make(props)}</OverlayProvider>)
        fireEvent.click(
            container.querySelector(
                `[testid="account-caret-${id}"], [testID="account-caret-${id}"]`
            ) as HTMLElement
        )
        expect(props.onToggle).toHaveBeenCalledWith(id)
        expect(props.onOpen).not.toHaveBeenCalled()
    })
})
