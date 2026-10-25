import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ENTRY_TYPE_LABELS, parseLineRefusal } from '../tinycld/books/lib/entry-messages'

const serverSource = readFileSync(join(__dirname, '..', 'server', 'posting.go'), 'utf8')

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
