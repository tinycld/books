// The invoice's two notes: one the customer reads on the invoice, one only the team
// sees. The form (forms/hosts.ts), its checks and the read view use these words, so
// the label alone tells them apart. Pure data: the generator loads hosts.ts in Node.
export const INVOICE_NOTE_LABELS = {
    message: 'Message to customer (prints on invoice)',
    memo: 'Internal memo (not printed)',
} as const

export const INVOICE_NOTE_HINTS = {
    message: 'Shown on the invoice and PDF.',
    memo: 'Only your team sees this. Saved as the journal entry memo.',
} as const

export const INVOICE_NOTE_TOO_LONG = {
    message: 'The message to the customer is too long',
    memo: 'The internal memo is too long',
} as const
