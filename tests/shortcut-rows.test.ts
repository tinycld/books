import { appHref } from '@tinycld/core/lib/org-routes'
import { describe, expect, it } from 'vitest'
import {
    REGISTER_SHORTCUT_ICON,
    REPORT_SHORTCUT_ICON,
    staticTarget,
} from '../tinycld/books/lib/shortcut-catalog'
import {
    reportOfShortcut,
    type ShortcutRowsInput,
    shortcutRows,
    shortcutTestId,
} from '../tinycld/books/lib/shortcut-rows'
import type { Shortcut } from '../tinycld/books/lib/sidebar-shortcuts'

// As core's builder writes an href: a string, or the route and its params.
const orgHref: ShortcutRowsInput['orgHref'] = (path, params) =>
    params ? { pathname: appHref(path), params } : appHref(path)

const REPORTS = [
    { id: 'rpt1', title: 'Profit and Loss', shippedKey: 'books.profit_and_loss' },
    { id: 'rpt2', title: 'My sales', shippedKey: '' },
]
const ACCOUNTS = [
    { id: 'acct1', number: '1000', name: 'Business Checking' },
    { id: 'acct2', number: '', name: 'Petty cash' },
]

function rows(shortcuts: Shortcut[], canWrite = true) {
    return shortcutRows(shortcuts, { canWrite, reports: REPORTS, accounts: ACCOUNTS, orgHref })
}

describe('shortcutTestId', () => {
    it('writes every character that is not a letter or a digit as a dash', () => {
        expect(shortcutTestId({ kind: 'screen', ref: 'customers' })).toBe(
            'books-shortcut-screen-customers'
        )
        expect(shortcutTestId({ kind: 'report', ref: 'books.profit_and_loss' })).toBe(
            'books-shortcut-report-books-profit-and-loss'
        )
        expect(shortcutTestId({ kind: 'new', ref: 'journal-entry' })).toBe(
            'books-shortcut-new-journal-entry'
        )
    })

    it('never starts with the fixed navigation prefix', () => {
        expect(shortcutTestId({ kind: 'screen', ref: 'nav-x' }).startsWith('books-nav-')).toBe(
            false
        )
    })
})

describe('shortcutRows', () => {
    it('draws each kind with its label and route, in the list order', () => {
        const drawn = rows([
            { kind: 'register', ref: 'acct1' },
            { kind: 'report', ref: 'books.profit_and_loss' },
            { kind: 'new', ref: 'invoice' },
            { kind: 'screen', ref: 'customers' },
            { kind: 'report', ref: 'rpt2' },
            { kind: 'register', ref: 'acct2' },
        ])
        expect(drawn.map(row => [row.label, row.href])).toEqual([
            [
                '1000 Business Checking',
                { pathname: '/a/books/accounts/[id]', params: { id: 'acct1' } },
            ],
            ['Profit and Loss', { pathname: '/a/books/reports/[id]', params: { id: 'rpt1' } }],
            ['New invoice', '/a/books/invoices/new'],
            ['Customers', '/a/books/customers'],
            ['My sales', { pathname: '/a/books/reports/[id]', params: { id: 'rpt2' } }],
            ['Petty cash', { pathname: '/a/books/accounts/[id]', params: { id: 'acct2' } }],
        ])
        const icons = [
            REGISTER_SHORTCUT_ICON,
            REPORT_SHORTCUT_ICON,
            staticTarget({ kind: 'new', ref: 'invoice' }, true)?.icon,
            staticTarget({ kind: 'screen', ref: 'customers' }, true)?.icon,
            REPORT_SHORTCUT_ICON,
            REGISTER_SHORTCUT_ICON,
        ]
        // An undefined icon would equal an undefined icon: each must exist first.
        for (const icon of icons) expect(icon).toBeDefined()
        expect(drawn.map(row => row.icon)).toEqual(icons)
        expect(drawn.map(row => row.key)).toEqual([
            'register:acct1',
            'report:books.profit_and_loss',
            'new:invoice',
            'screen:customers',
            'report:rpt2',
            'register:acct2',
        ])
    })

    it('leaves out a shortcut that has nothing to open and keeps the rest', () => {
        const drawn = rows([
            { kind: 'report', ref: 'books.gone' },
            { kind: 'register', ref: 'deleted' },
            { kind: 'screen', ref: 'payroll' },
            { kind: 'screen', ref: 'vendors' },
        ])
        expect(drawn.map(row => row.label)).toEqual(['Vendors'])
    })

    it('gives a reader no transaction form', () => {
        const list: Shortcut[] = [
            { kind: 'new', ref: 'invoice' },
            { kind: 'screen', ref: 'customers' },
        ]
        expect(rows(list, false).map(row => row.label)).toEqual(['Customers'])
    })

    // Inventory adjustment spec §2: a shortcut to the new adjustment form opens it, for a
    // writer only.
    it('draws a New inventory adjustment shortcut at its new route, and none for a reader', () => {
        const list: Shortcut[] = [{ kind: 'new', ref: 'inventory_adjustment' }]
        const drawn = rows(list)
        expect(drawn.map(row => [row.label, row.href, row.key])).toEqual([
            [
                'New inventory adjustment',
                '/a/books/inventory-adjustments/new',
                'new:inventory_adjustment',
            ],
        ])
        expect(drawn[0]?.testID).toBe('books-shortcut-new-inventory-adjustment')
        expect(rows(list, false)).toEqual([])
    })

    it('draws nothing for an empty list', () => {
        expect(rows([])).toEqual([])
    })
})

describe('reportOfShortcut', () => {
    it('finds a shipped report by its key and a saved report by its id', () => {
        expect(reportOfShortcut('books.profit_and_loss', REPORTS)?.id).toBe('rpt1')
        expect(reportOfShortcut('rpt2', REPORTS)?.id).toBe('rpt2')
        expect(reportOfShortcut('rpt9', REPORTS)).toBeUndefined()
    })

    it('does not take an empty ref for a saved report, whose shipped key is empty', () => {
        expect(reportOfShortcut('', REPORTS)).toBeUndefined()
    })
})
