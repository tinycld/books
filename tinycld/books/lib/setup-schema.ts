import { z } from '@tinycld/core/ui/form'
import { COSTING_METHOD_KEYS } from './costing-method'

export const FISCAL_MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
]

export const setupSchema = z.object({
    business_name: z
        .string()
        .trim()
        .min(1, 'Enter the legal business name')
        .max(200, 'Use 200 characters or fewer'),
    fiscal_year_start_month: z
        .number()
        .int('Choose a month')
        .min(1, 'Choose a month')
        .max(12, 'Choose a month'),
    ownership: z.enum(['owners', 'corporation'], { message: 'Choose how the business is owned' }),
    costing_method: z.enum(COSTING_METHOD_KEYS, { message: 'Choose a costing method' }),
})

export type SetupValues = z.infer<typeof setupSchema>
