import { Landmark, List, Percent } from 'lucide-react-native'
import { describe, expect, it } from 'vitest'
import { accessFromRow } from '../tinycld/books/lib/access'
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

    it('NEW_ACTIONS has an available Product or service action in the other column, after Transfer', () => {
        const product = NEW_ACTIONS.find(a => a.id === 'product')
        expect(product).toEqual({
            id: 'product',
            label: 'Product or service',
            href: 'books/products/new',
            column: 'other',
            available: true,
        })
        const ids = NEW_ACTIONS.map(a => a.id)
        expect(ids.indexOf('transfer')).toBe(ids.indexOf('journal-entry') + 1)
        expect(ids.indexOf('product')).toBe(ids.indexOf('transfer') + 1)
    })

    it('NEW_ACTIONS has an available Transfer action in the other column at books/transfers/new', () => {
        expect(NEW_ACTIONS.find(a => a.id === 'transfer')).toEqual({
            id: 'transfer',
            label: 'Transfer',
            href: 'books/transfers/new',
            column: 'other',
            available: true,
        })
    })

    it('the New menu Other column lists Journal entry, then Transfer, then Product or service', () => {
        const other = newMenuColumns(NEW_ACTIONS).find(c => c.heading === 'Other')
        expect(other?.actions.map(a => a.label)).toEqual([
            'Journal entry',
            'Transfer',
            'Product or service',
        ])
    })

    it('the New menu starts with the Customers column holding Customer', () => {
        const columns = newMenuColumns(NEW_ACTIONS)
        expect(columns[0]?.heading).toBe('Customers')
        expect(columns[0]?.actions.map(a => a.id)).toEqual([
            'customer',
            'invoice',
            'estimate',
            'sales_receipt',
        ])
        expect(columns.map(c => c.heading)).toEqual(['Customers', 'Vendors', 'Other'])
        expect(columns[1]?.actions.map(a => a.id)).toEqual(['vendor', 'bill'])
    })

    it('NEW_ACTIONS has an available Bill action in the vendors column at books/bills/new', () => {
        expect(NEW_ACTIONS.find(a => a.id === 'bill')).toEqual({
            id: 'bill',
            label: 'Bill',
            href: 'books/bills/new',
            column: 'vendors',
            available: true,
        })
    })

    it('the New menu Vendors column lists Vendor, then Bill', () => {
        const vendors = newMenuColumns(NEW_ACTIONS).find(c => c.heading === 'Vendors')
        expect(vendors?.actions.map(a => a.label)).toEqual(['Vendor', 'Bill'])
    })

    it('the New menu puts an available Invoice right after Customer in the Customers column', () => {
        const customers = newMenuColumns(NEW_ACTIONS).find(c => c.heading === 'Customers')
        expect(customers?.actions.map(a => a.label)).toEqual([
            'Customer',
            'Invoice',
            'Estimate',
            'Sales receipt',
        ])
        const invoice = NEW_ACTIONS.find(a => a.id === 'invoice')
        expect(invoice).toMatchObject({
            label: 'Invoice',
            href: 'books/invoices/new',
            column: 'customers',
            available: true,
            takesCustomer: true,
        })
    })

    it('the New menu lists Sales receipt right after Estimate in the Customers column', () => {
        const customers = newMenuColumns(NEW_ACTIONS).find(c => c.heading === 'Customers')
        const labels = customers?.actions.map(a => a.label) ?? []
        expect(labels.indexOf('Sales receipt')).toBe(labels.indexOf('Estimate') + 1)
        expect(NEW_ACTIONS.find(a => a.id === 'sales_receipt')).toMatchObject({
            label: 'Sales receipt',
            href: 'books/sales-receipts/new',
            column: 'customers',
            available: true,
            takesCustomer: true,
        })
    })

    // Spec §2: + New → Customers → "Estimate", after "Invoice".
    it('the New menu lists an available Estimate right after Invoice, opening a new estimate', () => {
        const customers = newMenuColumns(NEW_ACTIONS).find(c => c.heading === 'Customers')
        const ids = customers?.actions.map(a => a.id) ?? []
        expect(ids.indexOf('estimate')).toBe(ids.indexOf('invoice') + 1)
        expect(NEW_ACTIONS.find(a => a.id === 'estimate')).toEqual({
            id: 'estimate',
            label: 'Estimate',
            href: 'books/estimates/new',
            column: 'customers',
            available: true,
            takesCustomer: true,
        })
    })

    // Customer pages §3.3: the customer page's New transaction menu lists the actions
    // that take a customer.
    it('flags exactly Invoice, Estimate and Sales receipt as taking a customer', () => {
        expect(NEW_ACTIONS.filter(a => a.takesCustomer).map(a => a.id)).toEqual([
            'invoice',
            'estimate',
            'sales_receipt',
        ])
        for (const other of NEW_ACTIONS.filter(a => !a.takesCustomer)) {
            expect(other).not.toHaveProperty('takesCustomer')
        }
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

    it('LIST_ENTRIES has an available Products and services card after Vendors', () => {
        const products = LIST_ENTRIES.find(e => e.id === 'products')
        expect(products).toEqual({
            id: 'products',
            label: 'Products and services',
            description: 'What you sell and buy',
            href: 'books/products',
            available: true,
        })
        const ids = LIST_ENTRIES.map(e => e.id)
        expect(ids.indexOf('products')).toBe(ids.indexOf('vendors') + 1)
    })
})

describe('settings sidebar entry', () => {
    const settings = SIDEBAR_ENTRIES.find(e => e.id === 'settings')

    it('is available with href books/settings in the settings group', () => {
        expect(settings?.available).toBe(true)
        expect(settings?.href).toBe('books/settings')
        expect(settings?.group).toBe('settings')
    })

    it('sidebarSections puts it in end, after Taxes, and not in top or accounting', () => {
        const sections = sidebarSections(availableOnly(SIDEBAR_ENTRIES))
        expect(sections.end.map(e => e.id)).toEqual(['taxes', 'settings'])
        expect(sections.top.map(e => e.id)).not.toContain('settings')
        expect(sections.accounting.map(e => e.id)).not.toContain('settings')
    })

    it('stays last in the rendered order', () => {
        const { top, accounting, end } = sidebarSections(availableOnly(SIDEBAR_ENTRIES))
        const rendered = [...top, ...accounting, ...end]
        expect(rendered[rendered.length - 1]?.id).toBe('settings')
    })
})

describe('banking sidebar entry', () => {
    it('is the first entry, in the top group above Lists, with no New action, Lists card or hidden FAB', () => {
        expect(SIDEBAR_ENTRIES[0]).toEqual({
            id: 'banking',
            label: 'Banking',
            icon: Landmark,
            href: 'books/banking',
            available: true,
        })
        expect(SIDEBAR_ENTRIES[0]?.group).toBeUndefined()
        expect(sidebarSections(availableOnly(SIDEBAR_ENTRIES)).top.map(e => e.id)).toEqual([
            'banking',
            'lists',
            'reports',
        ])
        for (const item of [...NEW_ACTIONS, ...LIST_ENTRIES]) {
            expect(item.id).not.toBe('banking')
            expect(item.href).not.toBe('books/banking')
        }
        expect(hidesNewFab('/a/books/banking')).toBe(false)
    })
})

describe('taxes sidebar entry', () => {
    const taxes = SIDEBAR_ENTRIES.find(e => e.id === 'taxes')

    it('is an available Taxes entry at books/taxes in the settings group', () => {
        expect(taxes).toEqual({
            id: 'taxes',
            label: 'Taxes',
            icon: Percent,
            href: 'books/taxes',
            group: 'settings',
            available: true,
        })
    })

    it('is active on the Taxes page', () => {
        if (!taxes) throw new Error('SIDEBAR_ENTRIES has no taxes entry')
        expect(isActivePath('/a/books/taxes', taxes)).toBe(true)
    })

    it('keeps the New button on the Taxes page', () => {
        expect(hidesNewFab('/a/books/taxes')).toBe(false)
    })
})

describe('reports sidebar entry', () => {
    function reportsEntry(): SidebarEntry {
        const reports = SIDEBAR_ENTRIES.find(e => e.id === 'reports')
        if (!reports) throw new Error('SIDEBAR_ENTRIES has no reports entry')
        return reports
    }

    it("opens core's Reports hub filtered to Books", () => {
        expect(reportsEntry()).toMatchObject({
            label: 'Reports',
            href: 'reports',
            params: { package: 'books' },
        })
    })

    it('is always available and in the top group', () => {
        const reports = reportsEntry()
        expect(reports.available).toBe(true)
        expect(reports.group).toBeUndefined()
        expect(sidebarSections(availableOnly(SIDEBAR_ENTRIES)).top.map(e => e.id)).toContain(
            'reports'
        )
    })

    it('sits right after lists', () => {
        const ids = SIDEBAR_ENTRIES.map(e => e.id)
        expect(ids.indexOf('reports')).toBe(ids.indexOf('lists') + 1)
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
        '/a/books/products',
        '/a/books/products/',
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
        '/a/books/products/abc',
        '/a/books/products/new',
        '/a/acme/books/transfers/new',
        '/a/acme/books/transfers/abc123',
        '/a/acme/books/transfers/abc123/',
        '/a/books/invoices/new',
        '/a/books/invoices/abc',
        '/a/acme/books/invoices/abc123/',
        '/a/books/sales-receipts/new',
        '/a/books/sales-receipts/abc',
        '/a/books/estimates/new',
        '/a/books/estimates/abc',
        '/a/books/bills/new',
        '/a/books/bills/abc',
        '/a/acme/books/bills/abc123/',
    ])('hides the New button on %s', path => {
        expect(hidesNewFab(path)).toBe(true)
    })
})
