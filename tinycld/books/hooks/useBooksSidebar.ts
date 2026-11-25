import { useUrl } from '@tinycld/core/lib/use-url'
import {
    activeNewActionId,
    availableOnly,
    isActivePath,
    SIDEBAR_ENTRIES,
    type SidebarEntry,
    sidebarSections,
} from '../lib/shell-nav'

// The fixed navigation of the sidebar, in sidebar order: the top entries, the accounting
// entries, then Taxes and Settings. No entry is active while a New action's route is open:
// the New section marks that action instead.
export function useBooksSidebar(entries: readonly SidebarEntry[] = SIDEBAR_ENTRIES) {
    const { pathname } = useUrl()
    const { top, accounting, end } = sidebarSections(availableOnly(entries))
    const isNewActionOpen = activeNewActionId(pathname) !== undefined

    return {
        entries: [...top, ...accounting, ...end],
        isActive: (entry: SidebarEntry) => !isNewActionOpen && isActivePath(pathname, entry),
    }
}
