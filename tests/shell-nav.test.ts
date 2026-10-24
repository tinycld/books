import { List } from 'lucide-react-native'
import { describe, expect, it } from 'vitest'
import { accessFromRow } from '../tinycld/books/lib/access'
import {
    availableOnly,
    isActivePath,
    isNewActionAvailable,
    LIST_ENTRIES,
    NEW_ACTIONS,
    type NewAction,
    newMenuColumns,
    newMenuForAccess,
    SIDEBAR_ENTRIES,
    type SidebarEntry,
    sidebarSections,
} from '../tinycld/books/lib/shell-nav'

const icon = List

function action(id: string, column: NewAction['column'], available: boolean): NewAction {
    return { id, label: id, href: `books/${id}`, column, available }
}

function entry(id: string, available: boolean, group?: 'accounting'): SidebarEntry {
    return { id, label: id, icon, href: `books/${id}`, group, available }
}

describe('registries', () => {
    it('availableOnly drops unavailable entries and keeps order', () => {
        const items = [
            { id: 'a', available: true },
            { id: 'b', available: false },
            { id: 'c', available: true },
            { id: 'd', available: false },
            { id: 'e', available: true },
        ]
        expect(availableOnly(items).map(i => i.id)).toEqual(['a', 'c', 'e'])
    })

    it('SIDEBAR_ENTRIES has Lists and Chart of Accounts and Journal Entries available', () => {
        const byHref = (href: string) => SIDEBAR_ENTRIES.find(e => e.href === href)
        expect(byHref('books/lists')?.available).toBe(true)
        expect(byHref('books/accounts')?.available).toBe(true)
        expect(byHref('books/accounts')?.group).toBe('accounting')
        expect(byHref('books/entries')?.available).toBe(true)
        expect(byHref('books/entries')?.group).toBe('accounting')
    })

    it('NEW_ACTIONS has an available Journal entry action in the other column', () => {
        const journal = NEW_ACTIONS.find(a => a.href === 'books/entries/new')
        expect(journal?.column).toBe('other')
        expect(journal?.available).toBe(true)
    })

    it('LIST_ENTRIES has an available Accounts entry', () => {
        const accounts = LIST_ENTRIES.find(e => e.href === 'books/accounts')
        expect(accounts?.available).toBe(true)
    })

    it('LIST_ENTRIES has an available Journal entries card', () => {
        const entries = LIST_ENTRIES.find(e => e.href === 'books/entries')
        expect(entries?.id).toBe('entries')
        expect(entries?.available).toBe(true)
    })
})

describe('registry integrity', () => {
    it.each([
        ['SIDEBAR_ENTRIES', SIDEBAR_ENTRIES],
        ['NEW_ACTIONS', NEW_ACTIONS],
        ['LIST_ENTRIES', LIST_ENTRIES],
    ])('%s has unique ids and hrefs', (_name, items) => {
        const ids = items.map(i => i.id)
        const hrefs = items.map(i => i.href)
        expect(new Set(ids).size).toBe(ids.length)
        expect(new Set(hrefs).size).toBe(hrefs.length)
    })
})

describe('newMenuColumns', () => {
    it('keeps only the available action within a mixed column', () => {
        const columns = newMenuColumns([
            action('c1', 'customers', true),
            action('c2', 'customers', false),
        ])
        expect(columns).toHaveLength(1)
        expect(columns[0]?.actions.map(a => a.id)).toEqual(['c1'])
    })

    it('orders columns Customers, Vendors, Other and drops all-unavailable columns', () => {
        const actions = [
            action('j', 'other', true),
            action('v', 'vendors', true),
            action('c1', 'customers', false),
            action('c2', 'customers', false),
        ]
        const columns = newMenuColumns(actions)
        expect(columns.map(c => c.heading)).toEqual(['Vendors', 'Other'])

        const all = newMenuColumns([
            action('j', 'other', true),
            action('v', 'vendors', true),
            action('c', 'customers', true),
        ])
        expect(all.map(c => c.heading)).toEqual(['Customers', 'Vendors', 'Other'])
        expect(all[0]?.actions.map(a => a.id)).toEqual(['c'])
    })

    it('returns [] when no action is available', () => {
        expect(newMenuColumns([action('c', 'customers', false)])).toEqual([])
        expect(newMenuColumns([])).toEqual([])
    })
})

describe('newMenuForAccess', () => {
    const actions = [action('c', 'customers', true), action('j', 'other', true)]

    it.each(['none', 'read_only'])('returns [] for %s even with available actions', level => {
        expect(newMenuForAccess(accessFromRow({ level }, true), actions)).toEqual([])
    })

    it.each(['bookkeeper', 'admin'])('returns the columns for %s', level => {
        const columns = newMenuForAccess(accessFromRow({ level }, true), actions)
        expect(columns.map(c => c.heading)).toEqual(['Customers', 'Other'])
    })
})

describe('sidebarSections', () => {
    it('splits accounting entries from the rest', () => {
        const sections = sidebarSections([
            entry('lists', true),
            entry('accounts', true, 'accounting'),
            entry('entries', true, 'accounting'),
        ])
        expect(sections.top.map(e => e.id)).toEqual(['lists'])
        expect(sections.accounting.map(e => e.id)).toEqual(['accounts', 'entries'])
    })

    it('returns an empty accounting list when none is available', () => {
        const sections = sidebarSections(
            availableOnly([entry('lists', true), entry('accounts', false, 'accounting')])
        )
        expect(sections.accounting).toEqual([])
        expect(sections.top.map(e => e.id)).toEqual(['lists'])
    })
})

describe('isActivePath', () => {
    const lists = entry('lists', true)
    const accounts = entry('accounts', true, 'accounting')

    it('matches the exact path and sub-paths only', () => {
        expect(isActivePath('/a/books/lists', lists)).toBe(true)
        expect(isActivePath('/a/books/accounts', lists)).toBe(false)
        expect(isActivePath('/a/books/accounts/42', accounts)).toBe(true)
    })

    it('does not match a near-miss segment', () => {
        expect(isActivePath('/a/books/accounts-foo', accounts)).toBe(false)
    })

    it('matches a trailing slash', () => {
        expect(isActivePath('/a/books/lists/', lists)).toBe(true)
    })

    it('does not match a path with a query string (pathname only is expected)', () => {
        expect(isActivePath('/a/books/lists?x=1', lists)).toBe(false)
    })
})

describe('isNewActionAvailable', () => {
    it('is true for journal-entry with the real NEW_ACTIONS', () => {
        expect(isNewActionAvailable('journal-entry')).toBe(true)
    })

    it('is true for a passed list where the action is available', () => {
        expect(
            isNewActionAvailable('journal-entry', [action('journal-entry', 'other', true)])
        ).toBe(true)
    })

    it('is false for an unknown id', () => {
        expect(isNewActionAvailable('nope', [action('journal-entry', 'other', true)])).toBe(false)
        expect(isNewActionAvailable('nope')).toBe(false)
    })
})
