import { z } from '@tinycld/core/ui/form'
import { parseRatePercent } from './sales-tax'
import {
    AGENCY_ACCOUNT_REQUIRED,
    NAME_REQUIRED,
    NAME_TOO_LONG,
    RATE_AGENCY_REQUIRED,
    RATE_INVALID,
} from './tax-messages'

// The sales tax dialogs' rules. The server checks them again (and the unique names),
// so these only spare a round trip.

export const nameSchema = z.string().trim().min(1, NAME_REQUIRED).max(200, NAME_TOO_LONG)

export const agencySchema = z.object({
    name: nameSchema,
    account: z.string().min(1, AGENCY_ACCOUNT_REQUIRED),
})

// The rate stays text in the form, so "8.875" is never a float; the save parses it.
export const rateSchema = z.object({
    name: nameSchema,
    rate: z.string().refine(text => parseRatePercent(text) !== null, RATE_INVALID),
    agency: z.string().min(1, RATE_AGENCY_REQUIRED),
})

export type AgencyValues = z.infer<typeof agencySchema>
export type RateValues = z.infer<typeof rateSchema>
