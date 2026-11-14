import { describe, expect, it } from 'vitest'
import {
    CUSTOMER_TAB_ORDER,
    CUSTOMER_TABS,
    customerPageControls,
    customerTabOf,
} from '../tinycld/books/lib/customer-page-tabs'

describe('customerTabOf', () => {
    it('selects the first built tab when there is no tab param', () => {
        expect(customerTabOf(undefined)).toBe(CUSTOMER_TAB_ORDER[0])
    })

    it('selects the first built tab for an unknown value', () => {
        expect(customerTabOf('bogus')).toBe(CUSTOMER_TAB_ORDER[0])
    })

    it('selects the Notes tab from its param', () => {
        expect(customerTabOf('notes')).toBe('notes')
    })

    it('selects the first built tab for a known tab that is not built yet', () => {
        expect(CUSTOMER_TAB_ORDER).not.toContain('transactions')
        expect(customerTabOf('transactions')).toBe(CUSTOMER_TAB_ORDER[0])
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

describe('customerPageControls', () => {
    it('a writer on an active top-level customer gets More, Add sub-customer and Make inactive', () => {
        const controls = customerPageControls({ canWrite: true, inactive: false, isTopLevel: true })
        expect(controls.showMore).toBe(true)
        expect(controls.showAddSub).toBe(true)
        expect(controls.inactiveLabel).toBe('Make inactive')
    })

    it('a writer on an inactive top-level customer gets no Add sub-customer and Make active', () => {
        const controls = customerPageControls({ canWrite: true, inactive: true, isTopLevel: true })
        expect(controls.showMore).toBe(true)
        expect(controls.showAddSub).toBe(false)
        expect(controls.inactiveLabel).toBe('Make active')
    })

    it('a writer on an active sub-customer gets no Add sub-customer', () => {
        const controls = customerPageControls({
            canWrite: true,
            inactive: false,
            isTopLevel: false,
        })
        expect(controls.showMore).toBe(true)
        expect(controls.showAddSub).toBe(false)
    })

    it('a reader gets no More menu and no New transaction', () => {
        const controls = customerPageControls({
            canWrite: false,
            inactive: false,
            isTopLevel: true,
        })
        expect(controls.showMore).toBe(false)
        expect(controls.showAddSub).toBe(false)
        expect(controls.showNewTransaction).toBe(false)
    })

    it('a writer on an inactive customer gets a disabled New transaction', () => {
        const controls = customerPageControls({ canWrite: true, inactive: true, isTopLevel: true })
        expect(controls.showNewTransaction).toBe(true)
        expect(controls.newTransactionDisabled).toBe(true)
    })

    it('a writer on an active customer gets an enabled New transaction', () => {
        const controls = customerPageControls({ canWrite: true, inactive: false, isTopLevel: true })
        expect(controls.showNewTransaction).toBe(true)
        expect(controls.newTransactionDisabled).toBe(false)
    })
})
