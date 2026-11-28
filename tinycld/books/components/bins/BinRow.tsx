import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { BinListRow } from '../../hooks/useBinsQuery'
import { BIN_COLUMNS, binStatusText } from '../../lib/bin-list'
import { PartyMenuSlot } from '../party/PartyRowParts'
import { StatusBadge } from '../StatusBadge'

export const BIN_ROW_HEIGHT = 48

// The Status cell: blank for an active bin, the muted badge "Inactive" for an inactive one.
export function BinStatus({ bin }: { bin: Pick<BinListRow, 'inactive'> }) {
    const text = binStatusText(bin)
    if (text === '') return null
    return <StatusBadge label={text} tone="muted" />
}

interface BinRowProps {
    bin: BinListRow
    // Opens the bin dialog; undefined for a reader, whose row is not pressable.
    onOpen?: (id: string) => void
    // The row menu, or null for a reader.
    menu: ReactNode
}

// Two siblings, as every list row: the button that opens the bin dialog (its cells) and
// the menu, so a press on the menu never opens the bin.
export function BinRow({ bin, onOpen, menu }: BinRowProps) {
    const open = () => onOpen?.(bin.id)
    const isPressable = onOpen !== undefined
    const role = isPressable ? 'button' : undefined
    return (
        <View
            testID={`bins-row-${bin.id}`}
            className="flex-row border-b border-border bg-background pr-2"
            style={{ height: BIN_ROW_HEIGHT }}
        >
            <Pressable
                role={role}
                onPress={open}
                disabled={!isPressable}
                className="min-w-0 flex-1 flex-row items-center pl-4"
            >
                <View className="min-w-0 pr-3" style={BIN_COLUMNS.name}>
                    <Text numberOfLines={1} className="text-sm font-medium text-foreground">
                        {bin.name}
                    </Text>
                </View>
                <View className="min-w-0 pr-3" style={BIN_COLUMNS.note}>
                    <Text numberOfLines={1} className="text-sm text-muted-foreground">
                        {bin.note}
                    </Text>
                </View>
                <View className="items-start" style={BIN_COLUMNS.status}>
                    <BinStatus bin={bin} />
                </View>
            </Pressable>
            <PartyMenuSlot menu={menu} />
        </View>
    )
}
