import { describe, expect, it } from 'vitest'
import {
    autoReversalOverdueAt,
    autoReversalState,
    autoReversalText,
    entryNumberText,
    entryStatusText,
    entryTotalText,
    entryTypeText,
    formatDateTime,
    OVERDUE_MARK_TEXT,
    reversedByText,
    reversesText,
    settledReversal,
    stampText,
} from '../tinycld/books/lib/entry-display'
import { DOC_TYPE_LABELS } from '../tinycld/books/lib/register'

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

    it('labels a manual transfer "Transfer"', () => {
        expect(entryTypeText('manual', 'transfer')).toBe('Transfer')
    })

    it("labels a transfer's void reversal by its origin", () => {
        expect(entryTypeText('void_reversal', 'transfer')).toBe('Void reversal')
    })

    it('keeps "Journal entry" for a manual entry with no document type', () => {
        expect(entryTypeText('manual')).toBe('Journal entry')
        expect(entryTypeText('manual', 'journal')).toBe('Journal entry')
    })

    // One table of doc type labels (register DOC_TYPE_LABELS, a copy of
    // server/entry_type_labels.json): a label changed there changes this text.
    it('reads the doc type labels from DOC_TYPE_LABELS', () => {
        expect(DOC_TYPE_LABELS).toBeDefined()
        const saved = { ...DOC_TYPE_LABELS }
        try {
            DOC_TYPE_LABELS.invoice = 'Invoice (table)'
            DOC_TYPE_LABELS.transfer = 'Transfer (table)'
            expect(entryTypeText('document', 'invoice')).toBe('Invoice (table)')
            expect(entryTypeText('manual', 'transfer')).toBe('Transfer (table)')
        } finally {
            Object.assign(DOC_TYPE_LABELS, saved)
        }
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

describe('the state of an automatic reversal', () => {
    const ms = (iso: string) => Date.parse(iso)
    // Posted on May 31; reverses on June 1.
    const entry = {
        status: 'posted',
        auto_reverse_on: '2026-06-01',
        posted_at: '2026-05-31 15:20:00.000Z',
    }
    const posted = { id: 'r1', number: 'JE-1051', status: 'posted', date: '2026-06-01' }
    const voided = { ...posted, status: 'void' }
    const draft = { ...posted, status: 'draft' }

    it('is none with no date, for a draft, and for a void entry', () => {
        const now = ms('2026-07-01T00:00:00Z')
        expect(autoReversalState({ ...entry, auto_reverse_on: '' }, [], now)).toBe('none')
        expect(autoReversalState({ ...entry, status: 'draft' }, [], now)).toBe('none')
        expect(autoReversalState({ ...entry, status: 'void' }, [posted], now)).toBe('none')
    })

    it('is reversed when a posted reversal exists, whatever the clock says', () => {
        expect(autoReversalState(entry, [draft, posted], ms('2026-05-31T16:00:00Z'))).toBe(
            'reversed'
        )
        expect(autoReversalState(entry, [voided, posted], ms('2026-07-01T00:00:00Z'))).toBe(
            'reversed'
        )
    })

    it('is canceled when the reversal was voided: the server does not reverse again', () => {
        expect(autoReversalState(entry, [voided], ms('2026-05-31T16:00:00Z'))).toBe('canceled')
        expect(autoReversalState(entry, [voided], ms('2026-07-01T00:00:00Z'))).toBe('canceled')
    })

    it('is scheduled before the date, and a draft reversal settles nothing', () => {
        expect(autoReversalState(entry, [], ms('2026-05-31T23:59:59Z'))).toBe('scheduled')
        expect(autoReversalState(entry, [draft], ms('2026-05-31T23:59:59Z'))).toBe('scheduled')
    })

    it('becomes overdue 5 minutes after the first sweep that could post it', () => {
        // The day starts at 00:00 UTC, and a sweep runs then.
        expect(autoReversalOverdueAt(entry)).toBe(ms('2026-06-01T00:05:00Z'))
        expect(autoReversalState(entry, [], ms('2026-06-01T00:04:59Z'))).toBe('scheduled')
        expect(autoReversalState(entry, [], ms('2026-06-01T00:05:00Z'))).toBe('overdue')
        expect(autoReversalState(entry, [draft], ms('2026-06-03T00:00:00Z'))).toBe('overdue')
    })

    it('uses the UTC day, not the local day', () => {
        // 23:30 on May 31 in New York is 03:30 UTC on June 1.
        expect(autoReversalState(entry, [], ms('2026-05-31T23:30:00-04:00'))).toBe('overdue')
    })

    it('waits for the sweep after the post when the entry is posted after its day began', () => {
        const late = { ...entry, posted_at: '2026-06-03 10:20:00.000Z' }
        expect(autoReversalOverdueAt(late)).toBe(ms('2026-06-03T11:05:00Z'))
        expect(autoReversalState(late, [], ms('2026-06-03T10:21:00Z'))).toBe('scheduled')
        expect(autoReversalState(late, [], ms('2026-06-03T11:05:00Z'))).toBe('overdue')
    })

    it('has no overdue time without a date, and reads a bad stamp as the start of the day', () => {
        expect(autoReversalOverdueAt({ auto_reverse_on: '', posted_at: '' })).toBeNull()
        expect(autoReversalOverdueAt({ auto_reverse_on: '2026-06-01', posted_at: '' })).toBe(
            ms('2026-06-01T00:05:00Z')
        )
        expect(autoReversalOverdueAt({ auto_reverse_on: 'soon', posted_at: '' })).toBeNull()
    })
})

describe('the text of an automatic reversal', () => {
    const entry = { status: 'posted', auto_reverse_on: '2026-11-01' }
    const posted = { number: 'JE-1051', date: '2026-11-01' }

    it('is None with no date', () => {
        expect(autoReversalText('none', { status: 'posted', auto_reverse_on: '' }, undefined)).toBe(
            'None'
        )
    })

    it('says Will reverse on only for a scheduled reversal', () => {
        expect(autoReversalText('scheduled', entry, undefined)).toBe('Will reverse on Nov 1, 2026')
        for (const state of ['none', 'reversed', 'canceled', 'overdue'] as const) {
            expect(autoReversalText(state, entry, posted)).not.toContain('Will reverse')
        }
    })

    it('names the reversal that posted', () => {
        expect(autoReversalText('reversed', entry, posted)).toBe(
            'Reversed on Nov 1, 2026 by JE-1051'
        )
    })

    it('tells the person what to do for an overdue reversal', () => {
        expect(autoReversalText('overdue', entry, undefined)).toBe(
            'The automatic reversal of Nov 1, 2026 did not post. Reverse or void this entry.'
        )
    })

    it('says that a voided reversal is not made again', () => {
        expect(autoReversalText('canceled', entry, undefined)).toBe(
            'Not reversed. The reversal of Nov 1, 2026 was voided, and Books does not reverse this entry again.'
        )
    })

    it('explains a date on a draft and on a void entry', () => {
        expect(autoReversalText('none', { ...entry, status: 'draft' }, undefined)).toBe(
            'Nov 1, 2026, after the entry is posted'
        )
        expect(autoReversalText('none', { ...entry, status: 'void' }, undefined)).toBe(
            'Nov 1, 2026. The entry is void, so Books does not reverse it.'
        )
    })
})

describe('settledReversal and reversedByText', () => {
    const posted = { id: 'r1', number: 'JE-1051', status: 'posted', date: '2026-11-01' }
    const voided = { id: 'r0', number: 'JE-1040', status: 'void', date: '2026-10-01' }
    const draft = { id: 'r2', number: '', status: 'draft', date: '2026-11-02' }

    it('picks the posted and the void reversal, never a draft', () => {
        expect(settledReversal([draft, voided, posted])).toEqual({ posted, voided })
        expect(settledReversal([draft])).toEqual({ posted: undefined, voided: undefined })
    })

    it('links only a posted reversal', () => {
        expect(reversedByText(posted)).toBe('Reversed by JE-1051')
        expect(reversedByText(undefined)).toBeUndefined()
    })

    it('has a short mark for the journal list', () => {
        expect(OVERDUE_MARK_TEXT).toBe('Reversal overdue')
    })
})

describe('stampText with an unparseable stamp', () => {
    it('returns an empty string, with no trailing comma', () => {
        expect(stampText('Test User', 'not a date')).toBe('')
        expect(stampText(undefined, 'not a date')).toBe('')
    })
})

describe('entryTotalText', () => {
    it('shows a dash for a row the server has not stamped a total on yet', () => {
        expect(entryTotalText({}, 'USD')).toBe('\u2014')
    })

    it('formats a stamped total, including zero', () => {
        expect(entryTotalText({ total: 123456 }, 'USD')).toBe('$1,234.56')
        expect(entryTotalText({ total: 0 }, 'USD')).toBe('$0.00')
    })
})
