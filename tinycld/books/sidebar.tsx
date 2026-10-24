import {
    SidebarActionButton,
    SidebarHeading,
    SidebarItem,
    SidebarNav,
} from '@tinycld/core/components/sidebar-primitives'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { router } from 'expo-router'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react-native'
import { Pressable } from 'react-native'
import { NewMenu } from './components/NewMenu'
import { useBooksSidebar } from './hooks/useBooksSidebar'
import { useNewMenu } from './hooks/useNewMenu'
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

type NewMenuState = ReturnType<typeof useNewMenu>

interface SidebarNewButtonProps {
    isVisible: boolean
    columns: NewMenuState['columns']
    onSelect: NewMenuState['open']
}

function SidebarNewButton({ isVisible, columns, onSelect }: SidebarNewButtonProps) {
    if (!isVisible) return null

    return (
        <NewMenu
            columns={columns}
            onSelect={onSelect}
            trigger={<SidebarActionButton label="New" icon={Plus} />}
        />
    )
}

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
    const { isVisible: hasNewActions, columns, open } = useNewMenu()
    const isMobile = useBreakpoint() === 'mobile'

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
            <SidebarNewButton
                isVisible={hasNewActions && !isMobile}
                columns={columns}
                onSelect={open}
            />
            {top.map(renderItem)}
            <AccountingHeading
                isVisible={hasAccounting}
                isOpen={isAccountingOpen}
                onToggle={toggleAccounting}
            />
            {visibleAccounting.map(renderItem)}
            {end.map(renderItem)}
        </SidebarNav>
    )
}
