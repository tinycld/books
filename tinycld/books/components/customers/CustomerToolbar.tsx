import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { PlainInput } from '@tinycld/core/ui/PlainInput'
import { Search } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import type { useCustomersList } from '../../hooks/useCustomersList'

type CustomersListState = ReturnType<typeof useCustomersList>

interface CustomerToolbarProps {
    list: CustomersListState
    isWide: boolean
}

// Wide, the field keeps a readable width beside the chip; on a phone it takes the row.
const WIDE_SEARCH_STYLE = { minHeight: 40, minWidth: 160, maxWidth: 360 }
const PHONE_SEARCH_STYLE = { minHeight: 40, minWidth: 0 }

function SearchField({ list, isWide }: CustomerToolbarProps) {
    const color = useThemeColor('muted-foreground')
    return (
        <View
            className="flex-1 flex-row items-center gap-2 rounded-md border border-border bg-background px-3"
            style={isWide ? WIDE_SEARCH_STYLE : PHONE_SEARCH_STYLE}
        >
            <Search size={16} color={color} />
            <PlainInput
                testID="customers-search"
                accessibilityLabel="Search customers"
                placeholder="Search customers"
                value={list.query}
                onChangeText={list.setQuery}
                className="min-w-0 flex-1 text-sm text-foreground"
            />
        </View>
    )
}

function ShowInactiveChip({ list }: { list: CustomersListState }) {
    const isOn = list.showInactive
    const box = isOn ? 'border-primary bg-primary' : 'border-border bg-background'
    const text = isOn ? 'text-primary-foreground' : 'text-foreground'
    return (
        <Pressable
            testID="customers-show-inactive"
            accessibilityRole="switch"
            accessibilityState={{ checked: isOn }}
            // react-native-web does not emit aria-checked from accessibilityState.
            aria-checked={isOn}
            onPress={() => list.setShowInactive(!isOn)}
            className={`justify-center rounded-full border px-3 ${box}`}
            style={{ minHeight: 40 }}
        >
            <Text className={`text-sm ${text}`}>Show inactive</Text>
        </Pressable>
    )
}

export function CustomerToolbar({ list, isWide }: CustomerToolbarProps) {
    return (
        <View className="flex-row items-center gap-2 px-4 pb-3">
            <SearchField list={list} isWide={isWide} />
            <ShowInactiveChip list={list} />
        </View>
    )
}
