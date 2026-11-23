import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { paragraphWith, readHelpTopic } from './help-topic'

// The dashboard help topic `books:dashboard` (dashboard spec §4 "Help", checkpoint 4): what
// each widget counts, how to show, hide and reorder the widgets, and Hide amounts.
const helpDir = path.resolve(__dirname, '../help')
const { exists, source, frontmatter, body } = readHelpTopic('dashboard')

// The shot names help/screenshots.ts plans under the 'dashboard' key. The plan file imports
// Playwright, so the test reads its text instead of loading it.
function plannedShots(): string[] {
    const plan = readFileSync(path.join(helpDir, 'screenshots.ts'), 'utf8')
    const block = /\n {4}'?dashboard'?:\s*\[([\s\S]*?)\n {4}\],/.exec(plan)?.[1] ?? ''
    return [...block.matchAll(/name:\s*'([^']+)'/g)].map(m => m[1])
}

describe('help/dashboard.md', () => {
    it('exists with a title and a summary', () => {
        expect(exists).toBe(true)
        expect(frontmatter).toMatch(/^title:\s*\S/m)
        expect(frontmatter).toMatch(/^summary:\s*\S/m)
    })

    it.each([
        'Invoices',
        'Expenses',
        'Bank accounts',
        'Profit and loss',
        'Sales',
    ])('names the %s widget', name => {
        expect(exists).toBe(true)
        expect(body).toContain(name)
    })

    it.each(['Customize', 'Move up', 'Reset to default', 'Hide amounts'])('names %s', text => {
        expect(exists).toBe(true)
        expect(body).toContain(text)
    })

    it.each(['Profit and loss', 'Sales'])('says %s is on the accrual basis', name => {
        expect(
            paragraphWith(body, new RegExp(`\\b${name}\\b`), /\baccrual\b/i),
            `a paragraph that puts ${name} on the accrual basis`
        ).toBeDefined()
    })

    it('hand-writes no hostname other than {{server-host}}', () => {
        expect(exists).toBe(true)
        const stripped = body.replaceAll('{{server-host}}', '')
        expect(stripped).not.toMatch(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|app|co)\b/i)
    })

    it('embeds the planned dashboard-1 picture, in light and dark', () => {
        expect(body).toMatch(/!\[[^\]]+\]\(images\/dashboard-1\.png\)/)
        expect(plannedShots()).toContain('dashboard-1')
        expect(existsSync(path.join(helpDir, 'images/dashboard-1.png'))).toBe(true)
        expect(existsSync(path.join(helpDir, 'images/dashboard-1.dark.png'))).toBe(true)
    })

    it('links only to topics that exist', () => {
        expect(exists).toBe(true)
        const ids = [...source.matchAll(/help:\/\/books:([a-z0-9-]+)/g)].map(m => m[1])
        for (const id of ids) {
            expect(existsSync(path.join(helpDir, `${id}.md`)), `help://books:${id}`).toBe(true)
        }
    })
})

describe('help/navigating-books.md', () => {
    it('links the dashboard topic', () => {
        expect(readHelpTopic('navigating-books').body).toContain('help://books:dashboard')
    })
})
