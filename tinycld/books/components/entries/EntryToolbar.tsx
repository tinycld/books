import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { PlainInput } from '@tinycld/core/ui/PlainInput'
import { PickMenu } from '@tinycld/core/ui/pick-menu'
import { Search } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import type { EntriesRange, EntriesStatusFilter } from '../../lib/entries-query'
import { RANGE_PRESETS } from '../../lib/register-range'
import { useEntriesUiStore } from '../../stores/entries-ui-store'

interface EntryToolbarProps {
    canWrite: boolean
    filters: { status: EntriesStatusFilter; search: string; range: EntriesRange }
    onNew(): void
}

const CHIPS: { id: EntriesStatusFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'draft', label: 'Draft' },
    { id: 'posted', label: 'Posted' },
    { id: 'void', label: 'Void' },
]

const RANGE_OPTIONS: { id: EntriesRange; label: string }[] = [
    ...RANGE_PRESETS,
    { id: 'all-dates', label: 'All dates' },
]

function StatusChip({
    id,
    label,
    isActive,
}: {
    id: EntriesStatusFilter
    label: string
    isActive: boolean
}) {
    const setStatus = useEntriesUiStore(s => s.setStatus)
    const bg = isActive ? 'bg-primary border-primary' : 'bg-background border-border'
    const text = isActive ? 'text-primary-foreground' : 'text-foreground'
    return (
        <Pressable
            testID={`entries-chip-${id}`}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            onPress={() => setStatus(id)}
            className={`items-center justify-center rounded-full border px-4 ${bg}`}
            style={{ minHeight: 44 }}
        >
            <Text className={`text-sm ${text}`}>{label}</Text>
        </Pressable>
    )
}

function NewEntryButton({ isVisible, onNew }: { isVisible: boolean; onNew: () => void }) {
    if (!isVisible) return null
    return (
        <Button testID="entries-new" style={{ minHeight: 44 }} onPress={onNew}>
            <ButtonText>New journal entry</ButtonText>
        </Button>
    )
}

function SearchField({ search }: { search: string }) {
    const color = useThemeColor('muted-foreground')
    const setSearch = useEntriesUiStore(s => s.setSearch)
    return (
        <View
            className="flex-row items-center gap-2 rounded-md border border-border bg-background px-3"
            style={{ minHeight: 44, minWidth: 160, maxWidth: 360 }}
        >
            <Search size={16} color={color} />
            <PlainInput
                testID="entries-search"
                accessibilityLabel="Search journal entries"
                placeholder="Number or memo"
                value={search}
                onChangeText={setSearch}
                className="flex-1 text-sm text-foreground"
            />
        </View>
    )
}

function RangeSelect({ range }: { range: EntriesRange }) {
    const setRange = useEntriesUiStore(s => s.setRange)
    const items = RANGE_OPTIONS.map(({ id, label }) => ({
        id,
        label,
        isSelected: id === range,
        onSelect: () => setRange(id),
    }))
    const label = RANGE_OPTIONS.find(option => option.id === range)?.label ?? ''
    return (
        <PickMenu
            testID="entries-range"
            purpose="Date range"
            label={label}
            size="touch"
            items={items}
        />
    )
}

export function EntryToolbar({ canWrite, filters, onNew }: EntryToolbarProps) {
    const chips = CHIPS.map(chip => (
        <StatusChip key={chip.id} {...chip} isActive={filters.status === chip.id} />
    ))
    return (
        <View className="gap-3 border-b border-border px-4 pb-3 pt-2">
            <View className="flex-row items-center justify-between gap-3">
                <Text testID="entries-title" className="text-2xl font-semibold text-foreground">
                    Journal entries
                </Text>
                <NewEntryButton isVisible={canWrite} onNew={onNew} />
            </View>
            <SearchField search={filters.search} />
            <View className="flex-row flex-wrap items-center gap-2">
                {chips}
                <RangeSelect range={filters.range} />
            </View>
        </View>
    )
}
