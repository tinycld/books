import { z } from '@tinycld/core/ui/form'

// The same bound as the books_customers `notes` column (max 5000).
export const customerNotesSchema = z.object({
    notes: z.string().max(5000, 'Notes can be at most 5000 characters'),
})

export type CustomerNotesValues = z.infer<typeof customerNotesSchema>
