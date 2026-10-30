import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { companyLine, type PartyListRow, type PartyRecord } from '../../lib/party-list'
import { InactiveLabel, MutedLine, PartyMenuSlot } from './PartyRowParts'

interface PartyCardProps<T extends PartyRecord> {
    row: PartyListRow<T>
    testIdPrefix: string
    indentPx: number
    onOpen(id: string): void
    height: number
    // The row menu, or null for a reader.
    menu: ReactNode
}

// Drawn at exactly `height`, the partyCardHeight the windowed card list sizes its
// spacers by. Like a table row, the open button and the menu are siblings.
export function PartyCard<T extends PartyRecord>({
    row,
    testIdPrefix,
    indentPx,
    onOpen,
    height,
    menu,
}: PartyCardProps<T>) {
    const { party, depth } = row
    const dim = party.inactive ? 'opacity-60' : ''
    return (
        <View
            testID={`${testIdPrefix}-card-${party.id}`}
            className={`flex-row border-b border-border bg-background pr-2 ${dim}`}
            style={{ height }}
        >
            <Pressable
                role="button"
                onPress={() => onOpen(party.id)}
                className="min-w-0 flex-1 justify-center pl-4"
            >
                <View className="min-w-0" style={{ paddingLeft: depth * indentPx }}>
                    <View className="min-w-0 flex-row items-center">
                        <Text
                            numberOfLines={1}
                            className="shrink text-sm font-medium text-foreground"
                        >
                            {party.display_name}
                        </Text>
                        <InactiveLabel isVisible={party.inactive} />
                    </View>
                    <MutedLine value={companyLine(party)} />
                    <MutedLine value={party.email} />
                    <MutedLine value={party.phone} />
                </View>
            </Pressable>
            <PartyMenuSlot menu={menu} />
        </View>
    )
}
