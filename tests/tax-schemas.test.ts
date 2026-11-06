import { describe, expect, it } from 'vitest'
import { agencySchema, rateSchema } from '../tinycld/books/lib/tax-schemas'

type Parsed =
    | { success: true }
    | {
          success: false
          error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }
      }

// The messages the schema gives one field, in order; none when the values pass.
function messagesOn(result: Parsed, field: string) {
    if (result.success) return []
    return result.error.issues.filter(issue => issue.path[0] === field).map(issue => issue.message)
}

const agency = { name: 'Colorado Department of Revenue', account: 'acc-2200' }
const rate = { name: 'Denver lodging', rate: '8.875', agency: 'taxagdenver0001' }

describe('agencySchema', () => {
    it('trims the name', () => {
        expect(
            agencySchema.parse({ ...agency, name: '  Colorado Department of Revenue  ' })
        ).toEqual(agency)
    })

    it.each(['', '   '])('refuses the name %j with "Enter a name."', name => {
        expect(messagesOn(agencySchema.safeParse({ ...agency, name }), 'name')).toEqual([
            'Enter a name.',
        ])
    })

    it('refuses a 201-character name and accepts a 200-character one', () => {
        expect(
            messagesOn(agencySchema.safeParse({ ...agency, name: 'a'.repeat(201) }), 'name')
        ).toEqual(['A name has at most 200 characters.'])
        expect(agencySchema.safeParse({ ...agency, name: 'a'.repeat(200) }).success).toBe(true)
    })

    it('refuses an empty account with "Choose a liability account."', () => {
        expect(messagesOn(agencySchema.safeParse({ ...agency, account: '' }), 'account')).toEqual([
            'Choose a liability account.',
        ])
    })
})

describe('rateSchema', () => {
    it.each(['8.875', '0', '100'])('accepts the rate %j', text => {
        const result = rateSchema.safeParse({ ...rate, rate: text })
        expect(messagesOn(result, 'rate')).toEqual([])
        expect(result.success).toBe(true)
    })

    it.each([
        '8.88888',
        '100.01',
        '-1',
        'abc',
        '',
    ])('refuses the rate %j with the rate message', text => {
        expect(messagesOn(rateSchema.safeParse({ ...rate, rate: text }), 'rate')).toEqual([
            'Enter a rate from 0 to 100 with at most four decimals.',
        ])
    })

    it('refuses an empty agency with "Choose an agency."', () => {
        expect(messagesOn(rateSchema.safeParse({ ...rate, agency: '' }), 'agency')).toEqual([
            'Choose an agency.',
        ])
    })

    it('trims the name and refuses a blank one', () => {
        expect(rateSchema.parse({ ...rate, name: ' Denver lodging ' }).name).toBe('Denver lodging')
        expect(messagesOn(rateSchema.safeParse({ ...rate, name: '  ' }), 'name')).toEqual([
            'Enter a name.',
        ])
    })
})
