import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(path.resolve(__dirname, '../help/account-register.md'), 'utf8')
const chartSource = readFileSync(path.resolve(__dirname, '../help/chart-of-accounts.md'), 'utf8')
const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source)
const frontmatter = match?.[1] ?? ''
const body = match?.[2] ?? ''

describe('help/account-register.md', () => {
    it('has a title and a summary in its frontmatter', () => {
        expect(match).not.toBeNull()
        expect(frontmatter).toMatch(/^title:\s*\S+/m)
        expect(frontmatter).toMatch(/^summary:\s*\S+/m)
    })

    it.each([
        'View register',
        'Opening balance',
        'Ending balance',
        'This month',
        'Own transactions only',
        'New journal entry',
    ])('mentions "%s"', phrase => {
        expect(body).toContain(phrase)
    })

    it.each([
        'dated after',
        'Opening balance row',
        'last when',
        'Show this fiscal year',
        'when another range is selected',
        'No transactions yet',
    ])('explains "%s"', phrase => {
        expect(body).toContain(phrase)
    })

    it('is linked from the Chart of Accounts topic', () => {
        expect(chartSource).toContain('help://books:account-register')
    })
})
