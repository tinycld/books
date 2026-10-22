export type BooksLevel = 'none' | 'read_only' | 'bookkeeper' | 'admin'

export interface BooksAccessState {
    level: BooksLevel
    canRead: boolean
    canWrite: boolean
    isAdmin: boolean
    // False until the caller's books_access row has loaded. Until then the
    // level is 'none', so a screen never offers a write the server refuses.
    isReady: boolean
}

const LEVELS: readonly BooksLevel[] = ['none', 'read_only', 'bookkeeper', 'admin']

function toLevel(value: string | undefined): BooksLevel {
    return LEVELS.find(level => level === value) ?? 'none'
}

export function accessFromRow(
    row: { level?: string } | undefined,
    isReady: boolean
): BooksAccessState {
    const level = isReady ? toLevel(row?.level) : 'none'
    return {
        level,
        canRead: level !== 'none',
        canWrite: level === 'bookkeeper' || level === 'admin',
        isAdmin: level === 'admin',
        isReady,
    }
}
