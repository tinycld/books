import { useWorkspaceStore } from '@tinycld/core/lib/stores/workspace-store'
import { beforeEach, describe, expect, it } from 'vitest'
import { useBooksUIStore } from '../tinycld/books/stores/books-ui-store'

describe('useBooksUIStore', () => {
    beforeEach(() => {
        useWorkspaceStore.getState().setDrawerOpen(false)
        useBooksUIStore.setState({
            isNewOpen: false,
            isNewFirst: false,
            isReportsOpen: false,
        })
    })

    it('starts with the New section closed; toggleNew flips it and openNew only opens', () => {
        expect(useBooksUIStore.getState().isNewOpen).toBe(false)
        useBooksUIStore.getState().toggleNew()
        expect(useBooksUIStore.getState().isNewOpen).toBe(true)
        useBooksUIStore.getState().openNew()
        expect(useBooksUIStore.getState().isNewOpen).toBe(true)
        useBooksUIStore.getState().toggleNew()
        expect(useBooksUIStore.getState().isNewOpen).toBe(false)
        useBooksUIStore.getState().openNew()
        expect(useBooksUIStore.getState().isNewOpen).toBe(true)
    })

    it('the drawer opened, then openNew, draws New first through the close; toggleNew does not', () => {
        expect(useBooksUIStore.getState().isNewFirst).toBe(false)
        useBooksUIStore.getState().toggleNew()
        expect(useBooksUIStore.getState().isNewFirst).toBe(false)
        useWorkspaceStore.getState().setDrawerOpen(true)
        useBooksUIStore.getState().openNew()
        expect(useBooksUIStore.getState().isNewFirst).toBe(true)
        useWorkspaceStore.getState().setDrawerOpen(false)
        expect(useBooksUIStore.getState().isNewFirst).toBe(true)
        expect(useBooksUIStore.getState().isNewOpen).toBe(true)
    })

    it('the next open by anything but the New button draws Shortcuts first again', () => {
        useWorkspaceStore.getState().setDrawerOpen(true)
        useBooksUIStore.getState().openNew()
        useWorkspaceStore.getState().setDrawerOpen(false)
        useWorkspaceStore.getState().setDrawerOpen(true)
        expect(useBooksUIStore.getState().isNewFirst).toBe(false)
    })

    it('starts with the Reports section closed; toggleReports flips it', () => {
        expect(useBooksUIStore.getState().isReportsOpen).toBe(false)
        useBooksUIStore.getState().toggleReports()
        expect(useBooksUIStore.getState().isReportsOpen).toBe(true)
        useBooksUIStore.getState().toggleReports()
        expect(useBooksUIStore.getState().isReportsOpen).toBe(false)
    })

    it('persists the two fold states under tinycld_books_ui, and not the filter', () => {
        const options = useBooksUIStore.persist.getOptions()
        expect(options.name).toBe('tinycld_books_ui')
        useBooksUIStore.getState().toggleReports()
        useBooksUIStore.getState().setFilter('aging')
        const partial = options.partialize?.(useBooksUIStore.getState())
        expect(partial).toEqual({
            isNewOpen: false,
            isReportsOpen: true,
        })
    })
})
