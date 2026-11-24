import { describe, expect, it } from 'vitest'
import { staticTargets } from '../tinycld/books/lib/shortcut-catalog'
import {
    reportShortcut,
    type ShortcutChoicesInput,
    searchChoices,
    shortcutChoices,
} from '../tinycld/books/lib/shortcut-choices'
import { MAX_SHORTCUTS, type Shortcut } from '../tinycld/books/lib/sidebar-shortcuts'

const SHIPPED = {
    id: 'rptprofitloss01',
    title: 'Profit and Loss',
    shippedKey: 'books.profit_and_loss',
}
const SAVED = { id: 'rptmysales00001', title: 'My sales by month', shippedKey: '' }
const CHECKING = { value: 'acct_checking', label: '1000 Checking', indent: 0 }
const PETTY = { value: 'acct_petty', label: '1010 Petty cash', indent: 1 }

function input(canWrite = true): ShortcutChoicesInput {
    return {
        targets: staticTargets(canWrite),
        reports: [SHIPPED, SAVED],
        accounts: [CHECKING, PETTY],
    }
}

function ids(list: readonly Shortcut[], canWrite = true) {
    return shortcutChoices(list, input(canWrite)).map(choice => choice.id)
}

describe('shortcutChoices', () => {
    it('offers the screens, the forms, the reports and the registers, in that order', () => {
        const choices = shortcutChoices([], input())
        const groups = choices.map(choice => choice.group)

        expect([...new Set(groups)]).toEqual(['Screens', 'New', 'Reports', 'Registers'])
        // Options of one group are consecutive (SearchPicker draws one heading for each run).
        expect(groups).toEqual([...groups].sort((a, b) => groups.indexOf(a) - groups.indexOf(b)))
        expect(ids([])).toContain('screen:customers')
        expect(ids([])).toContain('new:invoice')
    })

    it('keeps a shipped report by its shipped key and a saved report by its row id', () => {
        expect(reportShortcut(SHIPPED)).toEqual({ kind: 'report', ref: 'books.profit_and_loss' })
        expect(reportShortcut(SAVED)).toEqual({ kind: 'report', ref: 'rptmysales00001' })
        expect(ids([])).toContain('report:books.profit_and_loss')
        expect(ids([])).toContain('report:rptmysales00001')
    })

    it('offers a register for each account, with the chart indent', () => {
        const petty = shortcutChoices([], input()).find(
            choice => choice.id === 'register:acct_petty'
        )

        expect(petty).toMatchObject({
            label: '1010 Petty cash',
            group: 'Registers',
            indent: 1,
            shortcut: { kind: 'register', ref: 'acct_petty' },
        })
    })

    it('leaves out a shortcut that is in the list', () => {
        const list: Shortcut[] = [
            { kind: 'screen', ref: 'customers' },
            { kind: 'report', ref: 'books.profit_and_loss' },
            { kind: 'register', ref: 'acct_checking' },
        ]

        expect(ids(list)).not.toContain('screen:customers')
        expect(ids(list)).not.toContain('report:books.profit_and_loss')
        expect(ids(list)).not.toContain('register:acct_checking')
        expect(ids(list)).toContain('screen:vendors')
        expect(ids(list)).toContain('register:acct_petty')
    })

    it('offers no form to a reader', () => {
        const groups = shortcutChoices([], input(false)).map(choice => choice.group)

        expect(groups).not.toContain('New')
        expect(groups).toContain('Screens')
    })

    it('offers nothing when the list is full', () => {
        const full: Shortcut[] = Array.from({ length: MAX_SHORTCUTS }, (_, i) => ({
            kind: 'register',
            ref: `acct_${i}`,
        }))

        expect(shortcutChoices(full, input())).toEqual([])
    })
})

describe('searchChoices', () => {
    const all = shortcutChoices([], input())

    it('returns every choice for an empty search', () => {
        expect(searchChoices(all, '  ')).toEqual(all)
    })

    it('matches every word in any letter case and drops the indent', () => {
        const found = searchChoices(all, 'CASH petty')

        expect(found.map(choice => choice.id)).toEqual(['register:acct_petty'])
        expect(found[0].indent).toBeUndefined()
    })

    it('returns nothing when no label matches', () => {
        expect(searchChoices(all, 'zebra')).toEqual([])
    })
})
