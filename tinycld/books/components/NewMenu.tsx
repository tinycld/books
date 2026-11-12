import { Popover, usePopoverContext } from '@tinycld/core/ui/popover'
import type { ReactElement } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { NewAction, NewMenuColumn } from '../lib/shell-nav'

interface NewMenuProps {
    columns: NewMenuColumn[]
    onSelect: (action: NewAction) => void
    trigger?: ReactElement
    isOpen?: boolean
    onOpenChange?: (open: boolean) => void
}

interface NewMenuBodyProps {
    columns: NewMenuColumn[]
    onSelect: (action: NewAction) => void
}

// A test id never holds an underscore: the action `sales_receipt` is `books-new-sales-receipt`.
function newActionTestId(action: NewAction): string {
    return `books-new-${action.id.replace(/_/g, '-')}`
}

function NewMenuItem({
    action,
    onSelect,
}: {
    action: NewAction
    onSelect: (action: NewAction) => void
}) {
    const press = () => onSelect(action)
    return (
        <Pressable
            testID={newActionTestId(action)}
            accessibilityRole="button"
            onPress={press}
            className="justify-center rounded-md px-2"
            style={{ minHeight: 44 }}
        >
            <Text className="text-sm text-foreground">{action.label}</Text>
        </Pressable>
    )
}

function NewMenuColumnView({
    column,
    isSheet,
    onSelect,
}: {
    column: NewMenuColumn
    isSheet: boolean
    onSelect: (action: NewAction) => void
}) {
    const items = column.actions.map(action => (
        <NewMenuItem key={action.id} action={action} onSelect={onSelect} />
    ))
    return (
        <View className="gap-1" style={isSheet ? undefined : { minWidth: 150 }}>
            <Text className="px-2 pb-1 text-xs font-bold uppercase text-muted-foreground">
                {column.heading}
            </Text>
            {items}
        </View>
    )
}

function NewMenuBody({ columns, onSelect }: NewMenuBodyProps) {
    const { isSheet, close } = usePopoverContext()

    const select = (action: NewAction) => {
        onSelect(action)
        close()
    }
    const columnViews = columns.map(column => (
        <NewMenuColumnView
            key={column.heading}
            column={column}
            isSheet={isSheet}
            onSelect={select}
        />
    ))

    return <View className={isSheet ? 'gap-4 p-2' : 'flex-row gap-8 p-4'}>{columnViews}</View>
}

export function NewMenu({ columns, onSelect, trigger, isOpen, onOpenChange }: NewMenuProps) {
    return (
        <Popover
            trigger={trigger}
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            presentation="auto"
            sheetSide="bottom"
            title="New"
            placement="bottom-start"
        >
            <NewMenuBody columns={columns} onSelect={onSelect} />
        </Popover>
    )
}
