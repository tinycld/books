import {
    SidebarHeading,
    SidebarItem,
    SidebarNav,
} from '@tinycld/core/components/sidebar-primitives'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { FoldHeading } from './components/sidebar/FoldHeading'
import { NewSection } from './components/sidebar/NewSection'
import { ShortcutsSection } from './components/sidebar/ShortcutsSection'
import { useBooksSidebar } from './hooks/useBooksSidebar'
import type { SidebarEntry } from './lib/shell-nav'

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

// The Books sidebar, top to bottom: the user's Shortcuts, the New actions, then the fixed
// navigation under "Go to". The same component is the desktop sidebar and the phone drawer.
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
        <SidebarNav>
            <ShortcutsSection />
            <NewSection />
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
