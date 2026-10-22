import { beforeEach, describe, expect, it } from 'vitest'
import { useBooksUIStore } from '../tinycld/books/stores/books-ui-store'

describe('useBooksUIStore', () => {
    beforeEach(() => {
        useBooksUIStore.setState({ isAccountingOpen: true })
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

    it('persists only isAccountingOpen under tinycld_books_ui', () => {
        const options = useBooksUIStore.persist.getOptions()
        expect(options.name).toBe('tinycld_books_ui')
        useBooksUIStore.getState().toggleAccounting()
        const partial = options.partialize?.(useBooksUIStore.getState())
        expect(partial).toEqual({ isAccountingOpen: false })
        expect(Object.keys(partial ?? {})).toEqual(['isAccountingOpen'])
        useBooksUIStore.setState({ isAccountingOpen: true })
    })
})
