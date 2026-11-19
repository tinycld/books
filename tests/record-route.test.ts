import { describe, expect, it } from 'vitest'
import {
    isKindStackHref,
    navigationModeFor,
    newRecordPath,
    openRecordFromPath,
    RECORD_DETAIL_SCREENS,
    recordPath,
    targetModeFor,
} from '../tinycld/books/lib/record-route'

const WIDGETS = 'books/widgets'

describe('record routes', () => {
    it('recordPath names the [id] route under the list path with the id param', () => {
        expect(recordPath(WIDGETS, 'abc')).toEqual({
            path: 'books/widgets/[id]',
            params: { id: 'abc' },
        })
    })

    it('recordPath merges extra route params after the id', () => {
        expect(recordPath('books/vendors', 'v1', { tab: 'details' })).toEqual({
            path: 'books/vendors/[id]',
            params: { id: 'v1', tab: 'details' },
        })
    })

    it('recordPath with no extra params gives the id param alone', () => {
        expect(recordPath('books/vendors', 'v1')).toEqual({
            path: 'books/vendors/[id]',
            params: { id: 'v1' },
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

describe('isKindStackHref', () => {
    it.each([
        ['books/bills', 'books/bills/new?copy=x'],
        ['books/bills', 'books/bills/abc'],
        ['books/bill-payments', 'books/bill-payments/abc'],
    ])('is true for a record of the %s stack: %s', (listPath, href) => {
        expect(isKindStackHref(listPath, href)).toBe(true)
    })

    it.each([
        ['books/bill-payments', 'books/pay-bills?replaces=x'],
        ['books/purchases', 'books/bills/new'],
        ['books/bills', 'books/entries/x'],
        ['books/bills', 'books/bill-payments/abc'],
    ])('is false for a route outside the %s stack: %s', (listPath, href) => {
        expect(isKindStackHref(listPath, href)).toBe(false)
    })
})

describe('targetModeFor', () => {
    const open = { kind: 'id', id: 'abc' } as const

    it('replaces a copy of the open bill in the bills stack', () => {
        expect(targetModeFor(open, 'books/bills', 'books/bills/new?copy=x')).toBe('replace')
    })

    it('pushes a record of its own stack when no record is open', () => {
        expect(targetModeFor({ kind: 'none' }, 'books/bills', 'books/bills/new?copy=x')).toBe(
            'push'
        )
    })

    it('pushes Pay Bills over the bill payments stack, also with a payment open', () => {
        expect(targetModeFor(open, 'books/bill-payments', 'books/pay-bills?replaces=x')).toBe(
            'push'
        )
    })

    it('pushes a bill from All purchases, which is not its stack', () => {
        expect(targetModeFor(open, 'books/purchases', 'books/bills/new')).toBe('push')
        expect(targetModeFor({ kind: 'new' }, 'books/purchases', 'books/bills/new')).toBe('push')
    })

    it('pushes the journal entry of an open bill', () => {
        expect(targetModeFor(open, 'books/bills', 'books/entries/x')).toBe('push')
    })
})

describe('RECORD_DETAIL_SCREENS', () => {
    it('lists the child stack screens after its index', () => {
        expect(RECORD_DETAIL_SCREENS).toEqual(['[id]', 'new'])
    })
})
