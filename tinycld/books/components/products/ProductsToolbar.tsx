import { ListFilterChip } from '../ListFilterChips'
import { ChipToolbarLayout, SearchField } from '../ListToolbar'
import { ShowInactiveChip } from '../ShowInactiveChip'

const LIST_PREFIX = 'products'

interface ProductsToolbarProps {
    list: {
        query: string
        setQuery(text: string): void
        showInactive: boolean
        setShowInactive(value: boolean): void
    }
    placeholder: string
    lowOnly: boolean
    onToggleLowOnly(): void
    isPhone: boolean
}

/**
 * The Products and services toolbar: the search, the chip Low stock (inventory-adjust spec
 * §3.10: the items the server marks low) and Show inactive, laid out by ChipToolbarLayout.
 */
export function ProductsToolbar({
    list,
    placeholder,
    lowOnly,
    onToggleLowOnly,
    isPhone,
}: ProductsToolbarProps) {
    const toggleInactive = () => list.setShowInactive(!list.showInactive)
    const field = (
        <SearchField
            testIdPrefix={LIST_PREFIX}
            placeholder={placeholder}
            list={list}
            isWide={!isPhone}
        />
    )
    const chips = (
        <>
            <ListFilterChip
                label="Low stock"
                isOn={lowOnly}
                testID={`${LIST_PREFIX}-low-stock`}
                onPress={onToggleLowOnly}
                size="compact"
            />
            <ShowInactiveChip
                testID={`${LIST_PREFIX}-show-inactive`}
                isOn={list.showInactive}
                onToggle={toggleInactive}
            />
        </>
    )
    return <ChipToolbarLayout search={field} chips={chips} isPhone={isPhone} padding="bottom" />
}
