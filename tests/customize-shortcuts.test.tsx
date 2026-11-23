// @vitest-environment happy-dom
import { fireEvent, render, waitFor } from '@testing-library/react'
import { useToastStore } from '@tinycld/core/lib/stores/toast-store'
import { useWindowSizeStore } from '@tinycld/core/lib/stores/window-size-store'
import { useWorkspaceStore } from '@tinycld/core/lib/stores/workspace-store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CustomizeShortcutsDialog } from '../tinycld/books/components/sidebar/CustomizeShortcutsDialog'
import type { Shortcut } from '../tinycld/books/lib/sidebar-shortcuts'
import BooksSidebar from '../tinycld/books/sidebar'
import { useShortcutsDialogStore } from '../tinycld/books/stores/shortcuts-dialog-store'
import { holdWrites, refuseNthWrite } from './accounts-form-harness'
import { byTestId } from './accounts-test-rows'
import {
    idsWith,
    MY_SALES,
    PROFIT_AND_LOSS,
    SidebarProviders,
    seedSidebar,
} from './sidebar-harness'

vi.mock('@tinycld/core/lib/use-url', () => ({
    useUrl: () => ({ pathname: '/a/books/customers', params: {}, href: '/a/books/customers' }),
}))
vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const CUSTOMERS: Shortcut = { kind: 'screen', ref: 'customers' }
const VENDORS: Shortcut = { kind: 'screen', ref: 'vendors' }
const INVOICE: Shortcut = { kind: 'new', ref: 'invoice' }
const GONE_REPORT: Shortcut = { kind: 'report', ref: 'rptgone00000001' }

const ROW = 'books-shortcuts-row-'
const DEFAULT_ROWS = [
    `${ROW}screen-customers`,
    `${ROW}screen-vendors`,
    `${ROW}screen-products`,
    `${ROW}report-books-profit-and-loss`,
    `${ROW}report-books-balance-sheet`,
]

// The dialog's rows: the ids under the row prefix that are a row, not a row's button.
function rowIds(container: ParentNode) {
    return idsWith(container, ROW).filter(id => !/-(up|down|remove|handle)$/.test(id))
}

function press(container: HTMLElement, testID: string) {
    const node = byTestId(container, testID)
    if (!node) throw new Error(`no element ${testID}`)
    fireEvent.click(node)
}

// The React Native test stub does not copy `disabled` to the element; a disabled button
// of the dialog is the one drawn at 0.4 opacity.
function isDimmed(testID: string) {
    return byTestId(document.body, testID)?.getAttribute('style')?.includes('opacity: 0.4') ?? false
}

function pressCancel() {
    const dialog = byTestId(document.body, 'books-shortcuts-dialog')
    const cancel = [...(dialog?.querySelectorAll('rn-text') ?? [])].find(
        node => node.textContent === 'Cancel'
    )
    if (!cancel) throw new Error('no Cancel button')
    fireEvent.click(cancel)
}

// The sidebar and the dialog as the Books layout draws them.
function renderShell() {
    return render(
        <SidebarProviders>
            <BooksSidebar />
            <CustomizeShortcutsDialog />
        </SidebarProviders>
    )
}

async function openDialog(container: HTMLElement) {
    await waitFor(() => expect(byTestId(container, 'books-shortcuts-customize')).not.toBeNull())
    press(container, 'books-shortcuts-customize')
    await waitFor(() => expect(byTestId(document.body, 'books-shortcuts-dialog')).not.toBeNull())
}

function storedItems(store: { toArray: { items: unknown }[] }) {
    return store.toArray.map(row => row.items)
}

beforeEach(() => {
    useShortcutsDialogStore.setState({ draft: null })
    useToastStore.setState({ toasts: [] })
    useWindowSizeStore.setState({ width: 1280, height: 800 })
    useWorkspaceStore.setState({ isDrawerOpen: false })
})

describe('Customize shortcuts dialog', () => {
    it('opens from the pencil with the list in its order', async () => {
        seedSidebar({ shortcuts: [INVOICE, CUSTOMERS, VENDORS] })
        const { container } = renderShell()
        await openDialog(container)

        expect(rowIds(document.body)).toEqual([
            `${ROW}new-invoice`,
            `${ROW}screen-customers`,
            `${ROW}screen-vendors`,
        ])
        expect(byTestId(document.body, `${ROW}new-invoice`)?.textContent).toContain('New invoice')
    })

    it('shows the defaults for a user with no stored list', async () => {
        seedSidebar()
        const { container } = renderShell()
        await openDialog(container)

        await waitFor(() => expect(rowIds(document.body)).toEqual(DEFAULT_ROWS))
        expect(isDimmed('books-shortcuts-reset')).toBe(true)
    })

    it('writes nothing until Save, then writes the draft one time', async () => {
        const { shortcutsStore } = seedSidebar({ shortcuts: [INVOICE, CUSTOMERS, VENDORS] })
        const update = vi.spyOn(shortcutsStore, 'update')
        const { container } = renderShell()
        await openDialog(container)

        press(document.body as HTMLElement, `${ROW}screen-vendors-up`)
        press(document.body as HTMLElement, `${ROW}screen-vendors-up`)
        press(document.body as HTMLElement, `${ROW}screen-customers-remove`)
        expect(rowIds(document.body)).toEqual([`${ROW}screen-vendors`, `${ROW}new-invoice`])
        expect(update).not.toHaveBeenCalled()
        expect(idsWith(container, 'books-shortcut-')).toHaveLength(3)

        press(document.body as HTMLElement, 'books-shortcuts-save')
        await waitFor(() => expect(storedItems(shortcutsStore)).toEqual([[VENDORS, INVOICE]]))
        expect(update).toHaveBeenCalledTimes(1)
        await waitFor(() => expect(byTestId(document.body, 'books-shortcuts-dialog')).toBeNull())
        await waitFor(() =>
            expect(idsWith(container, 'books-shortcut-')).toEqual([
                'books-shortcut-screen-vendors',
                'books-shortcut-new-invoice',
            ])
        )
    })

    it('stays open with the draft when the write is refused, and saves on the next Save', async () => {
        const { shortcutsStore } = seedSidebar({ shortcuts: [INVOICE, CUSTOMERS] })
        const { container } = renderShell()
        await openDialog(container)
        press(document.body as HTMLElement, `${ROW}new-invoice-remove`)

        refuseNthWrite(1, new Error('refused'))
        press(document.body as HTMLElement, 'books-shortcuts-save')
        await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1))
        expect(byTestId(document.body, 'books-shortcuts-dialog')).not.toBeNull()
        expect(rowIds(document.body)).toEqual([`${ROW}screen-customers`])
        expect(storedItems(shortcutsStore)).toEqual([[INVOICE, CUSTOMERS]])

        press(document.body as HTMLElement, 'books-shortcuts-save')
        await waitFor(() => expect(storedItems(shortcutsStore)).toEqual([[CUSTOMERS]]))
        await waitFor(() => expect(byTestId(document.body, 'books-shortcuts-dialog')).toBeNull())
    })

    it('dims Save and ignores Cancel while a write runs, then closes after the write', async () => {
        const { shortcutsStore } = seedSidebar({ shortcuts: [INVOICE, CUSTOMERS] })
        const { container } = renderShell()
        await openDialog(container)
        press(document.body as HTMLElement, `${ROW}new-invoice-remove`)

        const release = holdWrites()
        press(document.body as HTMLElement, 'books-shortcuts-save')
        // The core Button draws its disabled look from isDisabled as data-disabled.
        const isSaveDisabled = () =>
            byTestId(document.body, 'books-shortcuts-save')?.getAttribute('data-disabled') ===
            'true'
        await waitFor(() => expect(isSaveDisabled()).toBe(true))
        pressCancel()
        expect(byTestId(document.body, 'books-shortcuts-dialog')).not.toBeNull()

        release()
        await waitFor(() => expect(storedItems(shortcutsStore)).toEqual([[CUSTOMERS]]))
        await waitFor(() => expect(byTestId(document.body, 'books-shortcuts-dialog')).toBeNull())
    })

    it('drops the draft on Cancel', async () => {
        const { shortcutsStore } = seedSidebar({ shortcuts: [INVOICE, CUSTOMERS] })
        const { container } = renderShell()
        await openDialog(container)

        press(document.body as HTMLElement, `${ROW}new-invoice-remove`)
        pressCancel()
        expect(byTestId(document.body, 'books-shortcuts-dialog')).toBeNull()
        expect(storedItems(shortcutsStore)).toEqual([[INVOICE, CUSTOMERS]])

        await openDialog(container)
        expect(rowIds(document.body)).toEqual([`${ROW}new-invoice`, `${ROW}screen-customers`])
    })

    it('disables Move up on the first row and Move down on the last', async () => {
        seedSidebar({ shortcuts: [INVOICE, CUSTOMERS] })
        const { container } = renderShell()
        await openDialog(container)

        expect(isDimmed(`${ROW}new-invoice-up`)).toBe(true)
        expect(isDimmed(`${ROW}new-invoice-down`)).toBe(false)
        expect(isDimmed(`${ROW}screen-customers-down`)).toBe(true)
    })

    it('saves an empty list as a stored empty list', async () => {
        const { shortcutsStore } = seedSidebar({ shortcuts: [CUSTOMERS] })
        const { container } = renderShell()
        await openDialog(container)

        press(document.body as HTMLElement, `${ROW}screen-customers-remove`)
        expect(byTestId(document.body, 'books-shortcuts-dialog-empty')).not.toBeNull()
        press(document.body as HTMLElement, 'books-shortcuts-save')

        await waitFor(() => expect(storedItems(shortcutsStore)).toEqual([[]]))
        await waitFor(() => expect(byTestId(container, 'books-shortcuts-empty')).not.toBeNull())
    })

    it('Reset to defaults deletes the stored list on Save', async () => {
        const { shortcutsStore } = seedSidebar({ shortcuts: [INVOICE] })
        const { container } = renderShell()
        await openDialog(container)

        press(document.body as HTMLElement, 'books-shortcuts-reset')
        expect(rowIds(document.body)).toEqual(DEFAULT_ROWS)
        expect(shortcutsStore.toArray).toHaveLength(1)

        press(document.body as HTMLElement, 'books-shortcuts-save')
        await waitFor(() => expect(shortcutsStore.toArray).toHaveLength(0))
        await waitFor(() => expect(idsWith(container, 'books-shortcut-')).toHaveLength(5))
    })

    it('shows a shortcut with nothing to open, so that the user can remove it', async () => {
        const { shortcutsStore } = seedSidebar({
            shortcuts: [GONE_REPORT, { kind: 'report', ref: MY_SALES.id }],
            reports: [PROFIT_AND_LOSS, MY_SALES],
        })
        const { container } = renderShell()
        await openDialog(container)

        const gone = `${ROW}report-rptgone00000001`
        expect(byTestId(document.body, gone)?.textContent).toContain('Not available')
        press(document.body as HTMLElement, `${gone}-remove`)
        press(document.body as HTMLElement, 'books-shortcuts-save')
        await waitFor(() =>
            expect(storedItems(shortcutsStore)).toEqual([[{ kind: 'report', ref: MY_SALES.id }]])
        )
    })

    it('closes the phone drawer when it opens', async () => {
        useWindowSizeStore.setState({ width: 390, height: 844 })
        useWorkspaceStore.setState({ isDrawerOpen: true })
        seedSidebar()
        const { container } = renderShell()
        await openDialog(container)

        expect(useWorkspaceStore.getState().isDrawerOpen).toBe(false)
        expect(rowIds(document.body)).toHaveLength(5)
    })
})
