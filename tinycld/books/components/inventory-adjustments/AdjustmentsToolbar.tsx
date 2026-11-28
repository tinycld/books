import { ADJUSTMENT_CHIPS, type AdjustmentChip } from '../../lib/adjustment-list'
import { ListFilterChip, ListFilterChips } from '../ListFilterChips'
import { ChipToolbarLayout, SearchField } from '../ListToolbar'

const LIST_PREFIX = 'inventory-adjustments'
const CHIPS = ADJUSTMENT_CHIPS.map(chip => ({ id: chip.key, label: chip.label }))

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
 * start), laid out by ChipToolbarLayout.
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
    return <ChipToolbarLayout search={field} chips={chips} isPhone={isPhone} padding="both" />
}
