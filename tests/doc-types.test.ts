import { describe, expect, it } from 'vitest'
import { docTypeLabel, nextNumberPreview } from '../tinycld/books/lib/doc-types'

describe('docTypeLabel', () => {
    it('labels journal and falls back to the raw doc type', () => {
        expect(docTypeLabel('journal')).toBe('Journal entries')
        expect(docTypeLabel('quote')).toBe('quote')
    })
})

describe('nextNumberPreview', () => {
    it('joins prefix and number with no padding', () => {
        expect(nextNumberPreview('journal', 'JE-', '1001')).toBe('Next entry: JE-1001')
        expect(nextNumberPreview('journal', '', '1001')).toBe('Next entry: 1001')
        expect(nextNumberPreview('journal', 'JE-', '7')).toBe('Next entry: JE-7')
    })

    it('uses a generic noun for an unknown doc type', () => {
        expect(nextNumberPreview('quote', 'Q-', '5')).toBe('Next number: Q-5')
    })

    it('shows no number for an invalid next number and does not throw', () => {
        for (const bad of ['', '1.5', 'abc']) {
            const preview = nextNumberPreview('journal', 'JE-', bad)
            expect(preview).toContain('Next entry')
            expect(preview).not.toMatch(/\d/)
        }
    })

    it('never prints exponent notation for a huge number', () => {
        const preview = nextNumberPreview('journal', 'JE-', '1'.padEnd(25, '0'))
        expect(preview).not.toMatch(/e\+/i)
        expect(preview).toBe('Next entry:')
    })

    it('falls back to the label only above 999999999', () => {
        expect(nextNumberPreview('journal', 'JE-', '1000000000')).toBe('Next entry:')
        expect(nextNumberPreview('journal', 'JE-', '999999999')).toBe('Next entry: JE-999999999')
    })

    it('reads leading zeros as the number', () => {
        expect(nextNumberPreview('journal', 'JE-', '007')).toBe('Next entry: JE-7')
    })
})
