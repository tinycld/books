// The state of a write control of the bank queue and the drawer: disabled while a change
// runs or while the server cannot take writes; the hint says why only in the second case.
// Its own module so bank-review.ts and bank-match.ts both import it with no cycle between
// them.
export type WriteControlState = { isDisabled: boolean; hint: string | undefined }

export function writeControlState(input: {
    isPending: boolean
    writesDisabled: boolean
    writesHint: string | undefined
}): WriteControlState {
    return {
        isDisabled: input.isPending || input.writesDisabled,
        hint: input.writesDisabled ? input.writesHint : undefined,
    }
}
