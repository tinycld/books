import { List } from 'lucide-react-native'
import { describe, expect, it } from 'vitest'
import { accessFromRow } from '../tinycld/books/lib/access'
import { hasAvailableReport, REPORT_ENTRIES } from '../tinycld/books/lib/report-registry'
import {
    availableOnly,
    hidesNewFab,
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

function entry(id: string, available: boolean, group?: 'accounting' | 'settings'): SidebarEntry {
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

    it('NEW_ACTIONS has an available Customer action in the customers column', () => {
        const customer = NEW_ACTIONS.find(a => a.id === 'customer')
        expect(customer).toEqual({
            id: 'customer',
            label: 'Customer',
            href: 'books/customers/new',
            column: 'customers',
            available: true,
        })
    })

    it('NEW_ACTIONS has an available Vendor action in the vendors column', () => {
        const vendor = NEW_ACTIONS.find(a => a.id === 'vendor')
        expect(vendor).toEqual({
            id: 'vendor',
            label: 'Vendor',
            href: 'books/vendors/new',
            column: 'vendors',
            available: true,
        })
    })

    it('the New menu starts with the Customers column holding Customer', () => {
        const columns = newMenuColumns(NEW_ACTIONS)
        expect(columns[0]?.heading).toBe('Customers')
        expect(columns[0]?.actions.map(a => a.id)).toEqual(['customer'])
        expect(columns.map(c => c.heading)).toEqual(['Customers', 'Vendors', 'Other'])
        expect(columns[1]?.actions.map(a => a.id)).toEqual(['vendor'])
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

    it('LIST_ENTRIES has an available Customers card', () => {
        const customers = LIST_ENTRIES.find(e => e.id === 'customers')
        expect(customers).toEqual({
            id: 'customers',
            label: 'Customers',
            description: 'People and companies you sell to',
            href: 'books/customers',
            available: true,
        })
    })

    it('LIST_ENTRIES has an available Vendors card', () => {
        const vendors = LIST_ENTRIES.find(e => e.id === 'vendors')
        expect(vendors).toEqual({
            id: 'vendors',
            label: 'Vendors',
            description: 'People and companies you buy from',
            href: 'books/vendors',
            available: true,
        })
    })
})

describe('settings sidebar entry', () => {
    const settings = SIDEBAR_ENTRIES.find(e => e.id === 'settings')

    it('is available with href books/settings in the settings group', () => {
        expect(settings?.available).toBe(true)
        expect(settings?.href).toBe('books/settings')
        expect(settings?.group).toBe('settings')
    })

    it('sidebarSections puts it in end and not in top or accounting', () => {
        const sections = sidebarSections(availableOnly(SIDEBAR_ENTRIES))
        expect(sections.end.map(e => e.id)).toEqual(['settings'])
        expect(sections.top.map(e => e.id)).not.toContain('settings')
        expect(sections.accounting.map(e => e.id)).not.toContain('settings')
    })

    it('stays last in the rendered order', () => {
        const { top, accounting, end } = sidebarSections(availableOnly(SIDEBAR_ENTRIES))
        const rendered = [...top, ...accounting, ...end]
        expect(rendered[rendered.length - 1]?.id).toBe('settings')
    })
})

describe('reports sidebar entry', () => {
    function reportsEntry(): SidebarEntry {
        const reports = SIDEBAR_ENTRIES.find(e => e.id === 'reports')
        if (!reports) throw new Error('SIDEBAR_ENTRIES has no reports entry')
        return reports
    }

    it('is a top-group Reports entry at books/reports', () => {
        const reports = reportsEntry()
        expect(reports.label).toBe('Reports')
        expect(reports.href).toBe('books/reports')
        expect(reports.group).toBeUndefined()
    })

    it('sits right after lists', () => {
        const ids = SIDEBAR_ENTRIES.map(e => e.id)
        expect(ids.indexOf('reports')).toBe(ids.indexOf('lists') + 1)
    })

    it('is available exactly when the registry has an available report', () => {
        expect(reportsEntry().available).toBe(hasAvailableReport(REPORT_ENTRIES))
    })

    it('hasAvailableReport is false when every entry is unavailable and true when one is', () => {
        const none = REPORT_ENTRIES.map(e => ({ ...e, available: false }))
        const one = none.map(e => (e.id === 'trial-balance' ? { ...e, available: true } : e))
        expect(hasAvailableReport(none)).toBe(false)
        expect(hasAvailableReport(one)).toBe(true)
    })

    it('is active on a report screen under books/reports', () => {
        expect(isActivePath('/a/books/reports/trial-balance', reportsEntry())).toBe(true)
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

describe('hidesNewFab', () => {
    it.each([
        '/a/acme/books/entries',
        '/a/acme/books/entries/',
        '/a/entries/books',
        '/a/acme/books/accounts',
        '/a/books/customers',
        '/a/books/customers/',
        '/a/books/vendors',
        '/a/books/vendors/',
    ])('keeps the New button on %s', path => {
        expect(hidesNewFab(path)).toBe(false)
    })

    it.each([
        '/a/acme/books/entries/new',
        '/a/acme/books/entries/new/',
        '/a/acme/books/entries/abc123',
        '/a/acme/books/entries/abc123/',
        '/a/books/customers/abc',
        '/a/books/customers/new',
        '/a/books/vendors/abc',
        '/a/books/vendors/new',
    ])('hides the New button on %s', path => {
        expect(hidesNewFab(path)).toBe(true)
    })
})
