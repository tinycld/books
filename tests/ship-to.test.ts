import { describe, expect, it } from 'vitest'
import {
    SHIP_TO_MAX_LENGTH,
    SHIP_TO_MAX_LINES,
    SHIP_TO_MESSAGES,
    SHIP_TO_SCHEMA,
} from '../tinycld/books/lib/ship-to'

// Purchase order spec §3.3: Ship to is text of at most 500 characters (the migration's
// bound, 2100000048) and at most 5 lines.
function issues(value: unknown): string[] {
    const result = SHIP_TO_SCHEMA.safeParse(value)
    return result.success ? [] : result.error.issues.map(issue => issue.message)
}

describe('SHIP_TO_SCHEMA', () => {
    it('takes an empty value, a missing one and 5 lines of 500 characters', () => {
        expect(issues('')).toEqual([])
        expect(issues(null)).toEqual([])
        expect(issues(undefined)).toEqual([])
        const fiveLines = ['a', 'b', 'c', 'd', 'e'.repeat(SHIP_TO_MAX_LENGTH - 8)].join('\n')
        expect(fiveLines).toHaveLength(SHIP_TO_MAX_LENGTH)
        expect(issues(fiveLines)).toEqual([])
    })

    it('refuses 501 characters and a sixth line with their texts', () => {
        expect(SHIP_TO_MAX_LENGTH).toBe(500)
        expect(SHIP_TO_MAX_LINES).toBe(5)
        expect(issues('x'.repeat(501))).toEqual([SHIP_TO_MESSAGES.tooLong])
        expect(issues('1\n2\n3\n4\n5\n6')).toEqual([SHIP_TO_MESSAGES.tooManyLines])
        expect(SHIP_TO_MESSAGES.tooLong).toBe('Ship to can be at most 500 characters')
        expect(SHIP_TO_MESSAGES.tooManyLines).toBe('Ship to can be at most 5 lines')
    })

    it('counts a Windows line break as one break', () => {
        expect(issues('1\r\n2\r\n3\r\n4\r\n5')).toEqual([])
    })
})
