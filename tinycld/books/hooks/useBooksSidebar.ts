import { useUrl } from '@tinycld/core/lib/use-url'
import {
    availableOnly,
    isActivePath,
    SIDEBAR_ENTRIES,
    type SidebarEntry,
    sidebarSections,
} from '../lib/shell-nav'

// The fixed navigation of the sidebar, in sidebar order: the top entries, the accounting
// entries, then Taxes and Settings.
export function useBooksSidebar(entries: readonly SidebarEntry[] = SIDEBAR_ENTRIES) {
    const { pathname } = useUrl()
    const { top, accounting, end } = sidebarSections(availableOnly(entries))

    return {
        entries: [...top, ...accounting, ...end],
        isActive: (entry: SidebarEntry) => isActivePath(pathname, entry),
    }
}
