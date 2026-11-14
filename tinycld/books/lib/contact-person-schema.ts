import { z } from '@tinycld/core/ui/form'

// The same bounds as the books_party_contacts columns (name 200, role 100, phone 40;
// email is an email field that may be empty).
export const contactPersonSchema = z.object({
    name: z.string().trim().min(1, 'Enter a name').max(200, 'A name can be at most 200 characters'),
    role: z.string().trim().max(100, 'A role can be at most 100 characters'),
    email: z.union([z.literal(''), z.string().trim().email('Enter a valid email address')]),
    phone: z.string().trim().max(40, 'A phone number can be at most 40 characters'),
    is_primary: z.boolean(),
})

export type ContactPersonValues = z.infer<typeof contactPersonSchema>
