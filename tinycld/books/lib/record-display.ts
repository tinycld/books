// The title over an open record: a writer sees what the save will do; a read-only user
// sees only what the record is.
export function recordTitle(
    noun: string,
    { mode, canWrite }: { mode: 'new' | 'edit'; canWrite: boolean }
): string {
    if (!canWrite) return `${noun.charAt(0).toUpperCase()}${noun.slice(1)}`
    if (mode === 'edit') return `Edit ${noun}`
    return `New ${noun}`
}

// The footer buttons: a writer gets Cancel and Save (and Save and new on a new
// record); a read-only user gets only Close.
export function recordFooter({ mode, canWrite }: { mode: 'new' | 'edit'; canWrite: boolean }) {
    return {
        cancel: canWrite,
        save: canWrite,
        saveAndNew: canWrite && mode === 'new',
        close: !canWrite,
    }
}
