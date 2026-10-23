// @vitest-environment happy-dom

import { cleanup, fireEvent, render } from '@testing-library/react'
import { OverlayProvider } from '@tinycld/core/ui/overlay'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountTableRow } from '../tinycld/books/components/accounts/AccountRow'
import {
    buildAccountTree,
    defaultSort,
    flattenAccountTree,
} from '../tinycld/books/lib/account-tree'
import { fixtureRows } from './accounts-test-rows'
import { listProps } from './accounts-view-props'

afterEach(cleanup)

function setup() {
    const rows = flattenAccountTree(buildAccountTree(fixtureRows(), defaultSort), {
        collapsed: new Set(),
        query: '',
        group: '',
        showInactive: true,
    })
    const row = rows.find(r => r.hasChildren)
    if (!row) throw new Error('fixture has no account with children')
    const props = {
        ...listProps({ canWrite: true }),
        row,
        canToggle: true,
        onToggle: vi.fn(),
        onOpen: vi.fn(),
        selectedId: '',
    }
    const { container } = render(
        <OverlayProvider>
            <AccountTableRow {...props} />
        </OverlayProvider>
    )
    const id = row.node.account.id
    const q = (testid: string) =>
        container.querySelector(`[testID="${testid}"], [testid="${testid}"]`) as HTMLElement
    return { props, id, q }
}

// Enter and focusability come from react-native-web's Pressable, which the test stub does not model: tests/e2e covers them.
describe('account row keyboard', () => {
    it('opens on Space', () => {
        const { props, id, q } = setup()
        fireEvent.keyDown(q(`account-row-${id}`), { key: ' ' })
        expect(props.onOpen).toHaveBeenCalledWith(id)
    })

    it('does not open when Space is pressed on the caret', () => {
        const { props, id, q } = setup()
        fireEvent.keyDown(q(`account-caret-${id}`), { key: ' ' })
        expect(props.onOpen).not.toHaveBeenCalled()
    })
})
