import { describe, expect, it } from 'vitest'
import { box1099ValueSchema } from '../tinycld/books/lib/box-1099-schema'

describe('box1099ValueSchema', () => {
    it('accepts no box and a box key, and refuses a key that is not a box', () => {
        expect(box1099ValueSchema.safeParse({ box: '' }).success).toBe(true)
        expect(box1099ValueSchema.safeParse({ box: 'nec_1' }).success).toBe(true)
        expect(box1099ValueSchema.safeParse({ box: 'misc_7' }).success).toBe(false)
    })
})
