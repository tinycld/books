import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

const helpDir = path.resolve(__dirname, '../help')

function read(name: string) {
    return readFileSync(path.join(helpDir, name), 'utf8')
}

// The part of a markdown body from a `## <title>` heading to the next one.
function section(body: string, title: string): string {
    return new RegExp(`## ${title}([\\s\\S]*?)(\\n## |$)`).exec(body)?.[1] ?? ''
}

const { exists: topicExists, source, frontmatter, body } = readHelpTopic('transfers')

const TRANSFER_TYPE_LABELS = [
    'Bank',
    'Other current asset',
    'Fixed asset',
    'Other asset',
    'Credit card',
    'Other current liability',
    'Long-term liability',
    'Equity',
] as const

describe('help/transfers.md', () => {
    it('exists', () => {
        expect(topicExists).toBe(true)
    })

    it('has a title and a summary in its frontmatter', () => {
        expect(frontmatter).toMatch(/^title:\s*\S+/m)
        expect(frontmatter).toMatch(/^summary:\s*\S+/m)
    })

    it('links only to topics that exist', () => {
        expect(topicExists).toBe(true)
        const ids = [...source.matchAll(/help:\/\/books:([a-z0-9-]+)/g)].map(m => m[1])
        for (const id of ids) {
            expect(existsSync(path.join(helpDir, `${id}.md`)), `help://books:${id}`).toBe(true)
        }
    })

    it.each([
        'transfer',
        'save draft',
        'post & new',
        'edit',
        'void',
        'delete draft',
        'view journal entry',
        'balance',
        'tr-',
    ])('mentions "%s"', phrase => {
        expect(body.toLowerCase()).toContain(phrase)
    })

    it('names every account type a transfer may use', () => {
        expect(topicExists).toBe(true)
        for (const label of TRANSFER_TYPE_LABELS) expect(body, label).toContain(label)
    })

    it('says a transfer cannot be reversed and cannot reverse automatically', () => {
        expect(body).toMatch(/cannot be reversed|no reverse/i)
        expect(body).toMatch(/automatic/i)
    })

    it('has no hand-written hostname', () => {
        expect(topicExists).toBe(true)
        const withoutTokens = body.replace(/\{\{server-host\}\}/g, '')
        expect(withoutTokens).not.toMatch(
            /\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|app)\b/i
        )
    })

    it('has no Ctrl or Alt keyboard text', () => {
        expect(topicExists).toBe(true)
        expect(body).not.toMatch(/\bCtrl\b/i)
        expect(body).not.toMatch(/\bAlt\b/i)
    })

    it.each(['journal-entries.md', 'account-register.md'])('is linked from %s', name => {
        expect(read(name)).toContain('help://books:transfers')
    })
})

describe('help passages that change once transfers ship', () => {
    const register = read('account-register.md')
    const journal = read('journal-entries.md')

    it('names Transfer on the Type line of the register topic', () => {
        const typeLine = /^- \*\*Type\*\*.*$/m.exec(register)?.[0] ?? ''
        expect(typeLine).not.toBe('')
        expect(typeLine).toMatch(/\bTransfer\b/)
    })

    it('says in the Open entry paragraph that a transfer opens on its own screen', () => {
        const paragraph = register.split(/\n\s*\n/).find(part => part.includes('Open entry')) ?? ''
        expect(paragraph).not.toBe('')
        expect(paragraph).toMatch(/transfer[^\n]*opens/i)
    })

    it('says under "Who can do what" that a posted transfer cannot be reversed', () => {
        const who = section(journal, 'Who can do what')
        expect(who).not.toBe('')
        expect(who).toMatch(/transfer[^\n]*revers/i)
    })
})
