import type { BooksLevel } from './access'

export type OrgRole = 'owner' | 'admin' | 'member' | 'guest'
export type CoreAccess = 'none' | 'readonly' | 'full'

export type LevelWrite =
    | { table: 'org_pkg_access'; op: 'insert'; access: CoreAccess }
    | { table: 'org_pkg_access'; op: 'update'; id: string; access: CoreAccess }
    | { table: 'books_admins'; op: 'insert' }
    | { table: 'books_admins'; op: 'delete'; id: string }

export const ACCESS_LEVELS: { value: BooksLevel; label: string; description: string }[] = [
    { value: 'none', label: 'None', description: 'Cannot open Books.' },
    {
        value: 'read_only',
        label: 'Read-only',
        description: 'Can see everything and change nothing.',
    },
    {
        value: 'bookkeeper',
        label: 'Bookkeeper',
        description: 'Can enter and post entries and manage accounts. Cannot change settings.',
    },
    {
        value: 'admin',
        label: 'Admin',
        description:
            'Everything a bookkeeper can do, plus settings, access, and close-date overrides.',
    },
]

export function levelDescription(level: BooksLevel): string {
    return ACCESS_LEVELS.find(l => l.value === level)?.description ?? ''
}

export function levelLabel(level: BooksLevel): string {
    return ACCESS_LEVELS.find(l => l.value === level)?.label ?? level
}

export function levelWrites(level: BooksLevel): { access: CoreAccess; adminRow: boolean } {
    if (level === 'none') return { access: 'none', adminRow: false }
    if (level === 'read_only') return { access: 'readonly', adminRow: false }
    return { access: 'full', adminRow: level === 'admin' }
}

const GRANT_LEVELS: BooksLevel[] = ['bookkeeper', 'admin']

export function accessRowControl(input: {
    viewerOrgRole: OrgRole
    viewerIsSelf: boolean
    targetOrgRole: OrgRole
    level: BooksLevel
}): { lockedText: string | null; options: BooksLevel[]; disabledText: string | null } {
    const { viewerOrgRole, viewerIsSelf, targetOrgRole, level } = input
    const locked = (lockedText: string) => ({ lockedText, options: [], disabledText: null })
    if (targetOrgRole === 'owner') return locked('Organization owner')
    if (targetOrgRole === 'admin') return locked('Organization admin')
    if (viewerIsSelf) return locked('You cannot change your own access.')
    if (viewerOrgRole === 'owner' || viewerOrgRole === 'admin') {
        return { lockedText: null, options: ACCESS_LEVELS.map(l => l.value), disabledText: null }
    }
    if (GRANT_LEVELS.includes(level)) {
        return { lockedText: null, options: GRANT_LEVELS, disabledText: null }
    }
    return {
        lockedText: null,
        options: [],
        disabledText: 'Ask an organization owner or admin to change this.',
    }
}

export function levelPlan(input: {
    userId: string
    level: BooksLevel
    targetOrgRole: OrgRole
    coreRow: { id: string; access: CoreAccess } | undefined
    adminRow: { id: string } | undefined
}): LevelWrite[] {
    const { level, targetOrgRole, coreRow, adminRow } = input
    const wanted = levelWrites(level)
    const writes: LevelWrite[] = []
    // An absent core row resolves to the books_access view's default.
    const current = coreRow?.access ?? (targetOrgRole === 'guest' ? 'none' : 'full')
    if (current !== wanted.access) {
        writes.push(
            coreRow
                ? { table: 'org_pkg_access', op: 'update', id: coreRow.id, access: wanted.access }
                : { table: 'org_pkg_access', op: 'insert', access: wanted.access }
        )
    }
    if (wanted.adminRow && !adminRow) writes.push({ table: 'books_admins', op: 'insert' })
    if (!wanted.adminRow && adminRow) {
        writes.push({ table: 'books_admins', op: 'delete', id: adminRow.id })
    }
    return writes
}

export function filterPeople<T extends { name: string; email: string }>(
    people: readonly T[],
    text: string
): T[] {
    const needle = text.trim().toLowerCase()
    if (!needle) return [...people]
    return people.filter(
        p => p.name.toLowerCase().includes(needle) || p.email.toLowerCase().includes(needle)
    )
}
