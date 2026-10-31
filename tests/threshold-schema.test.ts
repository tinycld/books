import type { z } from '@tinycld/core/ui/form'
import { describe, expect, it } from 'vitest'
import {
    THRESHOLD_MESSAGES,
    type ThresholdValues,
    thresholdCents,
    thresholdSchema,
    thresholdValues,
} from '../tinycld/books/lib/threshold-schema'

function messages(text: string) {
    const result = thresholdSchema('USD').safeParse({ threshold_1099: text })
    if (result.success) return []
    return result.error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
    }))
}

function parsed(text: string) {
    return thresholdSchema('USD').parse({ threshold_1099: text })
}

describe('THRESHOLD_MESSAGES', () => {
    it('holds the three refusal texts', () => {
        expect(THRESHOLD_MESSAGES).toEqual({
            malformed: 'Enter an amount, like 2,000.00',
            negative: 'The threshold cannot be negative',
            tooLarge: 'Use a smaller amount',
        })
    })
})

describe('thresholdSchema', () => {
    it.each(['', 'abc', '1,00.00', '2.000'])('refuses %j as malformed', text => {
        expect(messages(text)).toEqual([
            { path: 'threshold_1099', message: 'Enter an amount, like 2,000.00' },
        ])
    })

    it.each(['-5', '-$1.00'])('refuses %j as negative', text => {
        expect(messages(text)).toEqual([
            { path: 'threshold_1099', message: 'The threshold cannot be negative' },
        ])
    })

    it('refuses one cent above maxStoredAmount and accepts maxStoredAmount', () => {
        expect(messages('90,071,992,547,409.92')).toEqual([
            { path: 'threshold_1099', message: 'Use a smaller amount' },
        ])
        expect(parsed('90,071,992,547,409.91')).toEqual({
            threshold_1099: '90,071,992,547,409.91',
        })
    })

    it.each(['2000', '2,000', '$2,000.00', ' 2000.0 '])('keeps %j as canonical text', text => {
        expect(parsed(text)).toEqual({ threshold_1099: '2,000.00' })
    })

    it('keeps zero as 0.00', () => {
        expect(parsed('0')).toEqual({ threshold_1099: '0.00' })
    })

    // tsc refuses this when the schema's output type differs from its input type, which
    // useSettingsForm needs (it resets the form from the parsed values).
    it('has the same input and output type', () => {
        const ok: z.ZodType<ThresholdValues, ThresholdValues> = thresholdSchema('USD')
        expect(ok.parse({ threshold_1099: '2000' })).toEqual({ threshold_1099: '2,000.00' })
    })
})

describe('thresholdCents', () => {
    it('turns checked text into integer cents', () => {
        expect(thresholdCents('2,000.00', 'USD')).toBe(200000)
    })

    it('throws on text the schema refuses', () => {
        expect(() => thresholdCents('abc', 'USD')).toThrow()
    })
})

describe('thresholdValues', () => {
    it('prints the stored cents as the form text', () => {
        expect(thresholdValues({ threshold_1099: 123450 })).toEqual({ threshold_1099: '1,234.50' })
    })
})
