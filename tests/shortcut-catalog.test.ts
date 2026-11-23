import { BookOpen, List } from 'lucide-react-native'
import { describe, expect, it } from 'vitest'
import { NEW_ACTIONS, type NewAction } from '../tinycld/books/lib/new-actions'
import {
    LIST_ENTRIES,
    type ListEntry,
    SIDEBAR_ENTRIES,
    type SidebarEntry,
} from '../tinycld/books/lib/shell-nav'
import {
    NEW_TARGETS,
    newTargets,
    SCREEN_TARGETS,
    screenTargets,
    staticTarget,
    staticTargets,
} from '../tinycld/books/lib/shortcut-catalog'
import { DEFAULT_SHORTCUTS, shortcutKey } from '../tinycld/books/lib/sidebar-shortcuts'

function sidebarEntry(id: string, over: Partial<SidebarEntry> = {}): SidebarEntry {
    return { id, label: `Label ${id}`, icon: List, href: `books/${id}`, available: true, ...over }
}

function listEntry(id: string, over: Partial<ListEntry> = {}): ListEntry {
    return {
        id,
        label: `List ${id}`,
        description: '',
        href: `books/${id}`,
        available: true,
        ...over,
    }
}

function action(id: string, label: string, over: Partial<NewAction> = {}): NewAction {
    return { id, label, href: `books/${id}/new`, column: 'other', available: true, ...over }
}

describe('screenTargets', () => {
    it('lists every sidebar entry with its label, route and params', () => {
        const targets = screenTargets(SIDEBAR_ENTRIES, [])
        expect(targets.map(target => target.shortcut.ref)).toEqual(
            SIDEBAR_ENTRIES.map(entry => entry.id)
        )
        expect(targets.map(target => [target.label, target.href, target.params])).toEqual(
            SIDEBAR_ENTRIES.map(entry => [entry.label, entry.href, entry.params])
        )
        expect(targets.every(target => target.shortcut.kind === 'screen')).toBe(true)
        expect(targets.every(target => !target.needsWrite)).toBe(true)
    })

    it('keeps the params of an entry that has them', () => {
        const [target] = screenTargets([sidebarEntry('x', { params: { package: 'books' } })], [])
        expect(target.params).toEqual({ package: 'books' })
    })

    it('adds the lists that have no sidebar entry, after the sidebar entries', () => {
        const refs = SCREEN_TARGETS.map(target => target.shortcut.ref)
        expect(refs.slice(-3)).toEqual(['customers', 'vendors', 'products'])
        expect(SCREEN_TARGETS.find(target => target.shortcut.ref === 'customers')).toMatchObject({
            label: 'Customers',
            href: 'books/customers',
        })
    })

    it('lists a screen that is a sidebar entry and a list one time, under the sidebar label', () => {
        const targets = screenTargets(
            [sidebarEntry('accounts', { label: 'Chart of Accounts' })],
            [listEntry('accounts', { label: 'Accounts' }), listEntry('customers')]
        )
        expect(targets.map(target => target.label)).toEqual(['Chart of Accounts', 'List customers'])
    })

    it('draws a list that has no icon of its own with the book icon', () => {
        expect(BookOpen).toBeDefined()
        const [target] = screenTargets([], [listEntry('payables')])
        expect(target.icon).toBe(BookOpen)
    })

    it('leaves out an entry that is not available', () => {
        const targets = screenTargets(
            [sidebarEntry('a'), sidebarEntry('b', { available: false })],
            [listEntry('c', { available: false }), listEntry('d')]
        )
        expect(targets.map(target => target.shortcut.ref)).toEqual(['a', 'd'])
    })

    it('gives every screen its own ref', () => {
        const keys = SCREEN_TARGETS.map(target => shortcutKey(target.shortcut))
        expect(new Set(keys).size).toBe(keys.length)
        expect(LIST_ENTRIES.every(entry => keys.includes(`screen:${entry.id}`))).toBe(true)
    })
})

describe('newTargets', () => {
    it('lists every New action as a form that needs write access', () => {
        expect(NEW_TARGETS.map(target => target.shortcut.ref)).toEqual(
            NEW_ACTIONS.map(newAction => newAction.id)
        )
        expect(NEW_TARGETS.every(target => target.needsWrite)).toBe(true)
        expect(NEW_TARGETS.every(target => target.shortcut.kind === 'new')).toBe(true)
    })

    it('labels a form "New <thing>", and keeps a label that is a verb already', () => {
        const label = (ref: string) =>
            NEW_TARGETS.find(target => target.shortcut.ref === ref)?.label
        expect(label('invoice')).toBe('New invoice')
        expect(label('sales_receipt')).toBe('New sales receipt')
        expect(label('journal-entry')).toBe('New journal entry')
        expect(label('deposit')).toBe('New bank deposit')
        expect(label('product')).toBe('New product or service')
        expect(label('pay_bills')).toBe('Pay bills')
        expect(label('receive_payment')).toBe('Receive payment')
    })

    it('leaves out an action that is not available', () => {
        const targets = newTargets([
            action('a', 'Alpha'),
            action('b', 'Beta', { available: false }),
        ])
        expect(targets.map(target => target.label)).toEqual(['New alpha'])
    })
})

describe('staticTargets and staticTarget', () => {
    it('gives a reader the screens and no form', () => {
        const reader = staticTargets(false)
        expect(reader).toEqual(SCREEN_TARGETS)
        expect(staticTargets(true)).toEqual([...SCREEN_TARGETS, ...NEW_TARGETS])
    })

    it('finds a screen for every user and a form for a writer only', () => {
        expect(staticTarget({ kind: 'screen', ref: 'customers' }, false)?.href).toBe(
            'books/customers'
        )
        expect(staticTarget({ kind: 'new', ref: 'invoice' }, true)?.href).toBe('books/invoices/new')
        expect(staticTarget({ kind: 'new', ref: 'invoice' }, false)).toBeNull()
    })

    it('does not mix a screen with a form of the same ref', () => {
        const targets = [
            ...screenTargets([sidebarEntry('x')], []),
            ...newTargets([action('x', 'X')]),
        ]
        expect(staticTarget({ kind: 'screen', ref: 'x' }, true, targets)?.href).toBe('books/x')
        expect(staticTarget({ kind: 'new', ref: 'x' }, true, targets)?.href).toBe('books/x/new')
    })

    it('has no target for a ref it does not know, a report or a register', () => {
        expect(staticTarget({ kind: 'screen', ref: 'payroll' }, true)).toBeNull()
        expect(staticTarget({ kind: 'new', ref: 'paycheck' }, true)).toBeNull()
        expect(staticTarget({ kind: 'report', ref: 'books.balance_sheet' }, true)).toBeNull()
        expect(staticTarget({ kind: 'register', ref: 'customers' }, true)).toBeNull()
    })

    it('has a target for each default screen shortcut', () => {
        const screens = DEFAULT_SHORTCUTS.filter(shortcut => shortcut.kind === 'screen')
        expect(screens.length).toBeGreaterThan(0)
        for (const shortcut of screens) {
            expect(staticTarget(shortcut, false)).not.toBeNull()
        }
    })
})
