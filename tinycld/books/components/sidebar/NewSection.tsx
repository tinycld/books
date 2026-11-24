import { SidebarItem } from '@tinycld/core/components/sidebar-primitives'
import { Text, View } from 'react-native'
import { useNewMenu } from '../../hooks/useNewMenu'
import type { NewAction } from '../../lib/new-actions'
import type { NewMenuColumn } from '../../lib/shell-nav'
import { useBooksUIStore } from '../../stores/books-ui-store'
import { FoldHeading } from './FoldHeading'

// A test id never holds an underscore: the action `sales_receipt` is
// `books-sidebar-new-sales-receipt`.
export function newSectionTestId(action: NewAction): string {
    return `books-sidebar-new-${action.id.replace(/_/g, '-')}`
}

interface NewGroupProps {
    column: NewMenuColumn
    onSelect: (action: NewAction) => void
}

// One group (Customers, Vendors, Other): its label, then its actions as the group's own
// children, in the order of lib/new-actions.ts.
function NewGroup({ column, onSelect }: NewGroupProps) {
    const items = column.actions.map(action => (
        <SidebarItem
            key={action.id}
            label={action.label}
            closesDrawer
            onPress={() => onSelect(action)}
            testID={newSectionTestId(action)}
        />
    ))
    return (
        <View testID={`books-sidebar-new-group-${column.heading.toLowerCase()}`}>
            <Text className="px-3 pt-2 pb-1 text-[11px] font-medium text-muted-foreground">
                {column.heading}
            </Text>
            {items}
        </View>
    )
}

// The New section of the Books sidebar: every transaction form and record a writer can
// start, under Customers, Vendors and Other. Folded until the user opens it (the state is
// kept). A reader has no New action, so the section is not drawn at all.
export function NewSection() {
    const { isVisible, columns, open } = useNewMenu()
    const isOpen = useBooksUIStore(s => s.isNewOpen)
    const toggle = useBooksUIStore(s => s.toggleNew)
    if (!isVisible) return null

    const groups = isOpen
        ? columns.map(column => <NewGroup key={column.heading} column={column} onSelect={open} />)
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
