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

function NewMenuBody({ columns, onSelect }: NewMenuBodyProps) {
    const { isSheet, close } = usePopoverContext()

    const select = (action: NewAction) => {
        onSelect(action)
        close()
    }

    return (
        <View className={isSheet ? 'gap-4 p-2' : 'flex-row gap-8 p-4'}>
            {columns.map(column => (
                <View
                    key={column.heading}
                    className="gap-1"
                    style={isSheet ? undefined : { minWidth: 150 }}
                >
                    <Text className="px-2 pb-1 text-xs font-bold uppercase text-muted-foreground">
                        {column.heading}
                    </Text>
                    {column.actions.map(action => (
                        <Pressable
                            key={action.id}
                            testID={`books-new-${action.id}`}
                            accessibilityRole="button"
                            onPress={() => select(action)}
                            className="justify-center rounded-md px-2"
                            style={{ minHeight: 44 }}
                        >
                            <Text className="text-sm text-foreground">{action.label}</Text>
                        </Pressable>
                    ))}
                </View>
            ))}
        </View>
    )
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
