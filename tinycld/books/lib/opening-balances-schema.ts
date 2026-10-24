import { z } from '@tinycld/core/ui/form'
import { amountError, isRealDay } from './opening-balances'
import { closedThroughMessage } from './opening-balances-messages'

export const openingPresets = ['last-fiscal-year', 'last-month', 'custom'] as const
export type OpeningPreset = (typeof openingPresets)[number]

const openingShape = z.object({
    preset: z.enum(openingPresets),
    date: z.string().refine(isRealDay, 'Enter a real date as YYYY-MM-DD'),
    memo: z.string().max(4000, 'Use 4000 characters or fewer'),
    amounts: z.record(z.string(), z.string()),
})

export type OpeningFormValues = z.infer<typeof openingShape>

export function openingFormSchema(closeDate: string) {
    return openingShape
        .superRefine((values, ctx) => {
            // ISO day strings compare in date order.
            if (closeDate === '' || !isRealDay(values.date) || values.date > closeDate) return
            ctx.addIssue({
                code: 'custom',
                path: ['date'],
                message: closedThroughMessage(closeDate),
            })
        })
        .superRefine((values, ctx) => {
            for (const [accountId, text] of Object.entries(values.amounts)) {
                const message = amountError(text)
                if (message === null) continue
                ctx.addIssue({ code: 'custom', path: ['amounts', accountId], message })
            }
        })
}
