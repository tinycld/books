import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    ENTRY_TYPE_LABELS,
    LINE_BOTH_PARTIES,
    LINE_PARTY_INACTIVE,
    PARTY_ON_LINES,
    parseLineRefusal,
} from '../tinycld/books/lib/entry-messages'

const serverSource = readFileSync(join(__dirname, '..', 'server', 'posting.go'), 'utf8')
const linesSource = readFileSync(join(__dirname, '..', 'server', 'lines.go'), 'utf8')

// The string value of a Go const in server/lines.go, or null when it is not there.
function goConst(name: string): string | null {
    const match = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`).exec(linesSource)
    return match ? match[1] : null
}

describe('parseLineRefusal', () => {
    it('splits a "Line n:" message', () => {
        expect(parseLineRefusal('Line 3: the amount is too large.')).toEqual({
            lineNumber: 3,
            text: 'the amount is too large.',
        })
    })

    it('reads the line number of a "Line n has" message', () => {
        const message = 'Line 2 has no amount. Enter an amount or remove the line.'
        const parsed = parseLineRefusal(message)
        expect(parsed.lineNumber).toBe(2)
        expect(parsed.text).toBe(message)
    })

    it('leaves a message without a line number unchanged', () => {
        expect(parseLineRefusal('The books are closed.')).toEqual({
            lineNumber: null,
            text: 'The books are closed.',
        })
    })
})

describe('ENTRY_TYPE_LABELS', () => {
    it('labels every origin', () => {
        expect(ENTRY_TYPE_LABELS).toEqual({
            manual: 'Journal entry',
            reversal: 'Reversal',
            auto_reversal: 'Auto reversal',
            void_reversal: 'Void reversal',
            opening_balance: 'Opening balance',
        })
    })
})

describe('server drift', () => {
    it('every Line %d refusal in server/posting.go parses to its line number', () => {
        const formats = [...serverSource.matchAll(/refuse\("(Line %d[^"]*)"/g)].map(m => m[1])
        expect(formats.length).toBeGreaterThan(0)
        for (const format of formats) {
            const message = format.replace('%d', '7').replace(/%s/g, 'x')
            expect(parseLineRefusal(message).lineNumber, message).toBe(7)
        }
    })
})

describe('line party refusals', () => {
    it.each([
        ['msgLineBothParties', LINE_BOTH_PARTIES],
        ['msgLinePartyInactive', LINE_PARTY_INACTIVE],
        ['msgPartyOnLines', PARTY_ON_LINES],
    ])('%s in server/lines.go equals the client copy', (goName, copy) => {
        expect(goConst(goName)).toBe(copy)
    })

    it('are the decided texts', () => {
        expect(LINE_BOTH_PARTIES).toBe('A line can name a customer or a vendor, not both.')
        expect(LINE_PARTY_INACTIVE).toBe('%s is inactive. Choose an active customer or vendor.')
        expect(PARTY_ON_LINES).toBe('%s is on journal lines. Make it inactive instead.')
    })
})
