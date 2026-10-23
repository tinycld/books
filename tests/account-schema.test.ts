import { describe, expect, it } from 'vitest'
import { accountFormSchema } from '../tinycld/books/lib/account-schema'

const valid = {
    name: 'Cash',
    number: '',
    type: 'bank',
    detail_type: 'checking',
    parent: '',
    description: '',
}

function errorFields(overrides: Partial<Record<keyof typeof valid, unknown>>) {
    const result = accountFormSchema.safeParse({ ...valid, ...overrides })
    if (result.success) return []
    return result.error.issues.map(issue => String(issue.path[0]))
}

describe('accountFormSchema', () => {
    it('accepts a complete valid account', () => {
        expect(accountFormSchema.safeParse(valid).success).toBe(true)
    })

    describe('name', () => {
        it('is required', () => {
            expect(errorFields({ name: '' })).toContain('name')
        })

        it('accepts 200 characters and fails above 200', () => {
            expect(errorFields({ name: 'n'.repeat(200) })).not.toContain('name')
            expect(errorFields({ name: 'n'.repeat(201) })).toContain('name')
        })
    })

    describe('number', () => {
        it.each(['1000', '1000.10', 'A-1', ''])('accepts %j', number => {
            expect(errorFields({ number })).not.toContain('number')
        })

        it.each(['10 00', '#1'])('fails on %j', number => {
            expect(errorFields({ number })).toContain('number')
        })

        it('accepts 20 characters and fails above 20', () => {
            expect(errorFields({ number: '1'.repeat(20) })).not.toContain('number')
            expect(errorFields({ number: '1'.repeat(21) })).toContain('number')
        })
    })

    describe('type and detail type', () => {
        it('requires a type', () => {
            expect(errorFields({ type: '', detail_type: '' })).toContain('type')
        })

        it('requires a detail type, with the error on detail_type', () => {
            const fields = errorFields({ type: 'bank', detail_type: '' })
            expect(fields).toContain('detail_type')
            expect(fields).not.toContain('type')
        })

        it('fails a detail type that belongs to another type, with the error on detail_type', () => {
            // accounts_payable is a real detail type, but of the accounts_payable type.
            const fields = errorFields({ type: 'bank', detail_type: 'accounts_payable' })
            expect(fields).toContain('detail_type')
        })

        it('fails a detail type that does not exist, with the error on detail_type', () => {
            expect(errorFields({ type: 'bank', detail_type: 'nonsense' })).toContain('detail_type')
        })
    })

    describe('unknown type', () => {
        it('rejects a type that is not an account type, with the error on type', () => {
            expect(errorFields({ type: 'foo', detail_type: 'x' })).toContain('type')
        })
    })

    describe('description', () => {
        it('accepts 1000 characters and fails above 1000', () => {
            expect(errorFields({ description: 'd'.repeat(1000) })).not.toContain('description')
            expect(errorFields({ description: 'd'.repeat(1001) })).toContain('description')
        })
    })

    describe('parent', () => {
        it('passes with a parent chosen', () => {
            expect(errorFields({ parent: 'acct_bank_0001' })).toEqual([])
        })

        it('passes with no parent, for a top-level account', () => {
            expect(errorFields({ parent: '' })).toEqual([])
        })
    })
})
