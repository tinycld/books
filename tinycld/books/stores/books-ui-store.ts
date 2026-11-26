import { asyncStorage, create, persist } from '@tinycld/core/lib/store'
import { useWorkspaceStore } from '@tinycld/core/lib/stores/workspace-store'

interface BooksUIState {
    // The New section of the sidebar. Closed until the user opens it.
    isNewOpen: boolean
    toggleNew: () => void
    // Opens the New section and never closes it: the phone's New button calls this.
    openNew: () => void
    // Set by openNew, cleared when the drawer is next opened: the drawer the New button opens
    // draws New above the Shortcuts, which can be taller than the screen. Call openNew after
    // the drawer opens.
    isNewFirst: boolean
    // The Reports section of the sidebar. Closed until the user opens it.
    isReportsOpen: boolean
    toggleReports: () => void
    // The text of the sidebar's filter box. Not kept: a new session starts unfiltered.
    filter: string
    setFilter: (filter: string) => void
}

export const useBooksUIStore = create<BooksUIState>()(
    persist(
        set => ({
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
            filter: '',
            setFilter: filter => {
                set({ filter })
            },
        }),
        {
            name: 'tinycld_books_ui',
            storage: asyncStorage,
            partialize: s => ({
                isNewOpen: s.isNewOpen,
                isReportsOpen: s.isReportsOpen,
            }),
        }
    )
)

// Every way the drawer opens (the edge swipe, the New button) goes through core's workspace
// store. An open clears the flag, so the New button opens the drawer first and then calls
// openNew. The flag stays through a close, so the order does not jump during the animation.
useWorkspaceStore.subscribe((state, previous) => {
    if (!previous.isDrawerOpen && state.isDrawerOpen) {
        useBooksUIStore.setState({ isNewFirst: false })
    }
})
