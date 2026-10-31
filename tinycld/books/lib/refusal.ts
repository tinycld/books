import { errorToString } from '@tinycld/core/lib/errors'

// A refusal for a rule that belongs to no field (depth, inactive parent) comes
// with a message and an empty field map.
export function messageOnlyRefusal(error: unknown): string | null {
    const response = (error as { response?: { message?: unknown; data?: unknown } } | null)
        ?.response
    if (!response || typeof response.message !== 'string' || response.message === '') return null
    const data = response.data
    const hasFields = typeof data === 'object' && data !== null && Object.keys(data).length > 0
    return hasFields ? null : response.message
}

export function errorStatus(error: unknown): number | undefined {
    if (typeof error !== 'object' || error === null || !('status' in error)) return undefined
    return typeof error.status === 'number' ? error.status : undefined
}

// A write that got no answer from the server (status 0): one fixed message in place of the
// browser's raw fetch error. It does not read the live connectivity state, so it stays
// the same on every render while it shows.
export const SERVER_UNREACHED = "Your change wasn't saved: the server could not be reached."

export function writeRefusalText(error: unknown): string {
    if (errorStatus(error) === 0) return SERVER_UNREACHED
    return messageOnlyRefusal(error) ?? errorToString(error)
}
