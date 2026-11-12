// A sales document's two notes: one the customer reads on the document, one only the
// team sees. Every kind's form (forms/hosts.ts), its checks and the read view use these
// words, so the label alone tells them apart. Pure data: the generator loads hosts.ts in
// Node, and hosts.ts reads these through this module.
export const DOCUMENT_NOTE_LABELS = {
    message: 'Message to customer (printed)',
    memo: 'Internal memo (not printed)',
} as const

export const DOCUMENT_NOTE_TOO_LONG = {
    message: 'The message to the customer is too long',
    memo: 'The internal memo is too long',
} as const
