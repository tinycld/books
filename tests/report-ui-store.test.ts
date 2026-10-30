import { beforeEach, describe, expect, it } from 'vitest'
import { useReportUIStore } from '../tinycld/books/stores/report-ui-store'

// Captured before any test runs, actions included, so each test starts from it.
const INITIAL = useReportUIStore.getState()
const store = () => useReportUIStore.getState()

beforeEach(() => {
    useReportUIStore.setState(INITIAL, true)
})

describe('initial state', () => {
    it('has nothing folded, no surface and Customize closed', () => {
        expect(INITIAL.folded).toEqual({})
        expect(INITIAL.surface).toBeNull()
        expect(INITIAL.isCustomizeOpen).toBe(false)
    })
})

describe('folding', () => {
    it('toggleSection adds a section, removes it on a second call, and leaves other reports', () => {
        store().setFolded('r2', ['a'])
        store().toggleSection('r1', 's1')
        expect(store().folded.r1).toEqual(['s1'])
        expect(store().folded.r2).toEqual(['a'])
        store().toggleSection('r1', 's1')
        expect(store().folded.r1 ?? []).toEqual([])
        expect(store().folded.r2).toEqual(['a'])
    })

    it('setFolded replaces the list', () => {
        store().toggleSection('r1', 's1')
        store().setFolded('r1', ['s2', 's3'])
        expect(store().folded.r1).toEqual(['s2', 's3'])
        store().setFolded('r1', [])
        expect(store().folded.r1).toEqual([])
    })
})

describe('surfaces', () => {
    it('openSurface sets the surface and closeSurface clears it', () => {
        store().openSurface({ kind: 'filter-picker', filterId: 'account' })
        expect(store().surface).toEqual({ kind: 'filter-picker', filterId: 'account' })
        store().closeSurface()
        expect(store().surface).toBeNull()
    })

    it('opening a second surface replaces the first', () => {
        store().openSurface({ kind: 'period' })
        store().openSurface({ kind: 'add-filter' })
        expect(store().surface).toEqual({ kind: 'add-filter' })
    })
})

describe('Customize', () => {
    it('openCustomize and closeCustomize flip the flag', () => {
        store().openCustomize()
        expect(store().isCustomizeOpen).toBe(true)
        store().closeCustomize()
        expect(store().isCustomizeOpen).toBe(false)
    })
})

describe('startVisit', () => {
    it('clears that report folded ids only and closes every surface and Customize', () => {
        store().setFolded('r1', ['s1', 's2'])
        store().setFolded('r2', ['s9'])
        store().openSurface({ kind: 'period' })
        store().openCustomize()
        store().startVisit('r1')
        expect(store().folded.r1 ?? []).toEqual([])
        expect(store().folded.r2).toEqual(['s9'])
        expect(store().surface).toBeNull()
        expect(store().isCustomizeOpen).toBe(false)
    })
})
