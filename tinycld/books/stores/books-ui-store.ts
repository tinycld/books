import { asyncStorage, create, persist } from '@tinycld/core/lib/store'

interface BooksUIState {
    isAccountingOpen: boolean
    toggleAccounting: () => void
    // The New section of the sidebar. Closed until the user opens it.
    isNewOpen: boolean
    toggleNew: () => void
    // Opens the New section and never closes it: the phone's New button calls this.
    openNew: () => void
}

export const useBooksUIStore = create<BooksUIState>()(
    persist(
        set => ({
            isAccountingOpen: true,
            toggleAccounting: () => {
                set(s => ({ isAccountingOpen: !s.isAccountingOpen }))
            },
            isNewOpen: false,
            toggleNew: () => {
                set(s => ({ isNewOpen: !s.isNewOpen }))
            },
            openNew: () => {
                set({ isNewOpen: true })
            },
        }),
        {
            name: 'tinycld_books_ui',
            storage: asyncStorage,
            partialize: s => ({ isAccountingOpen: s.isAccountingOpen, isNewOpen: s.isNewOpen }),
        }
    )
)
