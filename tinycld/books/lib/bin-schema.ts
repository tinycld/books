import { z } from '@tinycld/core/ui/form'

// The bin dialog's one schema (inventory-adjust spec §3.7): Name required and at most 100
// characters, Note at most 500 (the bounds of books_bins, migration 2100000049), Inactive
// on an edit only. The server checks that the name is unique without regard to case; its
// refusal lands on Name through handleMutationErrorsWithForm.

export const BIN_FORM_TEXTS = {
    nameRequired: 'Enter a name.',
    nameTooLong: 'A name has at most 100 characters.',
    noteTooLong: 'A note has at most 500 characters.',
} as const

export const BIN_NAME_MAX = 100
export const BIN_NOTE_MAX = 500

export const binSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, BIN_FORM_TEXTS.nameRequired)
        .max(BIN_NAME_MAX, BIN_FORM_TEXTS.nameTooLong),
    note: z.string().trim().max(BIN_NOTE_MAX, BIN_FORM_TEXTS.noteTooLong),
    // The dialog draws Inactive on an edit only, so a new bin's values have none.
    inactive: z.boolean().optional(),
})

export type BinValues = z.infer<typeof binSchema>
