import { z } from '@tinycld/core/ui/form'
import { amountError } from './opening-balances'
import { closedThroughMessage } from './opening-balances-messages'
import { isIsoDay } from './register-range'

export const openingPresets = ['last-fiscal-year', 'last-month', 'custom'] as const
export type OpeningPreset = (typeof openingPresets)[number]

const openingShape = z.object({
    preset: z.enum(openingPresets),
    date: z.string().refine(isIsoDay, 'Enter a real date as YYYY-MM-DD'),
    memo: z.string().max(4000, 'Use 4000 characters or fewer'),
    amounts: z.record(z.string(), z.string()),
})

export type OpeningFormValues = z.infer<typeof openingShape>

// hasOverride: the person has an active close-date override (useMyCloseOverride), so the
// server posts their entry into a closed period. The server stays the authority: an
// override that ends before the post gives the server's refusal.
export function openingFormSchema(closeDate: string, hasOverride = false) {
    return openingShape
        .superRefine((values, ctx) => {
            if (hasOverride) return
            // ISO day strings compare in date order.
            if (closeDate === '' || !isIsoDay(values.date) || values.date > closeDate) return
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
