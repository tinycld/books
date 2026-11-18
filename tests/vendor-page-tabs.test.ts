import { describe, expect, it } from 'vitest'
import {
    DEFAULT_VENDOR_TAB,
    SHOWN_VENDOR_TABS,
    VENDOR_TAB_ORDER,
    vendorPageControls,
    vendorTabOf,
} from '../tinycld/books/lib/vendor-page-tabs'

// A writer can read Books too: canWrite never comes without canRead.
const WRITER = { canRead: true, canWrite: true }
const READER = { canRead: true, canWrite: false }
const NO_ACCESS = { canRead: false, canWrite: false }

describe('vendorPageControls', () => {
    // Audit history is offered to every reader, so a reader's More holds it alone.
    it('a reader gets Audit history and no write control', () => {
        expect(vendorPageControls({ ...READER, inactive: false })).toEqual({
            showNewTransaction: false,
            newTransactionDisabled: false,
            showInactiveToggle: false,
            showDelete: false,
            showHistory: true,
        })
    })

    it('a writer on an active vendor gets every control, New transaction enabled', () => {
        expect(vendorPageControls({ ...WRITER, inactive: false })).toEqual({
            showNewTransaction: true,
            newTransactionDisabled: false,
            showInactiveToggle: true,
            showDelete: true,
            showHistory: true,
        })
    })

    it('a writer on an inactive vendor gets New transaction disabled and the other controls', () => {
        expect(vendorPageControls({ ...WRITER, inactive: true })).toEqual({
            showNewTransaction: true,
            newTransactionDisabled: true,
            showInactiveToggle: true,
            showDelete: true,
            showHistory: true,
        })
    })

    it('a user who cannot read Books gets no control', () => {
        expect(vendorPageControls({ ...NO_ACCESS, inactive: false })).toEqual({
            showNewTransaction: false,
            newTransactionDisabled: false,
            showInactiveToggle: false,
            showDelete: false,
            showHistory: false,
        })
    })
})

describe('vendorTabOf', () => {
    it('selects the Details tab from its param', () => {
        expect(vendorTabOf('details')).toBe('details')
    })

    // A vendor page has no Statements tab.
    it('selects the default tab for statements, which a vendor page does not have', () => {
        expect(vendorTabOf('statements')).toBe(DEFAULT_VENDOR_TAB)
    })

    it('selects the default tab when there is no tab param', () => {
        expect(vendorTabOf(undefined)).toBe(DEFAULT_VENDOR_TAB)
    })

    it('the default tab is the first of the order', () => {
        expect(DEFAULT_VENDOR_TAB).toBe(VENDOR_TAB_ORDER[0])
    })

    // Vendor pages §2, §3.4: Transactions is the default tab (no `tab` param).
    it('the default tab is Transactions', () => {
        expect(DEFAULT_VENDOR_TAB).toBe('transactions')
        expect(vendorTabOf(undefined)).toBe('transactions')
        expect(vendorTabOf('transactions')).toBe('transactions')
        expect(vendorTabOf('statements')).toBe('transactions')
    })
})

describe('SHOWN_VENDOR_TABS', () => {
    it('draws Transactions, Contacts, Details and Notes with ⌥1 to ⌥4', () => {
        expect(SHOWN_VENDOR_TABS).toEqual([
            { key: 'transactions', label: 'Transactions', keys: 'Alt+1' },
            { key: 'contacts', label: 'Contacts', keys: 'Alt+2' },
            { key: 'details', label: 'Details', keys: 'Alt+3' },
            { key: 'notes', label: 'Notes', keys: 'Alt+4' },
        ])
    })
})
