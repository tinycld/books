import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import {
    companyLine,
    PARTY_COLUMNS,
    PARTY_ROW_HEIGHT,
    type PartyListRow,
    type PartyRecord,
} from '../../lib/party-list'
import { CompanyText, InactiveLabel, PartyMenuSlot, selectedProps } from './PartyRowParts'

interface PartyRowProps<T extends PartyRecord> {
    row: PartyListRow<T>
    testIdPrefix: string
    indentPx: number
    onOpen(id: string): void
    // The open record's row on the panel surface.
    isSelected: boolean
    menu: ReactNode
}

// Two siblings in a row: the button that opens the record (its cells) and the menu.
// Neither is inside the other, so each is its own control for a screen reader, and a
// press on the menu or one of its items never reaches the open button. A button takes
// Enter and Space on web.
export function PartyRow<T extends PartyRecord>({
    row,
    testIdPrefix,
    indentPx,
    onOpen,
    isSelected,
    menu,
}: PartyRowProps<T>) {
    const { party, depth } = row
    const { id } = party
    const dim = party.inactive ? 'opacity-60' : ''
    const bg = isSelected ? 'bg-accent' : 'bg-background'
    return (
        <View
            testID={`${testIdPrefix}-row-${id}`}
            className={`flex-row border-b border-border pr-2 ${bg} ${dim}`}
            style={{ height: PARTY_ROW_HEIGHT, minHeight: 44 }}
        >
            <Pressable
                role="button"
                // No label: the platform reads the button's own text (name, company, email,
                // phone and the Inactive label), which a label would hide.
                {...selectedProps(isSelected)}
                onPress={() => onOpen(id)}
                className="min-w-0 flex-1 flex-row items-center pl-4"
            >
                <View
                    testID={`${testIdPrefix}-cell-name-${id}`}
                    className="min-w-0 pr-3"
                    style={PARTY_COLUMNS.name}
                >
                    {/* The indent sits inside the cell: padding on a flex-basis 0 cell would
                        widen it and push the Email column out of line with the header. */}
                    <View className="min-w-0" style={{ paddingLeft: depth * indentPx }}>
                        <View className="min-w-0 flex-row items-center">
                            <Text numberOfLines={1} className="shrink text-sm text-foreground">
                                {party.display_name}
                            </Text>
                            <InactiveLabel isVisible={party.inactive} />
                        </View>
                        <CompanyText
                            testID={`${testIdPrefix}-cell-company-${id}`}
                            company={companyLine(party)}
                        />
                    </View>
                </View>
                <View
                    testID={`${testIdPrefix}-cell-email-${id}`}
                    className="min-w-0 pr-3"
                    style={PARTY_COLUMNS.email}
                >
                    <Text numberOfLines={1} className="text-sm text-foreground">
                        {party.email}
                    </Text>
                </View>
                <View testID={`${testIdPrefix}-cell-phone-${id}`} style={PARTY_COLUMNS.phone}>
                    <Text numberOfLines={1} className="text-sm text-foreground">
                        {party.phone}
                    </Text>
                </View>
            </Pressable>
            <PartyMenuSlot menu={menu} />
        </View>
    )
}
