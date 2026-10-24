export type RegisterViewState =
    | 'loading'
    | 'error'
    | 'not-found'
    | 'empty'
    | 'empty-range'
    | 'ready'

export function registerViewState(input: {
    isReady: boolean
    isError: boolean
    hasAccount: boolean
    hasRows: boolean
    hasAnyActivity: boolean
}): RegisterViewState {
    if (input.isError) return 'error'
    if (!input.isReady) return 'loading'
    if (!input.hasAccount) return 'not-found'
    if (input.hasRows) return 'ready'
    return input.hasAnyActivity ? 'empty-range' : 'empty'
}

export function newEntryVisible(input: { canWrite: boolean; isAvailable: boolean }): boolean {
    return input.canWrite && input.isAvailable
}
