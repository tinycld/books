import { describe, expect, it } from 'vitest'
import { ACCOUNT_TYPES } from '../tinycld/books/lib/account-types'
import { FISCAL_MONTHS } from '../tinycld/books/lib/setup-schema'
import {
    groupStarterChart,
    inferOwnership,
    OWNERSHIP_CHOICES,
    type Ownership,
    starterChart,
} from '../tinycld/books/lib/starter-chart'

const OWNERSHIPS: Ownership[] = ['owners', 'corporation']

function names(ownership: Ownership) {
    return starterChart(ownership).map(account => account.name)
}

function depth(ownership: Ownership, key: string): number {
    const byKey = new Map(starterChart(ownership).map(account => [account.key, account]))
    const maxLevels = 4
    let levels = 1
    let current = byKey.get(key)
    while (current?.parent) {
        levels += 1
        if (levels > maxLevels) return Number.POSITIVE_INFINITY
        current = byKey.get(current.parent)
    }
    return levels
}

describe.each(OWNERSHIPS)('starterChart(%s)', ownership => {
    const chart = starterChart(ownership)

    it('files every account under a known type and one of its detail types', () => {
        for (const account of chart) {
            const def = ACCOUNT_TYPES.find(type => type.key === account.type)
            expect(def, `${account.name} type ${account.type}`).toBeDefined()
            expect(
                def?.detailTypes.map(detail => detail.key),
                `${account.name} detail ${account.detail_type}`
            ).toContain(account.detail_type)
        }
    })

    it('gives every account a unique, non-empty number', () => {
        const numbers = chart.map(account => account.number)
        expect(numbers.every(number => number.length > 0)).toBe(true)
        expect(new Set(numbers).size).toBe(numbers.length)
    })

    it('points every parent at a same-type account, nested at most 2 levels', () => {
        const byKey = new Map(chart.map(account => [account.key, account]))
        for (const account of chart) {
            if (!account.parent) continue
            const parent = byKey.get(account.parent)
            expect(parent, `${account.name} parent ${account.parent}`).toBeDefined()
            expect(parent?.type).toBe(account.type)
            expect(depth(ownership, account.key)).toBeLessThanOrEqual(2)
        }
    })

    it('has 34 accounts split 9/6/3/4/12 across the five groups', () => {
        expect(chart).toHaveLength(34)
        const counts = groupStarterChart(chart).map(group => [group.label, group.count])
        expect(counts).toEqual([
            ['Assets', 9],
            ['Liabilities', 6],
            ['Equity', 3],
            ['Income', 4],
            ['Expenses', 12],
        ])
    })

    it('numbers every account with 4 digits inside its group range', () => {
        const ranges: Record<string, [number, number]> = {
            Assets: [1000, 1999],
            Liabilities: [2000, 2999],
            Equity: [3000, 3999],
            Income: [4000, 4999],
            Expenses: [5000, 6999],
        }
        for (const group of groupStarterChart(chart)) {
            const [low, high] = ranges[group.label]
            for (const account of group.accounts) {
                expect(account.number, `${account.name} number`).toMatch(/^\d{4}$/)
                const value = Number(account.number)
                expect(value, `${account.name} ${group.label} range`).toBeGreaterThanOrEqual(low)
                expect(value, `${account.name} ${group.label} range`).toBeLessThanOrEqual(high)
            }
        }
    })

    it('nests 1010 and 1020 under 1000 by key', () => {
        const cash = chart.find(account => account.number === '1000')
        expect(cash).toBeDefined()
        for (const number of ['1010', '1020']) {
            const sub = chart.find(account => account.number === number)
            expect(sub, `account ${number}`).toBeDefined()
            expect(sub?.parent).toBe(cash?.key)
        }
    })

    it('has receivable, payable and income accounts', () => {
        const types = chart.map(account => account.type)
        expect(types).toContain('accounts_receivable')
        expect(types).toContain('accounts_payable')
        expect(types).toContain('income')
    })
})

describe('equity accounts by ownership', () => {
    it('owners get owner accounts and no corporation accounts', () => {
        const list = names('owners')
        expect(list).toContain("Owner's equity")
        expect(list).toContain("Owner's contributions")
        expect(list).toContain("Owner's draws")
        expect(list).not.toContain('Common stock')
    })

    it('corporation gets stock accounts and no owner draws', () => {
        const list = names('corporation')
        expect(list).toContain('Common stock')
        expect(list).toContain('Paid-in capital')
        expect(list).toContain('Retained earnings')
        expect(list).not.toContain("Owner's draws")
    })
})

describe('groupStarterChart', () => {
    it('returns the five groups in order with counts matching their accounts', () => {
        const chart = starterChart('owners')
        const groups = groupStarterChart(chart)
        expect(groups.map(group => group.label)).toEqual([
            'Assets',
            'Liabilities',
            'Equity',
            'Income',
            'Expenses',
        ])
        for (const group of groups) expect(group.count).toBe(group.accounts.length)
        expect(groups.reduce((sum, group) => sum + group.count, 0)).toBe(chart.length)
    })
})

describe('choices and months', () => {
    it.each(OWNERSHIPS)('the %s summary names its three equity accounts', ownership => {
        const choice = OWNERSHIP_CHOICES.find(item => item.value === ownership)
        const equity = starterChart(ownership).filter(account => account.type === 'equity')
        expect(equity).toHaveLength(3)
        for (const account of equity) expect(choice?.summary).toContain(account.name)
    })

    it('lists twelve months from January to December', () => {
        expect(FISCAL_MONTHS).toHaveLength(12)
        expect(FISCAL_MONTHS[0]).toBe('January')
        expect(FISCAL_MONTHS[11]).toBe('December')
    })
})

describe('inferOwnership', () => {
    function equityNumbers(ownership: Ownership) {
        return starterChart(ownership)
            .filter(account => account.type === 'equity')
            .map(account => account.number)
    }
    const ownerNumbers = new Set(equityNumbers('owners'))
    const corporationOnly = equityNumbers('corporation').filter(number => !ownerNumbers.has(number))

    // A number-only test can tell the charts apart only when the corporation
    // equity accounts have numbers the owners chart does not use.
    it('has corporation equity numbers that the owners chart does not use', () => {
        expect(corporationOnly.length).toBeGreaterThan(0)
    })

    it('returns corporation when an existing number belongs to a corporation-only account', () => {
        expect(inferOwnership(new Set(corporationOnly))).toBe('corporation')
        expect(inferOwnership(new Set(['1000', ...corporationOnly]))).toBe('corporation')
    })

    it('returns owners for owner equity numbers, for no equity numbers and for no accounts', () => {
        expect(inferOwnership(new Set(equityNumbers('owners')))).toBe('owners')
        expect(inferOwnership(new Set(['1000', '4000']))).toBe('owners')
        expect(inferOwnership(new Set())).toBe('owners')
    })
})
