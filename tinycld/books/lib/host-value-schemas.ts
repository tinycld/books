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

// The shipping address parts plus the "Same as billing address" toggle.
export const shippingValueSchema = addressPartsSchema.extend({ same: z.boolean() })
