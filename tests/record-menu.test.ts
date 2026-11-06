import { describe, expect, it } from 'vitest'
import {
    RECORD_MENU_LABELS,
    RECORD_MENU_WRITES,
    recordMenuItems,
    recordMenuTestIds,
} from '../tinycld/books/lib/record-menu'
import { TAX_MENU_WRITES } from '../tinycld/books/lib/tax-menu'

describe('recordMenuItems', () => {
    it('gives a writer Edit, Make inactive and Delete on an active record, in menu order', () => {
        expect(recordMenuItems({ inactive: false }, true)).toEqual([
            'edit',
            'make-inactive',
            'delete',
        ])
    })

    it('offers Make active in place of Make inactive on an inactive record', () => {
        expect(recordMenuItems({ inactive: true }, true)).toEqual(['edit', 'make-active', 'delete'])
    })

    it.each([{ inactive: false }, { inactive: true }])('gives a reader no menu (%o)', row => {
        expect(recordMenuItems(row, false)).toEqual([])
    })
})

describe('recordMenuTestIds', () => {
    it('prefixes every item and gives both toggle items one test id', () => {
        expect(recordMenuTestIds('widget')).toEqual({
            edit: 'widget-menu-edit',
            'make-inactive': 'widget-menu-toggle-inactive',
            'make-active': 'widget-menu-toggle-inactive',
            delete: 'widget-menu-delete',
        })
    })
})

describe('RECORD_MENU_LABELS', () => {
    it('reads Edit, Make inactive, Make active and Delete', () => {
        expect(RECORD_MENU_LABELS).toEqual({
            edit: 'Edit',
            'make-inactive': 'Make inactive',
            'make-active': 'Make active',
            delete: 'Delete',
        })
    })
})

describe('RECORD_MENU_WRITES', () => {
    it('holds exactly the three write items, not Edit', () => {
        expect([...RECORD_MENU_WRITES].sort()).toEqual(['delete', 'make-active', 'make-inactive'])
        expect(RECORD_MENU_WRITES.has('edit')).toBe(false)
    })

    it("stays the record lists' three items beside the sales tax menu's own set", () => {
        expect(TAX_MENU_WRITES).not.toBe(RECORD_MENU_WRITES)
        expect([...RECORD_MENU_WRITES].sort()).toEqual(['delete', 'make-active', 'make-inactive'])
        expect(RECORD_MENU_WRITES.has('make-default')).toBe(false)
        expect(RECORD_MENU_WRITES.has('remove-default')).toBe(false)
    })
})
