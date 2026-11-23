import { asyncStorage, create, persist } from '@tinycld/core/lib/store'
import { useWorkspaceStore } from '@tinycld/core/lib/stores/workspace-store'

interface BooksUIState {
    isAccountingOpen: boolean
    toggleAccounting: () => void
    // The New section of the sidebar. Closed until the user opens it.
    isNewOpen: boolean
    toggleNew: () => void
    // Opens the New section and never closes it: the phone's New button calls this.
    openNew: () => void
    // Set by openNew, cleared when the phone drawer closes: the drawer the New button opens
    // draws New above the Shortcuts, which can be taller than the screen.
    isNewFirst: boolean
    // The Reports section of the sidebar. Closed until the user opens it.
    isReportsOpen: boolean
    toggleReports: () => void
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
                set({ isNewOpen: true, isNewFirst: true })
            },
            isNewFirst: false,
            isReportsOpen: false,
            toggleReports: () => {
                set(s => ({ isReportsOpen: !s.isReportsOpen }))
            },
        }),
        {
            name: 'tinycld_books_ui',
            storage: asyncStorage,
            partialize: s => ({
                isAccountingOpen: s.isAccountingOpen,
                isNewOpen: s.isNewOpen,
                isReportsOpen: s.isReportsOpen,
            }),
        }
    )
)

// Every way the drawer closes (an item, the backdrop, a swipe, a route change) goes through
// core's workspace store, so this is the one place that sees them all.
useWorkspaceStore.subscribe((state, previous) => {
    if (previous.isDrawerOpen && !state.isDrawerOpen) {
        useBooksUIStore.setState({ isNewFirst: false })
    }
})
