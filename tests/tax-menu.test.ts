import { describe, expect, it } from 'vitest'
import {
    AGENCY_MENU_LABELS,
    AGENCY_MENU_TEST_IDS,
    agencyMenuItems,
    deleteDialogCopy,
    TAX_MENU_TEST_IDS,
    TAX_MENU_WRITES,
    taxMenuItems,
    taxMenuLabels,
} from '../tinycld/books/lib/tax-menu'

describe('taxMenuItems', () => {
    it.each([
        { inactive: false, isDefault: false },
        { inactive: false, isDefault: true },
        { inactive: true, isDefault: false },
    ])('gives a reader no menu (%o)', row => {
        expect(taxMenuItems(row, false)).toEqual([])
    })

    it('offers Make default on an active row that is not the default', () => {
        expect(taxMenuItems({ inactive: false, isDefault: false }, true)).toEqual([
            'edit',
            'make-default',
            'make-inactive',
            'delete',
        ])
    })

    it('offers Remove default on the default', () => {
        expect(taxMenuItems({ inactive: false, isDefault: true }, true)).toEqual([
            'edit',
            'remove-default',
            'make-inactive',
            'delete',
        ])
    })

    it('offers no default item and Make active on an inactive row', () => {
        expect(taxMenuItems({ inactive: true, isDefault: false }, true)).toEqual([
            'edit',
            'make-active',
            'delete',
        ])
    })
})

describe('agencyMenuItems', () => {
    it('gives a writer Edit agency, Make inactive and Delete on an active agency', () => {
        expect(agencyMenuItems({ inactive: false }, true)).toEqual([
            'edit',
            'make-inactive',
            'delete',
        ])
    })

    it('offers Make active on an inactive agency', () => {
        expect(agencyMenuItems({ inactive: true }, true)).toEqual(['edit', 'make-active', 'delete'])
    })

    it.each([{ inactive: false }, { inactive: true }])('gives a reader no menu (%o)', row => {
        expect(agencyMenuItems(row, false)).toEqual([])
    })
})

describe('menu labels', () => {
    it('names the agency edit item Edit agency', () => {
        expect(AGENCY_MENU_LABELS).toEqual({
            edit: 'Edit agency',
            'make-inactive': 'Make inactive',
            'make-active': 'Make active',
            delete: 'Delete',
        })
    })

    it('names the rate and group items as the Copy list does', () => {
        expect(taxMenuLabels).toEqual({
            edit: 'Edit',
            'make-default': 'Make default',
            'remove-default': 'Remove default',
            'make-inactive': 'Make inactive',
            'make-active': 'Make active',
            delete: 'Delete',
        })
    })
})

describe('menu test ids', () => {
    it('gives both default items one test id and both inactive items one test id', () => {
        expect(TAX_MENU_TEST_IDS).toEqual({
            edit: 'tax-item-edit',
            'make-default': 'tax-item-default',
            'remove-default': 'tax-item-default',
            'make-inactive': 'tax-item-inactive',
            'make-active': 'tax-item-inactive',
            delete: 'tax-item-delete',
        })
    })

    it('uses the same item test ids in the agency menu', () => {
        expect(AGENCY_MENU_TEST_IDS).toEqual({
            edit: 'tax-item-edit',
            'make-inactive': 'tax-item-inactive',
            'make-active': 'tax-item-inactive',
            delete: 'tax-item-delete',
        })
    })
})

describe('TAX_MENU_WRITES', () => {
    it('holds every item that writes and not Edit, so Edit stays pressable offline', () => {
        expect([...TAX_MENU_WRITES].sort()).toEqual([
            'delete',
            'make-active',
            'make-default',
            'make-inactive',
            'remove-default',
        ])
        expect(TAX_MENU_WRITES.has('edit')).toBe(false)
    })
})

describe('deleteDialogCopy', () => {
    it('words the rate delete: title, the line on customer defaults, and Delete rate', () => {
        expect(deleteDialogCopy('rate', 'Denver city')).toEqual({
            title: 'Delete rate “Denver city”?',
            lines: [
                {
                    key: 'what',
                    text: 'The rate is removed from Sales tax. Customers whose default it is lose that default.',
                    tone: 'plain',
                },
            ],
            confirmLabel: 'Delete rate',
        })
    })

    it('words the agency delete', () => {
        expect(deleteDialogCopy('agency', 'City and County of Denver')).toEqual({
            title: 'Delete agency “City and County of Denver”?',
            lines: [{ key: 'what', text: 'The agency is removed from Sales tax.', tone: 'plain' }],
            confirmLabel: 'Delete agency',
        })
    })

    it('words the group delete', () => {
        expect(deleteDialogCopy('group', 'Denver combined')).toEqual({
            title: 'Delete group “Denver combined”?',
            lines: [
                {
                    key: 'what',
                    text: 'The group is removed from Sales tax. Customers whose default it is lose that default.',
                    tone: 'plain',
                },
            ],
            confirmLabel: 'Delete group',
        })
    })
})
