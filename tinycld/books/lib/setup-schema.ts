import { z } from '@tinycld/core/ui/form'

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
})

export type SetupValues = z.infer<typeof setupSchema>
