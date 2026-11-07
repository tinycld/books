import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Menu } from '@tinycld/core/ui/menu'
import { type PickItem, PickMenu } from '@tinycld/core/ui/pick-menu'
import { ChevronDown } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import type { ReviewTabModel } from '../../../hooks/useReviewTab'
import {
    REVIEW_DATE_ITEMS,
    REVIEW_TYPE_ITEMS,
    type ReviewDatePreset,
    type ReviewType,
} from '../../../lib/bank-review'
import { useBankingUIStore } from '../../../stores/banking-ui-store'
import { SearchField } from '../../ListToolbar'

const SEARCH_PLACEHOLDER = 'Search description, memo, check no. or amount'

function SearchBox({ search, isWide }: { search: string; isWide: boolean }) {
    const setReviewSearch = useBankingUIStore(s => s.setReviewSearch)
    const list = { query: search, setQuery: setReviewSearch }
    return (
        <SearchField
            testIdPrefix="bank-review"
            placeholder={SEARCH_PLACEHOLDER}
            list={list}
            isWide={isWide}
        />
    )
}

function labelOf<Id extends string>(items: readonly { id: Id; label: string }[], id: Id) {
    return items.find(item => item.id === id)?.label ?? ''
}

type FilterMenuProps = {
    testID: string
    purpose: string
    label: string
    items: PickItem[]
    isWide: boolean
}

// Core PickMenu's touch chip is at least 160 wide, so on a phone two of them and "Clear
// filters" do not fit on one line. There the two menus share the row: each trigger fills
// its part of the width and truncates its label, still 44 high, with PickMenu's ids.
function PhoneFilterMenu({ testID, purpose, label, items }: FilterMenuProps) {
    const muted = useThemeColor('muted-foreground')
    const rows = items.map(item => (
        <Menu.Item
            key={item.id}
            label={item.label}
            isSelected={item.isSelected}
            onSelect={item.onSelect}
            testID={`${testID}-${item.id}`}
        />
    ))
    const trigger = (
        <Pressable
            className="flex-1 min-w-0 flex-row items-center justify-between gap-1 border border-border rounded-md px-3"
            style={{ minHeight: 44 }}
            accessibilityLabel={`${purpose}: ${label}`}
            testID={testID}
        >
            <Text className="flex-shrink text-foreground text-sm" numberOfLines={1}>
                {label}
            </Text>
            <ChevronDown size={12} color={muted} />
        </Pressable>
    )
    return (
        <Menu presentation="popover" trigger={trigger}>
            {rows}
        </Menu>
    )
}

function FilterMenu(props: FilterMenuProps) {
    if (!props.isWide) return <PhoneFilterMenu {...props} />
    const { testID, purpose, label, items } = props
    return <PickMenu testID={testID} purpose={purpose} label={label} size="touch" items={items} />
}

function DatesMenu({ preset, isWide }: { preset: ReviewDatePreset; isWide: boolean }) {
    const setReviewPreset = useBankingUIStore(s => s.setReviewPreset)
    const items = REVIEW_DATE_ITEMS.map(({ id, label }) => ({
        id,
        label,
        isSelected: id === preset,
        onSelect: () => setReviewPreset(id),
    }))
    return (
        <FilterMenu
            testID="bank-review-dates"
            purpose="Dates"
            label={labelOf(REVIEW_DATE_ITEMS, preset)}
            items={items}
            isWide={isWide}
        />
    )
}

function TypeMenu({ type, isWide }: { type: ReviewType; isWide: boolean }) {
    const setReviewType = useBankingUIStore(s => s.setReviewType)
    const items = REVIEW_TYPE_ITEMS.map(({ id, label }) => ({
        id,
        label,
        isSelected: id === type,
        onSelect: () => setReviewType(id),
    }))
    return (
        <FilterMenu
            testID="bank-review-type"
            purpose="Type"
            label={labelOf(REVIEW_TYPE_ITEMS, type)}
            items={items}
            isWide={isWide}
        />
    )
}

function ClearFiltersLink({ isVisible, onPress }: { isVisible: boolean; onPress: () => void }) {
    if (!isVisible) return null
    return (
        <Pressable
            testID="bank-review-clear"
            accessibilityRole="button"
            onPress={onPress}
            className="justify-center px-1"
            style={{ minHeight: 44 }}
        >
            <Text className="text-sm font-medium text-primary">Clear filters</Text>
        </Pressable>
    )
}

function Filters({ model }: { model: ReviewTabModel }) {
    return (
        <View className="flex-row items-center gap-2">
            <DatesMenu preset={model.filters.preset} isWide={model.isWide} />
            <TypeMenu type={model.filters.type} isWide={model.isWide} />
            <ClearFiltersLink isVisible={model.hasFilter} onPress={model.onClearFilters} />
        </View>
    )
}

// Search, Dates and Type of the transaction tabs: one row on wide, two on a phone (the
// search alone on the first, the menus and "Clear filters" on one line under it). It stays
// in every view state, the first load included.
export function ReviewToolbar({ model }: { model: ReviewTabModel }) {
    const layout = model.isWide ? 'flex-row items-center gap-2' : 'gap-2'
    return (
        <View testID="bank-review-toolbar" className={`pb-2 ${layout}`}>
            <SearchBox search={model.filters.search} isWide={model.isWide} />
            <Filters model={model} />
        </View>
    )
}
