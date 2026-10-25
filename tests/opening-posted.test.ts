import { describe, expect, it } from 'vitest'
import { isWideWindow } from '../tinycld/books/components/opening-balances/opening-grid-style'
import { localDayOf, postedLine } from '../tinycld/books/lib/opening-balances'

function localDayFromDate(moment: Date) {
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`
}

describe('localDayOf', () => {
    it('parses a PocketBase UTC datetime and an ISO datetime to the same local day', () => {
        const pocketbase = localDayOf('2026-10-24 12:00:00.000Z')
        const iso = localDayOf('2026-10-24T12:00:00.000Z')
        expect(pocketbase).toBe(iso)
        expect(pocketbase).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('equals the local calendar day of the instant, for a late-evening and an early-morning UTC time', () => {
        for (const text of ['2026-10-24 23:59:30.000Z', '2026-10-24 00:00:30.000Z']) {
            const expected = localDayFromDate(new Date(Date.parse(text.replace(' ', 'T'))))
            expect(localDayOf(text)).toBe(expected)
        }
    })

    it('returns an empty string for text that is not a datetime', () => {
        expect(localDayOf('')).toBe('')
        expect(localDayOf('not a date')).toBe('')
        expect(localDayOf('2026-13-45 99:00:00.000Z')).toBe('')
    })
})

describe('postedLine', () => {
    const noon = '2026-10-24 12:00:00.000Z'
    const noonDay = (() => {
        const [year, month, day] = localDayOf(noon).split('-').map(Number)
        const months = [
            'Jan',
            'Feb',
            'Mar',
            'Apr',
            'May',
            'Jun',
            'Jul',
            'Aug',
            'Sep',
            'Oct',
            'Nov',
            'Dec',
        ]
        return `${months[month - 1]} ${day}, ${year}`
    })()

    it('joins the number, entry date and poster in the lead and puts the posted day in the tail', () => {
        expect(
            postedLine({ number: '10', date: '2025-12-31', postedBy: 'Test User', postedAt: noon })
        ).toEqual({
            lead: '10 · Dec 31, 2025 · posted by Test User',
            tail: `on ${noonDay}`,
        })
    })

    it('leaves out the number when it is missing', () => {
        expect(
            postedLine({ number: '', date: '2025-12-31', postedBy: 'Ann Lee', postedAt: noon }).lead
        ).toBe('Dec 31, 2025 · posted by Ann Lee')
    })

    it('names an unknown user when postedBy is empty', () => {
        expect(
            postedLine({ number: '10', date: '2025-12-31', postedBy: '', postedAt: noon }).lead
        ).toBe('10 · Dec 31, 2025 · posted by an unknown user')
    })

    it('gives an empty tail when postedAt is empty or malformed', () => {
        for (const postedAt of ['', 'garbage']) {
            expect(
                postedLine({ number: '10', date: '2025-12-31', postedBy: 'Ann Lee', postedAt }).tail
            ).toBe('')
        }
    })

    it('leaves out an invalid entry date', () => {
        expect(
            postedLine({ number: '10', date: '2025-02-30', postedBy: 'Ann Lee', postedAt: noon })
                .lead
        ).toBe('10 · posted by Ann Lee')
    })
})

describe('isWideWindow', () => {
    it('is wide from 768 pixels', () => {
        expect(isWideWindow(767)).toBe(false)
        expect(isWideWindow(768)).toBe(true)
    })
})
