import { describe, expect, it } from 'vitest'
import {
    CUSTOMER_TAB_ORDER,
    CUSTOMER_TABS,
    customerPageControls,
    customerTabOf,
} from '../tinycld/books/lib/customer-page-tabs'

describe('CUSTOMER_TAB_ORDER', () => {
    it('draws Transactions, Contacts, Details and Notes, in that order', () => {
        expect(CUSTOMER_TAB_ORDER).toEqual(['transactions', 'contacts', 'details', 'notes'])
    })
})

describe('customerTabOf', () => {
    it('selects Transactions when there is no tab param', () => {
        expect(customerTabOf(undefined)).toBe('transactions')
    })

    it('selects Transactions for an unknown value', () => {
        expect(customerTabOf('bogus')).toBe('transactions')
    })

    it('selects the Transactions tab from its param', () => {
        expect(customerTabOf('transactions')).toBe('transactions')
    })

    it('selects the Details and Notes tabs from their params', () => {
        expect(customerTabOf('details')).toBe('details')
        expect(customerTabOf('notes')).toBe('notes')
    })

    it('selects the Contacts tab from its param', () => {
        expect(customerTabOf('contacts')).toBe('contacts')
    })
})

describe('CUSTOMER_TABS', () => {
    it('gives every tab its own shortcut', () => {
        const keys = CUSTOMER_TABS.map(tab => tab.keys)
        expect(new Set(keys).size).toBe(CUSTOMER_TABS.length)
    })

    it('binds the fixed Alt keys to the tabs', () => {
        expect(Object.fromEntries(CUSTOMER_TABS.map(tab => [tab.key, tab.keys]))).toEqual({
            transactions: 'Alt+1',
            contacts: 'Alt+2',
            details: 'Alt+3',
            notes: 'Alt+4',
        })
    })
})

// A writer can read Books too: canWrite never comes without canRead.
const WRITER = { canRead: true, canWrite: true }
const READER = { canRead: true, canWrite: false }
const NO_ACCESS = { canRead: false, canWrite: false }

describe('customerPageControls', () => {
    it('a writer on an active top-level customer gets More, Add sub-customer and Make inactive', () => {
        const controls = customerPageControls({ ...WRITER, inactive: false, isTopLevel: true })
        expect(controls.showMore).toBe(true)
        expect(controls.showWriteItems).toBe(true)
        expect(controls.showAddSub).toBe(true)
        expect(controls.inactiveLabel).toBe('Make inactive')
    })

    it('a writer on an inactive top-level customer gets no Add sub-customer and Make active', () => {
        const controls = customerPageControls({ ...WRITER, inactive: true, isTopLevel: true })
        expect(controls.showMore).toBe(true)
        expect(controls.showAddSub).toBe(false)
        expect(controls.inactiveLabel).toBe('Make active')
    })

    it('a writer on an active sub-customer gets no Add sub-customer', () => {
        const controls = customerPageControls({ ...WRITER, inactive: false, isTopLevel: false })
        expect(controls.showMore).toBe(true)
        expect(controls.showAddSub).toBe(false)
    })

    // Audit history is offered to every reader (spec §3 "Entry points"), so a reader gets
    // More with that item alone: none of the write items.
    it('a reader gets More without its write items, and no New transaction', () => {
        const controls = customerPageControls({ ...READER, inactive: false, isTopLevel: true })
        expect(controls.showMore).toBe(true)
        expect(controls.showWriteItems).toBe(false)
        expect(controls.showAddSub).toBe(false)
        expect(controls.showNewTransaction).toBe(false)
    })

    // One place decides More: a user who cannot read Books (or whose access is still
    // loading, so canRead is false) gets no More, as it would hold nothing.
    it('a user who cannot read Books gets no More and no write items', () => {
        const controls = customerPageControls({ ...NO_ACCESS, inactive: false, isTopLevel: true })
        expect(controls.showMore).toBe(false)
        expect(controls.showWriteItems).toBe(false)
        expect(controls.showNewTransaction).toBe(false)
    })

    it('a writer on an inactive customer gets a disabled New transaction', () => {
        const controls = customerPageControls({ ...WRITER, inactive: true, isTopLevel: true })
        expect(controls.showNewTransaction).toBe(true)
        expect(controls.newTransactionDisabled).toBe(true)
    })

    it('a writer on an active customer gets an enabled New transaction', () => {
        const controls = customerPageControls({ ...WRITER, inactive: false, isTopLevel: true })
        expect(controls.showNewTransaction).toBe(true)
        expect(controls.newTransactionDisabled).toBe(false)
    })
})
