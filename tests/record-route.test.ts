import { describe, expect, it } from 'vitest'
import {
    navigationModeFor,
    newRecordPath,
    openRecordFromPath,
    RECORD_DETAIL_SCREENS,
    recordPath,
} from '../tinycld/books/lib/record-route'

const WIDGETS = 'books/widgets'

describe('record routes', () => {
    it('recordPath names the [id] route under the list path with the id param', () => {
        expect(recordPath(WIDGETS, 'abc')).toEqual({
            path: 'books/widgets/[id]',
            params: { id: 'abc' },
        })
    })

    it('newRecordPath has no params key when none are given', () => {
        const route = newRecordPath(WIDGETS)
        expect(route.path).toBe('books/widgets/new')
        expect('params' in route).toBe(false)
    })

    it('newRecordPath carries the params when given', () => {
        expect(newRecordPath(WIDGETS, { kind: 'x' })).toEqual({
            path: 'books/widgets/new',
            params: { kind: 'x' },
        })
    })
})

describe('openRecordFromPath', () => {
    it.each(['/a/books/widgets', '/a/books/widgets/'])('is none on the list path %s', path => {
        expect(openRecordFromPath(WIDGETS, path)).toEqual({ kind: 'none' })
    })

    it('is new on the new path', () => {
        expect(openRecordFromPath(WIDGETS, '/a/books/widgets/new')).toEqual({ kind: 'new' })
    })

    it.each([
        '/a/books/widgets/abc',
        '/a/acme/books/widgets/abc/',
    ])('is the id on the record path %s', path => {
        expect(openRecordFromPath(WIDGETS, path)).toEqual({ kind: 'id', id: 'abc' })
    })

    it.each([
        '/a/books/customers/abc',
        '/a/books/widgets/abc/edit',
    ])('is none on %s, which is not one segment under the list path', path => {
        expect(openRecordFromPath(WIDGETS, path)).toEqual({ kind: 'none' })
    })
})

describe('navigationModeFor', () => {
    it('pushes when no record is open', () => {
        expect(navigationModeFor({ kind: 'none' })).toBe('push')
    })

    it('replaces when a new record or an existing record is open', () => {
        expect(navigationModeFor({ kind: 'new' })).toBe('replace')
        expect(navigationModeFor({ kind: 'id', id: 'abc' })).toBe('replace')
    })
})

describe('RECORD_DETAIL_SCREENS', () => {
    it('lists the child stack screens after its index', () => {
        expect(RECORD_DETAIL_SCREENS).toEqual(['[id]', 'new'])
    })
})
