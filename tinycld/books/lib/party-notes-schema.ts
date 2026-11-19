import { z } from '@tinycld/core/ui/form'

// The same bound as the `notes` column of books_customers and books_vendors (max 5000).
export const partyNotesSchema = z.object({
    notes: z.string().max(5000, 'Notes can be at most 5000 characters'),
})

export type PartyNotesValues = z.infer<typeof partyNotesSchema>
