import { z } from '@tinycld/core/ui/form'
import { addressPartsSchema } from './address'

// The local forms behind the Books host components (components/forms). They mirror the
// address part limit server/address.go enforces and the phone limit the migrations
// enforce; email and URL format stay server rules, so the server remains the authority.

// The server's limit for phone and mobile.
export const PHONE_MAX_LENGTH = 40

export function contactValueSchema(maxLength?: number) {
    const text = maxLength === undefined ? z.string() : z.string().max(maxLength)
    return z.object({ text })
}

// A select's chosen option value; '' is the "None" option.
export const selectValueSchema = z.object({ value: z.string() })

// The shipping address parts plus the "Same as billing address" toggle.
export const shippingValueSchema = addressPartsSchema.extend({ same: z.boolean() })

// The money input's typed text. It has no rules of its own: the engine shows the
// amount's messages through MONEY_VALUE_SCHEMA (lib/money-input.ts).
export const moneyTextSchema = z.object({ text: z.string() })
