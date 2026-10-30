import { describe, expect, it } from 'vitest'
import { EMPTY_ADDRESS } from '../tinycld/books/lib/address'
import {
    contactValueSchema,
    PHONE_MAX_LENGTH,
    selectValueSchema,
    shippingValueSchema,
} from '../tinycld/books/lib/host-value-schemas'

describe('contactValueSchema', () => {
    it('with a limit of 40 accepts 40 characters and refuses 41', () => {
        const schema = contactValueSchema(40)
        expect(schema.safeParse({ text: 'x'.repeat(40) }).success).toBe(true)
        expect(schema.safeParse({ text: 'x'.repeat(41) }).success).toBe(false)
    })

    it('limits phone numbers to the server limit of 40', () => {
        expect(PHONE_MAX_LENGTH).toBe(40)
    })

    it('without a limit accepts any string, leaving email and URL format to the server', () => {
        const schema = contactValueSchema()
        for (const text of ['', 'not an email', 'ftp:/not a url', 'x'.repeat(1000)]) {
            expect(schema.safeParse({ text }).success).toBe(true)
        }
    })
})

describe('selectValueSchema', () => {
    it('accepts an empty choice and an option value', () => {
        expect(selectValueSchema.safeParse({ value: '' }).success).toBe(true)
        expect(selectValueSchema.safeParse({ value: 'net_30' }).success).toBe(true)
    })

    it('refuses a value that is not a string', () => {
        expect(selectValueSchema.safeParse({ value: 3 }).success).toBe(false)
    })
})

describe('shippingValueSchema', () => {
    it('accepts the empty address with the Same as billing flag', () => {
        expect(shippingValueSchema.safeParse({ ...EMPTY_ADDRESS, same: true }).success).toBe(true)
    })

    it('refuses a part longer than 200 characters', () => {
        const result = shippingValueSchema.safeParse({
            ...EMPTY_ADDRESS,
            same: false,
            line1: 'x'.repeat(201),
        })
        expect(result.success).toBe(false)
    })

    it('refuses a key the server does not store', () => {
        const result = shippingValueSchema.safeParse({ ...EMPTY_ADDRESS, same: true, zip: '1' })
        expect(result.success).toBe(false)
    })
})
