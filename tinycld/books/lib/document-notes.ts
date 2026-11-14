// A sales document's two notes: one the customer reads on the document, one only the
// team sees. Every kind's form (forms/hosts.ts), its checks and the read view use these
// words, so the label alone tells them apart. Pure data: the generator loads hosts.ts in
// Node, and hosts.ts reads these through this module.
export const DOCUMENT_NOTE_LABELS = {
    message: 'Message to customer (printed)',
    memo: 'Internal memo (not printed)',
} as const

// A kind with no message to the customer (a bill prints nothing) has only the memo, so
// its label needs no "not printed" to tell the two notes apart.
export const MEMO_ONLY_LABEL = 'Memo'

// The memo's label for a kind: the sales kinds' "Internal memo (not printed)" beside their
// message, plain "Memo" on a kind without one.
export function memoLabelFor(features: { message: boolean }): string {
    return features.message ? DOCUMENT_NOTE_LABELS.memo : MEMO_ONLY_LABEL
}

export const DOCUMENT_NOTE_TOO_LONG = {
    message: 'The message to the customer is too long',
    memo: 'The internal memo is too long',
} as const
