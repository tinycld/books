import { describe, expect, it } from 'vitest'
import { customerMenuItems, deleteDecision } from '../tinycld/books/lib/customer-actions'

describe('customerMenuItems', () => {
    it('gives a writer every item on an active top-level customer, in menu order', () => {
        expect(customerMenuItems({ isTopLevel: true, inactive: false }, true)).toEqual([
            'edit',
            'add-sub',
            'make-inactive',
            'delete',
        ])
    })

    it('leaves Add sub-customer off a sub-customer', () => {
        expect(customerMenuItems({ isTopLevel: false, inactive: false }, true)).toEqual([
            'edit',
            'make-inactive',
            'delete',
        ])
    })

    it('offers Make active in place of Make inactive on an inactive customer', () => {
        expect(customerMenuItems({ isTopLevel: true, inactive: true }, true)).toEqual([
            'edit',
            'add-sub',
            'make-active',
            'delete',
        ])
        expect(customerMenuItems({ isTopLevel: false, inactive: true }, true)).toEqual([
            'edit',
            'make-active',
            'delete',
        ])
    })

    it.each([
        { isTopLevel: true, inactive: false },
        { isTopLevel: true, inactive: true },
        { isTopLevel: false, inactive: false },
        { isTopLevel: false, inactive: true },
    ])('gives a reader no menu (%o)', row => {
        expect(customerMenuItems(row, false)).toEqual([])
    })
})

describe('deleteDecision', () => {
    it('deletes a customer with no sub-customers', () => {
        expect(deleteDecision([])).toBe('delete')
    })

    it('offers Make inactive when every sub-customer is inactive', () => {
        expect(deleteDecision([{ inactive: true }, { inactive: true }])).toBe('make-inactive')
        expect(deleteDecision([{ inactive: true }])).toBe('make-inactive')
    })

    it.each([
        [[{ inactive: false }]],
        [[{ inactive: true }, { inactive: false }]],
        [[{ inactive: false }, { inactive: true }, { inactive: true }]],
        [[{ inactive: false }, { inactive: false }]],
    ])('offers only Close when any sub-customer is active (%o)', subs => {
        expect(deleteDecision(subs)).toBe('close-only')
    })
})
