import { SidebarDivider, SidebarItem } from '@tinycld/core/components/sidebar-primitives'
import { useUrl } from '@tinycld/core/lib/use-url'
import { View } from 'react-native'
import { useNewMenu } from '../../hooks/useNewMenu'
import { type NewAction, newActionSidebarLabel } from '../../lib/new-actions'
import { activeNewActionId, type NewMenuColumn } from '../../lib/shell-nav'
import { useBooksUIStore } from '../../stores/books-ui-store'
import { FoldHeading } from './FoldHeading'

// A test id never holds an underscore: the action `sales_receipt` is
// `books-sidebar-new-sales-receipt`.
export function newSectionTestId(action: NewAction): string {
    return `books-sidebar-new-${action.id.replace(/_/g, '-')}`
}

interface NewGroupProps {
    column: NewMenuColumn
    hasDivider: boolean
    activeId: string | undefined
    onSelect: (action: NewAction) => void
}

function GroupDivider({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <SidebarDivider />
}

// One group (Customers, Vendors, Other): its actions as the group's own children, in the
// order of lib/new-actions.ts. The group has no label: each action names what it makes, so
// a divider between the groups is enough.
function NewGroup({ column, hasDivider, activeId, onSelect }: NewGroupProps) {
    const items = column.actions.map(action => (
        <SidebarItem
            key={action.id}
            label={newActionSidebarLabel(action)}
            isActive={action.id === activeId}
            closesDrawer
            onPress={() => onSelect(action)}
            testID={newSectionTestId(action)}
        />
    ))
    return (
        <View testID={`books-sidebar-new-group-${column.heading.toLowerCase()}`}>
            <GroupDivider isVisible={hasDivider} />
            {items}
        </View>
    )
}

// The New section of the Books sidebar: every transaction form and record a writer can
// start, under Customers, Vendors and Other. The action whose form is open shows as active.
// Folded until the user opens it (the state is
// kept). A reader has no New action, so the section is not drawn at all.
export function NewSection() {
    const { isVisible, columns, open } = useNewMenu()
    const isOpen = useBooksUIStore(s => s.isNewOpen)
    const toggle = useBooksUIStore(s => s.toggleNew)
    const { pathname } = useUrl()
    const activeId = activeNewActionId(pathname)
    if (!isVisible) return null

    const groups = isOpen
        ? columns.map((column, index) => (
              <NewGroup
                  key={column.heading}
                  column={column}
                  hasDivider={index > 0}
                  activeId={activeId}
                  onSelect={open}
              />
          ))
        : null
    return (
        <>
            <FoldHeading
                title="New"
                isOpen={isOpen}
                onToggle={toggle}
                testID="books-sidebar-new-toggle"
            />
            {groups}
        </>
    )
}
