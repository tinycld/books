import {
    SidebarHeading,
    SidebarItem,
    SidebarNav,
} from '@tinycld/core/components/sidebar-primitives'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { FoldHeading } from './components/sidebar/FoldHeading'
import { NewSection } from './components/sidebar/NewSection'
import { ReportsSection } from './components/sidebar/ReportsSection'
import { ShortcutsSection } from './components/sidebar/ShortcutsSection'
import { useBooksSidebar } from './hooks/useBooksSidebar'
import type { SidebarEntry } from './lib/shell-nav'
import { useBooksUIStore } from './stores/books-ui-store'

interface AccountingHeadingProps {
    isVisible: boolean
    isOpen: boolean
    onToggle: () => void
}

function AccountingHeading({ isVisible, isOpen, onToggle }: AccountingHeadingProps) {
    if (!isVisible) return null
    return (
        <FoldHeading
            title="Accounting"
            isOpen={isOpen}
            onToggle={onToggle}
            testID="books-nav-accounting-toggle"
        />
    )
}

const SHORTCUTS_FIRST = [<ShortcutsSection key="shortcuts" />, <NewSection key="new" />]
const NEW_FIRST = [<NewSection key="new" />, <ShortcutsSection key="shortcuts" />]

// The Books sidebar, top to bottom: the user's Shortcuts, the New actions, the Books
// reports, then the fixed navigation under "Go to". The same component is the desktop
// sidebar and the phone drawer. The drawer that the phone's New button opens draws New
// first, because the Shortcuts above it can be taller than the screen. core's SidebarNav
// gives no handle to its scroll, so the key change draws a new SidebarNav, which starts at
// the top, also when the drawer was scrolled before it closed.
export default function BooksSidebar() {
    const {
        top,
        end,
        visibleAccounting,
        hasAccounting,
        isAccountingOpen,
        toggleAccounting,
        isActive,
    } = useBooksSidebar()
    const isNewFirst = useBooksUIStore(s => s.isNewFirst)
    const leadSections = isNewFirst ? NEW_FIRST : SHORTCUTS_FIRST
    const navKey = isNewFirst ? 'new-first' : 'shortcuts-first'
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
    const topItems = top.map(renderItem)
    const accountingItems = visibleAccounting.map(renderItem)
    const endItems = end.map(renderItem)

    return (
        <SidebarNav key={navKey}>
            {leadSections}
            <ReportsSection />
            <SidebarHeading>Go to</SidebarHeading>
            {topItems}
            <AccountingHeading
                isVisible={hasAccounting}
                isOpen={isAccountingOpen}
                onToggle={toggleAccounting}
            />
            {accountingItems}
            {endItems}
        </SidebarNav>
    )
}
