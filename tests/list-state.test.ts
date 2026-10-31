import { describe, expect, it } from 'vitest'
import { keepLastSettled, listViewState } from '../tinycld/books/lib/list-state'
import type { PartyListViewState } from '../tinycld/books/lib/party-list'

const viewState = (input: Partial<Parameters<typeof listViewState>[0]>) =>
    listViewState({
        isReady: true,
        isError: false,
        rowCount: 0,
        anyRecord: true,
        search: '',
        showInactive: false,
        ...input,
    })

describe('listViewState', () => {
    it('shows an error first', () => {
        expect(viewState({ isError: true, isReady: false })).toBe('error')
    })

    it('loads until the page is ready', () => {
        expect(viewState({ isReady: false, rowCount: 3 })).toBe('loading')
    })

    it('is ready with rows', () => {
        expect(viewState({ rowCount: 3, anyRecord: undefined })).toBe('ready')
    })

    it('waits for the one-row query before it calls an empty page anything', () => {
        expect(viewState({ anyRecord: undefined })).toBe('loading')
    })

    it('is empty when no record exists at all', () => {
        expect(viewState({ anyRecord: false })).toBe('empty')
        expect(viewState({ anyRecord: false, search: 'harbor' })).toBe('empty')
    })

    it('says all-inactive only for the default view', () => {
        expect(viewState({})).toBe('all-inactive')
        expect(viewState({ search: ' %% ' })).toBe('all-inactive')
    })

    it('says no-match for a search or with Show inactive on', () => {
        expect(viewState({ search: 'harbor' })).toBe('no-match')
        expect(viewState({ showInactive: true })).toBe('no-match')
    })
})

describe('keepLastSettled', () => {
    const a = { id: 'a' }
    const b = { id: 'b' }
    const defaultView = { search: '', showInactive: false }
    const shown = (
        rows: { id: string }[],
        state: PartyListViewState,
        filters: { search: string; showInactive: boolean } = defaultView
    ) => ({ rows, viewState: state, filters })

    it('shows a settled list and keeps it', () => {
        const now = shown([a], 'ready')
        expect(keepLastSettled(undefined, now)).toEqual({ next: now, shown: now })
    })

    it('keeps the last settled rows and state while the query for new filters loads', () => {
        const prev = shown([a], 'no-match')
        const result = keepLastSettled(
            prev,
            shown([], 'loading', { search: 'harbor', showInactive: false })
        )
        expect(result.next).toBe(prev)
        expect(result.shown).toBe(prev)
        const inactive = keepLastSettled(
            prev,
            shown([], 'loading', { search: '', showInactive: true })
        )
        expect(inactive.shown).toBe(prev)
    })

    it('drops a deleted only row while the one-row query loads under the same filters', () => {
        const prev = shown([a], 'ready')
        const result = keepLastSettled(prev, shown([], 'loading'))
        expect(result.next).toBe(prev)
        expect(result.shown.rows).toEqual([])
        expect(result.shown.viewState).toBe('ready')
    })

    it('replaces the kept value when new filters settle on the same rows', () => {
        const prev = shown([a], 'ready')
        const now = shown([a], 'ready', { search: 'alder', showInactive: false })
        expect(keepLastSettled(prev, now).next).toBe(now)
    })

    it('shows loading when nothing settled yet', () => {
        const now = shown([], 'loading')
        expect(keepLastSettled(undefined, now)).toEqual({ next: undefined, shown: now })
    })

    it('returns the kept value itself when nothing changed, so the caller sets no state', () => {
        const prev = shown([a, b], 'ready')
        expect(keepLastSettled(prev, shown([a, b], 'ready')).next).toBe(prev)
    })

    it('replaces the kept value when the rows or the state change', () => {
        const prev = shown([a], 'ready')
        const now = shown([a, b], 'ready')
        expect(keepLastSettled(prev, now).next).toBe(now)
        const failed = shown([], 'error')
        expect(keepLastSettled(prev, failed)).toEqual({ next: failed, shown: failed })
    })
})
