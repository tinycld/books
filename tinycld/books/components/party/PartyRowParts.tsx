import type { ReactNode } from 'react'
import { Platform, Text, View } from 'react-native'
import { isShownLine, PARTY_COLUMNS } from '../../lib/party-list'

export function InactiveLabel({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <Text className="ml-2 shrink-0 text-xs italic text-muted-foreground">Inactive</Text>
}

// The selected row: `aria-current` on web (a button has no valid `aria-selected`), the
// selected state on native, where VoiceOver and TalkBack announce it.
export function selectedProps(isSelected: boolean) {
    if (Platform.OS === 'web') return { 'aria-current': isSelected ? ('true' as const) : undefined }
    return { accessibilityState: { selected: isSelected } }
}

export function CompanyText({ testID, company }: { testID: string; company: string }) {
    if (company === '') return null
    return (
        <Text testID={testID} numberOfLines={1} className="text-xs text-muted-foreground">
            {company}
        </Text>
    )
}

// The row menu's cell, beside the open button. `menu` is null for a reader; the cell
// keeps its width so the columns line up.
export function PartyMenuSlot({ menu }: { menu: ReactNode }) {
    return (
        <View className="items-center justify-center" style={PARTY_COLUMNS.menu}>
            {menu}
        </View>
    )
}

export function MutedLine({ value }: { value: string | undefined }) {
    if (!isShownLine(value)) return null
    return (
        <Text numberOfLines={1} className="text-xs text-muted-foreground">
            {value}
        </Text>
    )
}
