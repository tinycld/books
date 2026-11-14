// A refused atomic() write rolls the whole batch back and names the one operation the
// server refused (pbtsdb's BatchMutationError). Its `response` is that operation's own
// error body, where a single request's error keeps it, so the refusal helpers read both.

// The id of the record whose operation was refused; null for any other failure.
export function refusedRecordId(error: unknown): string | null {
    if (typeof error !== 'object' || error === null) return null
    if (!('name' in error) || error.name !== 'BatchMutationError') return null
    return 'recordId' in error && typeof error.recordId === 'string' ? error.recordId : null
}
