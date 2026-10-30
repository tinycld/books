import { z } from '@tinycld/core/ui/form'
import type { BooksDocSequences, BooksSettings } from '../types'
import { LASTS_FOR_OPTIONS, type LastsFor } from './overrides'
import { isIsoDay } from './register-range'

const emailCheck = z.email()

export const companySchema = z.object({
    business_name: z
        .string()
        .trim()
        .min(1, 'Enter the legal business name')
        .max(200, 'Use 200 characters or fewer'),
    tax_id: z.string().trim().max(20, 'Use 20 characters or fewer'),
    address: z.string().trim().max(500, 'Use 500 characters or fewer'),
    phone: z.string().trim().max(40, 'Use 40 characters or fewer'),
    email: z
        .string()
        .trim()
        .max(200, 'Use 200 characters or fewer')
        .refine(v => v === '' || emailCheck.safeParse(v).success, 'Enter a valid email address'),
    website: z
        .string()
        .trim()
        .max(200, 'Use 200 characters or fewer')
        .refine(
            v => v === '' || /^https?:\/\/\S+$/.test(v),
            'Enter a web address that starts with http:// or https://'
        ),
})

export type CompanyValues = z.infer<typeof companySchema>

export function companyValues(row: BooksSettings): CompanyValues {
    return {
        business_name: row.business_name ?? '',
        tax_id: row.tax_id ?? '',
        address: row.address ?? '',
        phone: row.phone ?? '',
        email: row.email ?? '',
        website: row.website ?? '',
    }
}

export const fiscalYearSchema = z.object({
    fiscal_year_start_month: z
        .number()
        .int('Choose a month')
        .min(1, 'Choose a month')
        .max(12, 'Choose a month'),
})

export type FiscalYearValues = { fiscal_year_start_month: number }

export const closeDateSchema = z
    .object({ closed: z.boolean(), close_date: z.string() })
    .superRefine((values, ctx) => {
        if (values.closed && !isIsoDay(values.close_date)) {
            ctx.addIssue({
                code: 'custom',
                path: ['close_date'],
                message: 'Enter a real date as YYYY-MM-DD',
            })
        }
    })

export type CloseDateValues = { closed: boolean; close_date: string }

export function closeDateValue(values: CloseDateValues): string {
    return values.closed ? values.close_date : ''
}

export function closeDateValues(row: BooksSettings): CloseDateValues {
    const close_date = row.close_date ?? ''
    return { closed: close_date !== '', close_date }
}

export function isReopening(current: string, next: CloseDateValues): boolean {
    if (current === '') return false
    return !next.closed || next.close_date < current
}

const lastsValues = LASTS_FOR_OPTIONS.map(o => o.value) as [LastsFor, ...LastsFor[]]

export const overrideSchema = z.object({
    user: z.string().min(1, 'Choose a person'),
    reason: z
        .string()
        .trim()
        .min(3, 'Enter a reason of at least 3 characters')
        .max(500, 'Use 500 characters or fewer'),
    lasts: z.enum(lastsValues, 'Choose how long the override lasts'),
})

export type OverrideValues = { user: string; reason: string; lasts: LastsFor }

export const sequenceSchema = z.object({
    prefix: z
        .string()
        .max(10, 'Use 10 characters or fewer')
        .regex(/^[A-Za-z0-9-]*$/, 'Use letters, digits, and hyphens only'),
    next_number: z
        .string()
        .regex(/^\d+$/, 'Enter a whole number')
        .refine(
            v => Number(v) >= 1 && Number(v) <= 999999999,
            'Enter a number from 1 to 999999999'
        ),
})

export type SequenceValues = { prefix: string; next_number: string }

export function sequenceValues(row: BooksDocSequences): SequenceValues {
    return { prefix: row.prefix ?? '', next_number: String(row.next_number) }
}

export function sequenceUpdate(values: SequenceValues): { prefix: string; next_number: number } {
    return { prefix: values.prefix, next_number: Number(values.next_number) }
}
