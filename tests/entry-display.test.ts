import { describe, expect, it } from 'vitest'
import {
    entryNumberText,
    entryStatusText,
    entryTypeText,
    formatDateTime,
    reversalSummary,
    reversesText,
    stampText,
} from '../tinycld/books/lib/entry-display'

describe('entryNumberText', () => {
    it('shows "Draft" for a draft with no number', () => {
        expect(entryNumberText({ number: '', status: 'draft' })).toBe('Draft')
    })

    it('shows the number of a posted entry', () => {
        expect(entryNumberText({ number: 'JE-1046', status: 'posted' })).toBe('JE-1046')
    })

    it('keeps the number of a void entry', () => {
        expect(entryNumberText({ number: 'JE-1046', status: 'void' })).toBe('JE-1046')
    })
})

describe('entryStatusText', () => {
    it('labels each status', () => {
        expect(entryStatusText('draft')).toBe('Draft')
        expect(entryStatusText('posted')).toBe('Posted')
        expect(entryStatusText('void')).toBe('Void')
    })
})

describe('entryTypeText', () => {
    it('labels the four origins', () => {
        expect(entryTypeText('manual')).toBe('Journal entry')
        expect(entryTypeText('reversal')).toBe('Reversal')
        expect(entryTypeText('void_reversal')).toBe('Void reversal')
        expect(entryTypeText('auto_reversal')).toBe('Auto reversal')
    })
})

describe('reversesText', () => {
    it('names the reversed entry', () => {
        expect(reversesText('JE-1046')).toBe('Reverses JE-1046')
    })

    it('falls back when the original entry is not loaded', () => {
        expect(reversesText(undefined)).toBe('Reverses …')
    })

    it('does not claim a number for an empty one', () => {
        expect(reversesText('')).toBe('Reverses …')
    })
})

describe('stampText', () => {
    const at = '2026-10-21 15:30:00.000Z'

    it('is empty when there is no time', () => {
        expect(stampText('Alice', '')).toBe('')
        expect(stampText(undefined, '')).toBe('')
    })

    it('shows the time alone when the name is missing or empty', () => {
        expect(stampText(undefined, at)).toBe(formatDateTime(at))
        expect(stampText('', at)).toBe(formatDateTime(at))
        expect(stampText(undefined, at)).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}/)
    })

    it('shows the name before the time', () => {
        expect(stampText('Alice', at)).toBe(`Alice, ${formatDateTime(at)}`)
    })
})

describe('reversalSummary', () => {
    const posted = { id: 'r1', number: 'JE-1051', status: 'posted', date: '2026-11-01' }

    it('has nothing for an entry with no reversal and no auto-reverse date', () => {
        expect(reversalSummary(undefined, '')).toEqual({
            linkText: undefined,
            autoReverseText: undefined,
        })
    })

    it('links a posted reversal', () => {
        expect(reversalSummary(posted, '').linkText).toBe('Reversed by JE-1051')
    })

    it('reads "Reversed on <date> by JE-n" when auto-reverse is set and the reversal is posted', () => {
        expect(reversalSummary(posted, '2026-11-01')).toEqual({
            linkText: 'Reversed by JE-1051',
            autoReverseText: 'Reversed on Nov 1, 2026 by JE-1051',
        })
    })

    it('reads "Will reverse on <date>" when auto-reverse is set and nothing is reversed', () => {
        expect(reversalSummary(undefined, '2026-11-01')).toEqual({
            linkText: undefined,
            autoReverseText: 'Will reverse on Nov 1, 2026',
        })
    })

    // The server counts only a posted reversal (postedReversalQuery); a draft has no number.
    it('ignores a draft reversal', () => {
        const draft = { id: 'r2', number: '', status: 'draft', date: '2026-11-01' }
        expect(reversalSummary(draft, '2026-11-01')).toEqual({
            linkText: undefined,
            autoReverseText: 'Will reverse on Nov 1, 2026',
        })
    })

    // A voided reversal leaves the original reversible again.
    it('ignores a void reversal', () => {
        const voided = { ...posted, status: 'void' }
        expect(reversalSummary(voided, '')).toEqual({
            linkText: undefined,
            autoReverseText: undefined,
        })
        expect(reversalSummary(voided, '2026-11-01').autoReverseText).toBe(
            'Will reverse on Nov 1, 2026'
        )
    })
})

describe('stampText with an unparseable stamp', () => {
    it('returns an empty string, with no trailing comma', () => {
        expect(stampText('Test User', 'not a date')).toBe('')
        expect(stampText(undefined, 'not a date')).toBe('')
    })
})
