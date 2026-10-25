import { describe, expect, it } from 'vitest'
import { setupSchema } from '../tinycld/books/lib/setup-schema'

const valid = { business_name: 'Acme', fiscal_year_start_month: 1, ownership: 'owners' }

function errorFields(overrides: Record<string, unknown>) {
    const result = setupSchema.safeParse({ ...valid, ...overrides })
    if (result.success) return []
    return result.error.issues.map(issue => String(issue.path[0]))
}

describe('setupSchema', () => {
    it('accepts a complete valid form', () => {
        expect(setupSchema.safeParse(valid).success).toBe(true)
    })

    it('rejects a blank or whitespace-only business name', () => {
        expect(errorFields({ business_name: '' })).toContain('business_name')
        expect(errorFields({ business_name: '   ' })).toContain('business_name')
    })

    it('rejects 201 characters and accepts 200', () => {
        expect(errorFields({ business_name: 'n'.repeat(201) })).toContain('business_name')
        expect(errorFields({ business_name: 'n'.repeat(200) })).not.toContain('business_name')
    })

    it('rejects months 0, 13 and 1.5 and accepts 1 and 12', () => {
        for (const month of [0, 13, 1.5]) {
            expect(errorFields({ fiscal_year_start_month: month })).toContain(
                'fiscal_year_start_month'
            )
        }
        for (const month of [1, 12]) {
            expect(errorFields({ fiscal_year_start_month: month })).not.toContain(
                'fiscal_year_start_month'
            )
        }
    })

    it('rejects a missing or unknown ownership with a message', () => {
        for (const ownership of [undefined, 'trust']) {
            const result = setupSchema.safeParse({ ...valid, ownership })
            expect(result.success).toBe(false)
            const issue = result.error?.issues.find(item => item.path[0] === 'ownership')
            expect(issue?.message.length).toBeGreaterThan(0)
        }
    })

    it('trims the business name', () => {
        const result = setupSchema.parse({ ...valid, business_name: '  Acme  ' })
        expect(result.business_name).toBe('Acme')
    })
})
