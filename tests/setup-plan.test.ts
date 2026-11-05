import { describe, expect, it } from 'vitest'
import { planChart } from '../tinycld/books/lib/setup-plan'
import { starterChart } from '../tinycld/books/lib/starter-chart'

const none = new Map<string, string>()
const numbers = (levels: { number: string }[][]) => levels.flat().map(item => item.number)

describe('planChart', () => {
    it('plans every account of the chart, parents in an earlier level than their children', () => {
        const levels = planChart('owners', none, false)
        const chart = starterChart('owners')

        expect([...numbers(levels)].sort()).toEqual(chart.map(item => item.number).sort())

        const levelOfKey = new Map<string, number>()
        levels.forEach((level, index) => {
            for (const item of level) levelOfKey.set(item.key, index)
        })
        const children = chart.filter(item => item.parent)
        expect(children.length).toBeGreaterThan(0)
        for (const child of children) {
            const parentLevel = levelOfKey.get(child.parent as string)
            const childLevel = levelOfKey.get(child.key)
            expect(parentLevel).toBeDefined()
            expect(childLevel).toBeGreaterThan(parentLevel as number)
        }
        expect(levels[0].every(item => !item.parent)).toBe(true)
    })

    it('leaves out an account whose number is a key of existing', () => {
        const existing = new Map([
            ['1100', 'rec_ar'],
            ['6000', 'rec_adv'],
        ])
        const planned = numbers(planChart('owners', existing, false))

        expect(planned).not.toContain('1100')
        expect(planned).not.toContain('6000')
        expect(planned).toContain('1000')
        expect(planned).toHaveLength(starterChart('owners').length - 2)
    })

    it('returns no levels when every number already exists', () => {
        const existing = new Map(
            starterChart('corporation').map(item => [item.number, `r${item.number}`])
        )

        expect(planChart('corporation', existing, false)).toEqual([])
    })

    it('still plans the children of an existing parent', () => {
        const planned = numbers(planChart('owners', new Map([['1000', 'rec_cash']]), false))

        expect(planned).not.toContain('1000')
        expect(planned).toContain('1010')
        expect(planned).toContain('1020')
    })

    it.each([
        ['owners', "Owner's equity"],
        ['corporation', 'Common stock'],
    ] as const)('plans the %s-specific equity account first, equity ahead of other level-0 accounts', (ownership, firstName) => {
        const levels = planChart(ownership, none, false)

        expect(levels[0][0].name).toBe(firstName)
        const types = levels[0].map(item => item.type)
        const lastEquity = types.lastIndexOf('equity')
        const firstOther = types.findIndex(type => type !== 'equity')
        expect(lastEquity).toBeGreaterThanOrEqual(0)
        expect(lastEquity).toBeLessThan(firstOther)
    })

    it('plans 3900 Retained earnings for a new owners chart', () => {
        const planned = planChart('owners', none, false).flat()

        expect(planned.find(item => item.number === '3900')).toMatchObject({
            name: 'Retained earnings',
            detail_type: 'retained_earnings',
        })
    })

    it.each([
        'owners',
        'corporation',
    ] as const)('plans no retained-earnings account for a %s chart that already holds one under another number', ownership => {
        // A resumed batch: the chart has a retained-earnings account numbered 3950.
        const existing = new Map([
            ['1000', 'rec_cash'],
            ['3950', 'rec_retained'],
        ])
        const planned = planChart(ownership, existing, true).flat()

        expect(planned.filter(item => item.detail_type === 'retained_earnings')).toEqual([])
        expect(planned).toHaveLength(starterChart(ownership).length - 2)
    })
})
