import { asyncStorage, create, persist } from '@tinycld/core/lib/store'

interface BooksUIState {
    isAccountingOpen: boolean
    toggleAccounting: () => void
}

export const useBooksUIStore = create<BooksUIState>()(
    persist(
        set => ({
            isAccountingOpen: true,
            toggleAccounting: () => {
                set(s => ({ isAccountingOpen: !s.isAccountingOpen }))
            },
        }),
        {
            name: 'tinycld_books_ui',
            storage: asyncStorage,
            partialize: s => ({ isAccountingOpen: s.isAccountingOpen }),
        }
    )
)
