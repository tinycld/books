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
