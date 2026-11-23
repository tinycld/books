import { beforeEach, describe, expect, it } from 'vitest'
import { useBooksUIStore } from '../tinycld/books/stores/books-ui-store'

describe('useBooksUIStore', () => {
    beforeEach(() => {
        useBooksUIStore.setState({ isAccountingOpen: true, isNewOpen: false })
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

    it('persists the two fold states under tinycld_books_ui', () => {
        const options = useBooksUIStore.persist.getOptions()
        expect(options.name).toBe('tinycld_books_ui')
        useBooksUIStore.getState().toggleAccounting()
        const partial = options.partialize?.(useBooksUIStore.getState())
        expect(partial).toEqual({ isAccountingOpen: false, isNewOpen: false })
    })
})
