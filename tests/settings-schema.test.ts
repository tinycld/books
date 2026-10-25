import { describe, expect, it } from 'vitest'
import {
    closeDateSchema,
    closeDateValue,
    companySchema,
    fiscalYearSchema,
    isReopening,
    overrideSchema,
    sequenceSchema,
    sequenceUpdate,
} from '../tinycld/books/lib/settings-schema'

const company = {
    business_name: 'Acme',
    tax_id: '',
    address: '',
    phone: '',
    email: '',
    website: '',
}

function companyIssues(overrides: Record<string, unknown>) {
    const result = companySchema.safeParse({ ...company, ...overrides })
    return result.success ? [] : result.error.issues
}

function failsOn(field: string, value: string) {
    const issues = companyIssues({ [field]: value }).filter(i => i.path[0] === field)
    if (issues.length === 0) return false
    return issues.every(i => i.message.length > 0)
}

function passesOn(field: string, value: string) {
    return companyIssues({ [field]: value }).filter(i => i.path[0] === field).length === 0
}

describe('companySchema output', () => {
    it('carries only company fields, never setup_started', () => {
        const parsed = companySchema.parse({ ...company, setup_started: true })
        expect(Object.keys(parsed).sort()).toEqual(Object.keys(company).sort())
    })
})

describe('companySchema', () => {
    it('rejects a blank or whitespace-only name, bounds it at 200, and trims it', () => {
        expect(failsOn('business_name', '')).toBe(true)
        expect(failsOn('business_name', '   ')).toBe(true)
        expect(failsOn('business_name', 'n'.repeat(201))).toBe(true)
        expect(passesOn('business_name', 'n'.repeat(200))).toBe(true)
        const parsed = companySchema.parse({ ...company, business_name: '  Acme  ' })
        expect(parsed.business_name).toBe('Acme')
    })

    it.each([
        'tax_id',
        'address',
        'phone',
    ] as const)('trims %s and turns a whitespace-only value into an empty string', field => {
        expect(companySchema.parse({ ...company, [field]: '  12-3456789  ' })[field]).toBe(
            '12-3456789'
        )
        expect(companySchema.parse({ ...company, [field]: '   ' })[field]).toBe('')
    })

    it('trims email and website before checking them, and keeps the existing messages', () => {
        const parsed = companySchema.parse({
            ...company,
            email: '  a@b.co  ',
            website: '  https://acme.test  ',
        })
        expect(parsed.email).toBe('a@b.co')
        expect(parsed.website).toBe('https://acme.test')
        expect(companySchema.parse({ ...company, email: '   ', website: '   ' }).email).toBe('')
        const bad = companySchema.safeParse({ ...company, email: ' nope ', website: ' ftp://x ' })
        const messages = bad.success ? [] : bad.error.issues.map(i => i.message)
        expect(messages).toContain('Enter a valid email address')
        expect(messages).toContain('Enter a web address that starts with http:// or https://')
    })

    it('bounds tax id, address and phone', () => {
        expect(failsOn('tax_id', 't'.repeat(21))).toBe(true)
        expect(passesOn('tax_id', 't'.repeat(20))).toBe(true)
        expect(failsOn('address', 'a'.repeat(501))).toBe(true)
        expect(passesOn('address', 'a'.repeat(500))).toBe(true)
        expect(failsOn('phone', '1'.repeat(41))).toBe(true)
        expect(passesOn('phone', '1'.repeat(40))).toBe(true)
    })

    it('accepts an empty or valid email and rejects the rest', () => {
        expect(passesOn('email', '')).toBe(true)
        expect(passesOn('email', 'a@b.co')).toBe(true)
        expect(failsOn('email', 'not-an-email')).toBe(true)
        expect(failsOn('email', `${'a'.repeat(196)}@b.co`)).toBe(true)
    })

    it('accepts an empty or http(s) website and rejects the rest', () => {
        expect(passesOn('website', '')).toBe(true)
        expect(passesOn('website', 'http://a.example')).toBe(true)
        expect(passesOn('website', 'https://a.example/x')).toBe(true)
        expect(failsOn('website', 'ftp://a.example')).toBe(true)
        expect(failsOn('website', 'a.example')).toBe(true)
        expect(failsOn('website', `https://${'a'.repeat(200)}`)).toBe(true)
    })
})

describe('fiscalYearSchema', () => {
    const ok = (month: number) =>
        fiscalYearSchema.safeParse({ fiscal_year_start_month: month }).success

    it('accepts months 1 and 12 and rejects 0, 13 and 1.5', () => {
        expect(ok(1)).toBe(true)
        expect(ok(12)).toBe(true)
        expect(ok(0)).toBe(false)
        expect(ok(13)).toBe(false)
        expect(ok(1.5)).toBe(false)
    })
})

describe('closeDateSchema', () => {
    const ok = (closed: boolean, close_date: string) =>
        closeDateSchema.safeParse({ closed, close_date }).success

    it('requires a real YYYY-MM-DD day only when closed', () => {
        expect(ok(false, '')).toBe(true)
        expect(ok(true, '2026-02-28')).toBe(true)
        expect(ok(true, '')).toBe(false)
        expect(ok(true, '2026-02-30')).toBe(false)
        expect(ok(true, '2026-13-01')).toBe(false)
        expect(ok(true, '26-02-28')).toBe(false)
        expect(ok(true, '2026-2-8')).toBe(false)
    })

    it('saves an empty close date when not closed', () => {
        expect(closeDateValue({ closed: false, close_date: '2026-02-28' })).toBe('')
        expect(closeDateValue({ closed: true, close_date: '2026-02-28' })).toBe('2026-02-28')
    })
})

describe('isReopening', () => {
    it('is true for an earlier date or no longer closed', () => {
        expect(isReopening('2026-09-30', { closed: true, close_date: '2026-09-29' })).toBe(true)
        expect(isReopening('2026-09-30', { closed: false, close_date: '' })).toBe(true)
    })

    it('is false for the same date, a later date, or an empty current date', () => {
        expect(isReopening('2026-09-30', { closed: true, close_date: '2026-09-30' })).toBe(false)
        expect(isReopening('2026-09-30', { closed: true, close_date: '2026-10-01' })).toBe(false)
        expect(isReopening('', { closed: false, close_date: '' })).toBe(false)
        expect(isReopening('', { closed: true, close_date: '2026-01-01' })).toBe(false)
    })
})

describe('overrideSchema', () => {
    const base = { user: 'u1', reason: 'Year-end', lasts: '24h' }
    const result = (overrides: Record<string, unknown>) =>
        overrideSchema.safeParse({ ...base, ...overrides })

    it('requires a user', () => {
        const r = result({ user: '' })
        expect(r.success).toBe(false)
        expect(r.error?.issues[0].message.length).toBeGreaterThan(0)
    })

    it('bounds the reason at 3 to 500 and trims it', () => {
        expect(result({ reason: 'ab' }).success).toBe(false)
        expect(result({ reason: 'r'.repeat(501) }).success).toBe(false)
        expect(result({ reason: 'abc' }).success).toBe(true)
        expect(result({ reason: 'r'.repeat(500) }).success).toBe(true)
        expect(result({ reason: '  abc  ' }).data?.reason).toBe('abc')
        expect(result({ reason: ' a ' }).success).toBe(false)
    })

    it('rejects a lasts outside the presets', () => {
        expect(result({ lasts: '7d' }).success).toBe(true)
        expect(result({ lasts: '30d' }).success).toBe(true)
        expect(result({ lasts: '1h' }).success).toBe(false)
    })
})

describe('sequenceSchema', () => {
    const ok = (prefix: string, next_number: string) =>
        sequenceSchema.safeParse({ prefix, next_number }).success

    it('accepts empty, hyphen, alphanumeric and 10 character prefixes only', () => {
        expect(ok('', '1')).toBe(true)
        expect(ok('JE-', '1')).toBe(true)
        expect(ok('AB12', '1')).toBe(true)
        expect(ok('A'.repeat(10), '1')).toBe(true)
        expect(ok('A'.repeat(11), '1')).toBe(false)
        expect(ok('A_1', '1')).toBe(false)
        expect(ok('A 1', '1')).toBe(false)
    })

    it('accepts whole numbers 1 to 999999999 only', () => {
        expect(ok('', '1')).toBe(true)
        expect(ok('', '999999999')).toBe(true)
        for (const bad of ['0', '1000000000', '1.5', '-3', '']) {
            expect(ok('', bad)).toBe(false)
        }
    })

    it('turns the number text into a number', () => {
        expect(sequenceUpdate({ prefix: 'JE-', next_number: '1001' })).toEqual({
            prefix: 'JE-',
            next_number: 1001,
        })
    })
})
