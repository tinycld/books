import { describe, expect, it } from 'vitest'
import { planChart } from '../tinycld/books/lib/setup-plan'
import { starterChart } from '../tinycld/books/lib/starter-chart'

const none = new Map<string, string>()
const numbers = (levels: { number: string }[][]) => levels.flat().map(item => item.number)

describe('planChart', () => {
    it('plans every account of the chart, parents in an earlier level than their children', () => {
        const levels = planChart('owners', none)
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
        const planned = numbers(planChart('owners', existing))

        expect(planned).not.toContain('1100')
        expect(planned).not.toContain('6000')
        expect(planned).toContain('1000')
        expect(planned).toHaveLength(starterChart('owners').length - 2)
    })

    it('returns no levels when every number already exists', () => {
        const existing = new Map(
            starterChart('corporation').map(item => [item.number, `r${item.number}`])
        )

        expect(planChart('corporation', existing)).toEqual([])
    })

    it('still plans the children of an existing parent', () => {
        const planned = numbers(planChart('owners', new Map([['1000', 'rec_cash']])))

        expect(planned).not.toContain('1000')
        expect(planned).toContain('1010')
        expect(planned).toContain('1020')
    })

    it.each([
        ['owners', "Owner's equity"],
        ['corporation', 'Common stock'],
    ] as const)('plans the %s-specific equity account first, equity ahead of other level-0 accounts', (ownership, firstName) => {
        const levels = planChart(ownership, none)

        expect(levels[0][0].name).toBe(firstName)
        const types = levels[0].map(item => item.type)
        const lastEquity = types.lastIndexOf('equity')
        const firstOther = types.findIndex(type => type !== 'equity')
        expect(lastEquity).toBeGreaterThanOrEqual(0)
        expect(lastEquity).toBeLessThan(firstOther)
    })
})
