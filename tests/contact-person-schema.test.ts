import { describe, expect, it } from 'vitest'
import { contactPersonSchema } from '../tinycld/books/lib/contact-person-schema'

const valid = {
    name: 'Dana Whitfield',
    role: 'Controller',
    email: 'dana@example.com',
    phone: '(206) 555-0142',
    is_primary: true,
}

// The messages of the refused fields, keyed by field.
function refusals(values: Record<string, unknown>) {
    const result = contactPersonSchema.safeParse(values)
    if (result.success) return {}
    const out: Record<string, string> = {}
    for (const issue of result.error.issues) {
        const key = String(issue.path[0])
        out[key] ??= issue.message
    }
    return out
}

describe('contactPersonSchema', () => {
    it('refuses an empty name with "Enter a name"', () => {
        expect(refusals({ ...valid, name: '' }).name).toBe('Enter a name')
    })

    it('refuses a whitespace-only name with "Enter a name"', () => {
        expect(refusals({ ...valid, name: '   ' }).name).toBe('Enter a name')
    })

    it('refuses a 201-character name', () => {
        expect(refusals({ ...valid, name: 'a'.repeat(201) }).name).toBe(
            'A name can be at most 200 characters'
        )
        expect(refusals({ ...valid, name: 'a'.repeat(200) }).name).toBeUndefined()
    })

    it('refuses a 101-character role', () => {
        expect(refusals({ ...valid, role: 'r'.repeat(101) }).role).toBe(
            'A role can be at most 100 characters'
        )
        expect(refusals({ ...valid, role: 'r'.repeat(100) }).role).toBeUndefined()
    })

    it('refuses an email that is not an address', () => {
        expect(refusals({ ...valid, email: 'not-an-email' }).email).toBe(
            'Enter a valid email address'
        )
    })

    it('accepts an empty email', () => {
        expect(contactPersonSchema.safeParse({ ...valid, email: '' }).success).toBe(true)
    })

    it('refuses a 41-character phone', () => {
        expect(refusals({ ...valid, phone: '5'.repeat(41) }).phone).toBe(
            'A phone number can be at most 40 characters'
        )
        expect(refusals({ ...valid, phone: '5'.repeat(40) }).phone).toBeUndefined()
    })

    it('accepts a full valid row and trims the name', () => {
        const result = contactPersonSchema.safeParse({ ...valid, name: '  Dana Whitfield  ' })
        expect(result.success).toBe(true)
        expect(result.data).toEqual(valid)
    })
})
