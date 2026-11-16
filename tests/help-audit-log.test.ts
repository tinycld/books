import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

// The Audit Log help topic (audit-log spec §3 "Help").
const { exists, frontmatter, body } = readHelpTopic('audit-log')

// The first block of text that is not a heading.
function firstParagraph(text: string) {
    return (
        text
            .split(/\n\s*\n/)
            .map(block => block.trim())
            .find(block => block !== '' && !block.startsWith('#')) ?? ''
    )
}

const sentences = body.split(/(?<=[.!?])\s+/)

function oneSentence(...phrases: RegExp[]) {
    return sentences.some(sentence => phrases.every(phrase => phrase.test(sentence)))
}

describe('help/audit-log.md', () => {
    it('exists with a title and a summary in its frontmatter', () => {
        expect(exists).toBe(true)
        expect(frontmatter).toMatch(/^title:\s*\S+/m)
        expect(frontmatter).toMatch(/^summary:\s*\S+/m)
    })

    it('starts with "To see who changed a record"', () => {
        expect(firstParagraph(body)).toMatch(/^To see who changed a record/)
    })

    it('names the Audit Log', () => {
        expect(body).toContain('Audit Log')
    })

    // A chip is named as a chip ("press the User chip"), not by any use of its word.
    it.each(['Date changed', 'User', 'Event', 'Record type'])('names the chip "%s"', chip => {
        expect(body).toMatch(new RegExp(`\\bthe ${chip} chip\\b`))
    })

    it.each(['Added', 'Changed', 'Posted', 'Voided', 'Deleted'])('names the event "%s"', event => {
        expect(body).toMatch(new RegExp(`\\b${event}\\b`))
    })

    it('names the side panel and Open as full screen', () => {
        expect(body).toMatch(/\bside panel\b/i)
        expect(body).toContain('Open as full screen')
    })

    it('names More → Audit history', () => {
        expect(body).toMatch(/\bMore\b\s*(→|->|>)\s*\bAudit history\b/)
    })

    // The records whose More menu holds Audit history (cp 4 item D2 gave the bill payment
    // read view that row; pay-bills cp 4 fix round 1, item 3).
    it('lists a bill payment among the records with More → Audit history', () => {
        expect(oneSentence(/\blast item of the More menu\b/, /\bbill payment\b/)).toBe(true)
    })

    it('names "Changed (hidden)"', () => {
        expect(body).toContain('Changed (hidden)')
    })

    it('says everyone who can read Books sees it', () => {
        expect(oneSentence(/\b(everyone|every user|anyone)\b/i, /\bread Books\b/i)).toBe(true)
    })
})
