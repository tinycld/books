import { describe, expect, it } from 'vitest'
import { customerNotesSchema } from '../tinycld/books/lib/customer-notes-schema'

describe('customerNotesSchema', () => {
    it('accepts 5000 characters', () => {
        const notes = 'a'.repeat(5000)
        expect(customerNotesSchema.parse({ notes })).toEqual({ notes })
    })

    it('refuses 5001 characters with the max-length message', () => {
        const result = customerNotesSchema.safeParse({ notes: 'a'.repeat(5001) })
        expect(result.success).toBe(false)
        expect(result.error?.issues.map(issue => issue.message)).toEqual([
            'Notes can be at most 5000 characters',
        ])
        expect(result.error?.issues[0]?.path).toEqual(['notes'])
    })

    it('accepts an empty string', () => {
        expect(customerNotesSchema.parse({ notes: '' })).toEqual({ notes: '' })
    })
})
