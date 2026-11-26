import {
    SidebarDivider,
    SidebarItem,
    SidebarNav,
    SidebarSlot,
} from '@tinycld/core/components/sidebar-primitives'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { NewSection } from './components/sidebar/NewSection'
import { ReportsSection } from './components/sidebar/ReportsSection'
import { ShortcutsSection } from './components/sidebar/ShortcutsSection'
import { SidebarFilter, SidebarFilterResults } from './components/sidebar/SidebarFilter'
import { useBooksSidebar } from './hooks/useBooksSidebar'
import type { SidebarEntry } from './lib/shell-nav'
import { useBooksUIStore } from './stores/books-ui-store'

// The slots other packages render into (manifest `slots`). Each slot draws its
// contributions as they are, also while the filter is in use: Books cannot read the rows of
// a contributed component, so it cannot filter them.
const AFTER_NAVIGATION = (
    <SidebarSlot key="after-navigation" target="books" slot="sidebar.after-navigation" />
)
const AFTER_NEW = <SidebarSlot key="after-new" target="books" slot="sidebar.after-new" />
const AFTER_REPORTS = (
    <SidebarSlot key="after-reports" target="books" slot="sidebar.after-reports" />
)

// The fixed navigation, under the Shortcuts with a divider between them: the Dashboard,
// Banking, Sales, Expenses, Lists, the accounting screens, Taxes and Settings.
function NavigationSection() {
    const { entries, isActive } = useBooksSidebar()
    const orgHref = useOrgHref()

    const renderItem = (entry: SidebarEntry) => (
        <SidebarItem
            key={entry.id}
            label={entry.label}
            icon={entry.icon}
            isActive={isActive(entry)}
            closesDrawer
            onPress={() => router.navigate(orgHref(entry.href, entry.params))}
            testID={`books-nav-${entry.id}`}
        />
    )
    const items = entries.map(renderItem)

    return (
        <>
            <SidebarDivider />
            {items}
        </>
    )
}

const SHORTCUTS_FIRST = [
    <ShortcutsSection key="shortcuts" />,
    <NavigationSection key="navigation" />,
    AFTER_NAVIGATION,
    <NewSection key="new" />,
    AFTER_NEW,
    <ReportsSection key="reports" />,
    AFTER_REPORTS,
]
const NEW_FIRST = [
    <NewSection key="new" />,
    AFTER_NEW,
    <ShortcutsSection key="shortcuts" />,
    <NavigationSection key="navigation" />,
    AFTER_NAVIGATION,
    <ReportsSection key="reports" />,
    AFTER_REPORTS,
]
const SLOTS_ONLY = [AFTER_NAVIGATION, AFTER_NEW, AFTER_REPORTS]

function useSidebarSections() {
    // Only the phone drawer draws New first: a resize to a desktop width can leave the flag
    // set while the drawer is open.
    const isMobile = useBreakpoint() === 'mobile'
    const isNewFirst = useBooksUIStore(s => s.isNewFirst) && isMobile
    const isFiltering = useBooksUIStore(s => s.filter.trim() !== '')
    // The key follows only the order: a change of key draws a new filter box, which would
    // take the focus from the user while they type.
    const navKey = isNewFirst ? 'new-first' : 'shortcuts-first'
    if (isFiltering) return { sections: SLOTS_ONLY, isFiltering, navKey }
    if (isNewFirst) return { sections: NEW_FIRST, isFiltering, navKey }
    return { sections: SHORTCUTS_FIRST, isFiltering, navKey }
}

// The Books sidebar, top to bottom: the filter box, the user's Shortcuts, the fixed
// navigation, the New actions, then the Books reports. Each of the last
// three is followed by a slot for other packages. While the filter holds text, the
// sidebar draws only the rows that match, then the slots. The same component is the
// desktop sidebar and the phone drawer. The drawer that the phone's New button opens draws
// New first, because the Shortcuts above it can be taller than the screen. core's
// SidebarNav gives no handle to its scroll, so the key change draws a new SidebarNav, which
// starts at the top, also when the drawer was scrolled before it closed.
export default function BooksSidebar() {
    const { sections, isFiltering, navKey } = useSidebarSections()
    return (
        <SidebarNav key={navKey}>
            <SidebarFilter />
            <SidebarFilterResults isVisible={isFiltering} />
            {sections}
        </SidebarNav>
    )
}
