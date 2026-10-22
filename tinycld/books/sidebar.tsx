import {
    SidebarHeading,
    SidebarItem,
    SidebarNav,
} from '@tinycld/core/components/sidebar-primitives'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { router } from 'expo-router'
import { ChevronDown, ChevronRight } from 'lucide-react-native'
import { Pressable } from 'react-native'
import { useBooksSidebar } from './hooks/useBooksSidebar'
import type { SidebarEntry } from './lib/shell-nav'

function accountingToggleView(isOpen: boolean) {
    return isOpen
        ? { Chevron: ChevronDown, label: 'Collapse Accounting' }
        : { Chevron: ChevronRight, label: 'Expand Accounting' }
}

interface AccountingHeadingProps {
    isVisible: boolean
    isOpen: boolean
    onToggle: () => void
}

function AccountingHeading({ isVisible, isOpen, onToggle }: AccountingHeadingProps) {
    const mutedColor = useThemeColor('muted-foreground')
    if (!isVisible) return null
    const { Chevron, label } = accountingToggleView(isOpen)

    return (
        <SidebarHeading
            action={
                <Pressable
                    testID="books-nav-accounting-toggle"
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    onPress={onToggle}
                    hitSlop={8}
                    className="items-center justify-center"
                    style={{ minWidth: 44, minHeight: 44 }}
                >
                    <Chevron size={16} color={mutedColor} />
                </Pressable>
            }
        >
            Accounting
        </SidebarHeading>
    )
}

export default function BooksSidebar() {
    const { top, visibleAccounting, hasAccounting, isAccountingOpen, toggleAccounting, isActive } =
        useBooksSidebar()
    const orgHref = useOrgHref()

    const renderItem = (entry: SidebarEntry) => (
        <SidebarItem
            key={entry.id}
            label={entry.label}
            icon={entry.icon}
            isActive={isActive(entry)}
            closesDrawer
            onPress={() => router.push(orgHref(entry.href))}
            testID={`books-nav-${entry.id}`}
        />
    )

    return (
        <SidebarNav>
            {top.map(renderItem)}
            <AccountingHeading
                isVisible={hasAccounting}
                isOpen={isAccountingOpen}
                onToggle={toggleAccounting}
            />
            {visibleAccounting.map(renderItem)}
        </SidebarNav>
    )
}
