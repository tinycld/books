import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { BinListRow } from '../../hooks/useBinsQuery'
import { recordCardHeight } from '../../lib/party-list'
import { PartyMenuSlot } from '../party/PartyRowParts'
import { BinStatus } from './BinRow'

const NO_NOTE = '—'

function noteLine(bin: Pick<BinListRow, 'note'>): string {
    return bin.note === '' ? NO_NOTE : bin.note
}

// The windowed card list sizes its spacers by this: the name line and the note line.
export function binCardHeight(bin: BinListRow, fontScale: number): number {
    return recordCardHeight([noteLine(bin)], fontScale)
}

interface BinCardProps {
    bin: BinListRow
    height: number
    // Opens the bin dialog; undefined for a reader, whose card is not pressable.
    onOpen?: (id: string) => void
    // The row menu, or null for a reader.
    menu: ReactNode
}

// A bin below the table's minimum width: the name with the Inactive badge, the note (or a
// dash) under it, and the menu beside the open button.
export function BinCard({ bin, height, onOpen, menu }: BinCardProps) {
    const open = () => onOpen?.(bin.id)
    const isPressable = onOpen !== undefined
    const role = isPressable ? 'button' : undefined
    const note = noteLine(bin)
    return (
        <View
            testID={`bins-card-${bin.id}`}
            className="flex-row border-b border-border bg-background pr-2"
            style={{ height }}
        >
            <Pressable
                role={role}
                onPress={open}
                disabled={!isPressable}
                className="min-w-0 flex-1 justify-center pl-4"
            >
                <View className="min-w-0 flex-row items-center gap-2">
                    <Text numberOfLines={1} className="shrink text-sm font-medium text-foreground">
                        {bin.name}
                    </Text>
                    <BinStatus bin={bin} />
                </View>
                <Text numberOfLines={1} className="text-xs text-muted-foreground">
                    {note}
                </Text>
            </Pressable>
            <PartyMenuSlot menu={menu} />
        </View>
    )
}
