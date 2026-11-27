import { ScrollView, View } from 'react-native'
import { ADJUSTMENT_CHIPS, type AdjustmentChip } from '../../lib/adjustment-list'
import { ListFilterChip, ListFilterChips } from '../ListFilterChips'
import { SearchField } from '../ListToolbar'

const LIST_PREFIX = 'inventory-adjustments'
const CHIPS = ADJUSTMENT_CHIPS.map(chip => ({ id: chip.key, label: chip.label }))
const NO_GROW = { flexGrow: 0 }

interface AdjustmentsToolbarProps {
    search: { query: string; setQuery(text: string): void }
    placeholder: string
    chip: AdjustmentChip
    onChip(chip: AdjustmentChip): void
    madeByBooks: boolean
    onToggleMadeByBooks(): void
    isPhone: boolean
}

function isAdjustmentChip(id: string): id is AdjustmentChip {
    return CHIPS.some(chip => chip.id === id)
}

/**
 * The inventory adjustments' toolbar (inventory-adjust spec §3.5): the search (number and
 * memo), the status chips All, Draft, Posted, Void and the chip Made by Books (off at the
 * start). Wide, they share one wrapping row; on a phone the search has its own row and the
 * chips scroll sideways in the next, as DocumentListToolbar.
 */
export function AdjustmentsToolbar({
    search,
    placeholder,
    chip,
    onChip,
    madeByBooks,
    onToggleMadeByBooks,
    isPhone,
}: AdjustmentsToolbarProps) {
    const selectChip = (id: string) => {
        if (isAdjustmentChip(id)) onChip(id)
    }
    const field = (
        <SearchField
            testIdPrefix={LIST_PREFIX}
            placeholder={placeholder}
            list={search}
            isWide={!isPhone}
            size="touch"
        />
    )
    const chips = (
        <>
            <ListFilterChips
                chips={CHIPS}
                selected={chip}
                testIdPrefix={`${LIST_PREFIX}-chip`}
                onSelect={selectChip}
                scrolls={false}
            />
            <ListFilterChip
                label="Made by Books"
                isOn={madeByBooks}
                testID={`${LIST_PREFIX}-made-by-books`}
                onPress={onToggleMadeByBooks}
                size="touch"
            />
        </>
    )
    if (isPhone) {
        return (
            <View className="gap-2 py-2">
                <View className="flex-row items-center px-4">{field}</View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={NO_GROW}>
                    <View className="flex-row items-center gap-2 px-4">{chips}</View>
                </ScrollView>
            </View>
        )
    }
    return (
        <View className="flex-row flex-wrap items-center gap-2 px-4 py-3">
            {field}
            {chips}
        </View>
    )
}
