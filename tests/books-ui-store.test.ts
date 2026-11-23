import { useWorkspaceStore } from '@tinycld/core/lib/stores/workspace-store'
import { beforeEach, describe, expect, it } from 'vitest'
import { useBooksUIStore } from '../tinycld/books/stores/books-ui-store'

describe('useBooksUIStore', () => {
    beforeEach(() => {
        useWorkspaceStore.getState().setDrawerOpen(false)
        useBooksUIStore.setState({
            isAccountingOpen: true,
            isNewOpen: false,
            isNewFirst: false,
            isReportsOpen: false,
        })
    })

    it('starts with the accounting group open', () => {
        expect(useBooksUIStore.getState().isAccountingOpen).toBe(true)
    })

    it('toggleAccounting flips the flag', () => {
        useBooksUIStore.getState().toggleAccounting()
        expect(useBooksUIStore.getState().isAccountingOpen).toBe(false)
        useBooksUIStore.getState().toggleAccounting()
        expect(useBooksUIStore.getState().isAccountingOpen).toBe(true)
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

    it('openNew draws New first until the drawer closes; toggleNew does not', () => {
        expect(useBooksUIStore.getState().isNewFirst).toBe(false)
        useBooksUIStore.getState().toggleNew()
        expect(useBooksUIStore.getState().isNewFirst).toBe(false)
        useBooksUIStore.getState().openNew()
        useWorkspaceStore.getState().setDrawerOpen(true)
        expect(useBooksUIStore.getState().isNewFirst).toBe(true)
        useWorkspaceStore.getState().setDrawerOpen(false)
        expect(useBooksUIStore.getState().isNewFirst).toBe(false)
        expect(useBooksUIStore.getState().isNewOpen).toBe(true)
    })

    it('starts with the Reports section closed; toggleReports flips it', () => {
        expect(useBooksUIStore.getState().isReportsOpen).toBe(false)
        useBooksUIStore.getState().toggleReports()
        expect(useBooksUIStore.getState().isReportsOpen).toBe(true)
        useBooksUIStore.getState().toggleReports()
        expect(useBooksUIStore.getState().isReportsOpen).toBe(false)
    })

    it('persists the three fold states under tinycld_books_ui', () => {
        const options = useBooksUIStore.persist.getOptions()
        expect(options.name).toBe('tinycld_books_ui')
        useBooksUIStore.getState().toggleAccounting()
        const partial = options.partialize?.(useBooksUIStore.getState())
        expect(partial).toEqual({
            isAccountingOpen: false,
            isNewOpen: false,
            isReportsOpen: false,
        })
    })
})
