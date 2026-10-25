import { describe, expect, it } from 'vitest'
import {
    ACCESS_LEVELS,
    accessRowControl,
    filterPeople,
    levelPlan,
    levelWrites,
} from '../tinycld/books/lib/access-levels'

describe('ACCESS_LEVELS', () => {
    it('lists the four levels in order with their descriptions', () => {
        expect(ACCESS_LEVELS.map(l => l.value)).toEqual([
            'none',
            'read_only',
            'bookkeeper',
            'admin',
        ])
        expect(ACCESS_LEVELS.map(l => l.description)).toEqual([
            'Cannot open Books.',
            'Can see everything and change nothing.',
            'Can enter and post entries and manage accounts. Cannot change settings.',
            'Everything a bookkeeper can do, plus settings, access, and close-date overrides.',
        ])
    })
})

describe('levelWrites', () => {
    it('maps each level to a core access and an admin row', () => {
        expect(levelWrites('none')).toEqual({ access: 'none', adminRow: false })
        expect(levelWrites('read_only')).toEqual({ access: 'readonly', adminRow: false })
        expect(levelWrites('bookkeeper')).toEqual({ access: 'full', adminRow: false })
        expect(levelWrites('admin')).toEqual({ access: 'full', adminRow: true })
    })
})

describe('accessRowControl', () => {
    const base = {
        viewerOrgRole: 'owner',
        viewerIsSelf: false,
        targetOrgRole: 'member',
        level: 'bookkeeper',
    } as const
    const ALL = ['none', 'read_only', 'bookkeeper', 'admin']

    it('locks an org owner or admin target, even on the viewer own row', () => {
        const owner = accessRowControl({ ...base, targetOrgRole: 'owner', viewerIsSelf: true })
        expect(owner).toEqual({ lockedText: 'Organization owner', options: [], disabledText: null })
        const admin = accessRowControl({ ...base, targetOrgRole: 'admin' })
        expect(admin).toEqual({ lockedText: 'Organization admin', options: [], disabledText: null })
    })

    it('locks the viewer own row', () => {
        expect(accessRowControl({ ...base, viewerIsSelf: true })).toEqual({
            lockedText: 'You cannot change your own access.',
            options: [],
            disabledText: null,
        })
    })

    it('gives an org owner or admin viewer all four levels', () => {
        for (const viewerOrgRole of ['owner', 'admin'] as const) {
            expect(accessRowControl({ ...base, viewerOrgRole })).toEqual({
                lockedText: null,
                options: ALL,
                disabledText: null,
            })
        }
    })

    it('limits a Books admin by grant to bookkeeper and admin', () => {
        const viewer = { ...base, viewerOrgRole: 'member' } as const
        for (const level of ['bookkeeper', 'admin'] as const) {
            expect(accessRowControl({ ...viewer, level })).toEqual({
                lockedText: null,
                options: ['bookkeeper', 'admin'],
                disabledText: null,
            })
        }
        for (const level of ['none', 'read_only'] as const) {
            expect(accessRowControl({ ...viewer, level })).toEqual({
                lockedText: null,
                options: [],
                disabledText: 'Ask an organization owner or admin to change this.',
            })
        }
    })
})

describe('levelPlan', () => {
    const u = 'user1'
    const plan = (
        level: 'none' | 'read_only' | 'bookkeeper' | 'admin',
        targetOrgRole: 'owner' | 'admin' | 'member' | 'guest',
        coreRow: { id: string; access: 'none' | 'readonly' | 'full' } | undefined,
        adminRow: { id: string } | undefined
    ) => levelPlan({ userId: u, level, targetOrgRole, coreRow, adminRow })

    it('inserts a none core row for a member with no core row', () => {
        expect(plan('none', 'member', undefined, undefined)).toEqual([
            { table: 'org_pkg_access', op: 'insert', access: 'none' },
        ])
    })

    it('updates the core row to readonly', () => {
        expect(plan('read_only', 'member', { id: 'c1', access: 'full' }, undefined)).toEqual([
            { table: 'org_pkg_access', op: 'update', id: 'c1', access: 'readonly' },
        ])
    })

    it('bookkeeper deletes only the admin row', () => {
        expect(plan('bookkeeper', 'member', { id: 'c1', access: 'full' }, { id: 'a1' })).toEqual([
            { table: 'books_admins', op: 'delete', id: 'a1' },
        ])
    })

    it('admin inserts only the admin row when core is already full', () => {
        expect(plan('admin', 'member', { id: 'c1', access: 'full' }, undefined)).toEqual([
            { table: 'books_admins', op: 'insert' },
        ])
    })

    it('admin over a readonly core row updates it then inserts the admin row', () => {
        expect(plan('admin', 'member', { id: 'c1', access: 'readonly' }, undefined)).toEqual([
            { table: 'org_pkg_access', op: 'update', id: 'c1', access: 'full' },
            { table: 'books_admins', op: 'insert' },
        ])
    })

    it('treats an absent core row as none for a guest and full for others', () => {
        expect(plan('bookkeeper', 'guest', undefined, undefined)).toEqual([
            { table: 'org_pkg_access', op: 'insert', access: 'full' },
        ])
        expect(plan('bookkeeper', 'member', undefined, undefined)).toEqual([])
    })
})

describe('filterPeople', () => {
    const people = [
        { name: 'Maya Ruiz', email: 'maya@hartwell.example' },
        { name: 'Lee Kim', email: 'LEE@other.example' },
    ]

    it('matches name and email case-insensitively with trimmed text', () => {
        expect(filterPeople(people, '  MAYA ')).toEqual([people[0]])
        expect(filterPeople(people, 'lee@other')).toEqual([people[1]])
        expect(filterPeople(people, 'zzz')).toEqual([])
    })

    it('returns every row for blank text', () => {
        expect(filterPeople(people, '')).toEqual(people)
        expect(filterPeople(people, '   ')).toEqual(people)
    })
})
