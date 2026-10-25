import { useUrl } from '@tinycld/core/lib/use-url'
import {
    availableOnly,
    isActivePath,
    SIDEBAR_ENTRIES,
    type SidebarEntry,
    sidebarSections,
} from '../lib/shell-nav'
import { useBooksUIStore } from '../stores/books-ui-store'

export function useBooksSidebar(entries: readonly SidebarEntry[] = SIDEBAR_ENTRIES) {
    const { pathname } = useUrl()
    const isAccountingOpen = useBooksUIStore(s => s.isAccountingOpen)
    const toggleAccounting = useBooksUIStore(s => s.toggleAccounting)
    const { top, accounting, end } = sidebarSections(availableOnly(entries))

    return {
        top,
        end,
        accounting,
        visibleAccounting: isAccountingOpen ? accounting : [],
        hasAccounting: accounting.length > 0,
        isAccountingOpen,
        toggleAccounting,
        isActive: (entry: SidebarEntry) => isActivePath(pathname, entry),
    }
}
