import { LoadingState } from '@tinycld/core/components/LoadingState'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import { type DocumentListTab, emptyTexts, hasFilterSet } from '../../lib/document-list'

interface DocumentListStatesProps {
    tab: DocumentListTab
    list: { isLoading: boolean; isError: boolean; rows: readonly unknown[] }
    filters: Parameters<typeof hasFilterSet>[0]
    // The empty state's New button; false for a reader and in the names column.
    showNew: boolean
    onNew(): void
    onClearFilters(): void
}

// The words every Sales list shows: its error banner and its search field's placeholder.
export const LIST_LOAD_ERROR = 'Sales transactions could not load.'
export const SEARCH_PLACEHOLDER = 'Number or memo'

const STATE_BUTTON_STYLE = { minHeight: 44 }

function EmptyNew({
    isVisible,
    label,
    onPress,
}: {
    isVisible: boolean
    label: string
    onPress(): void
}) {
    if (!isVisible) return null
    const press = () => onPress()
    return (
        <Button testID="sales-empty-new" size="sm" style={STATE_BUTTON_STYLE} onPress={press}>
            <ButtonText>{label}</ButtonText>
        </Button>
    )
}

function Loading() {
    return (
        <View testID="sales-loading" className="flex-1">
            <LoadingState />
        </View>
    )
}

/**
 * The list's loading, empty and no-match states (spec §3 "States"). Loading shows core
 * LoadingState while the tab's first rows load. With no rows, and neither loading nor
 * failed: "No invoices yet" with the tab's New action when no filter is set, else
 * "No invoices match" with Clear filters, which resets search, chip, date range and
 * customer. A failed load shows the list's banner instead.
 */
export function DocumentListStates({
    tab,
    list,
    filters,
    showNew,
    onNew,
    onClearFilters,
}: DocumentListStatesProps) {
    const texts = emptyTexts(tab)
    const clear = () => onClearFilters()
    const isEmpty = !list.isLoading && !list.isError && list.rows.length === 0
    if (list.isLoading) return <Loading />
    if (!isEmpty) return null
    if (hasFilterSet(filters)) {
        return (
            <View testID="sales-no-match" className="items-center gap-4 p-8">
                <Text className="text-base font-medium text-foreground">{texts.match}</Text>
                <Button
                    testID="sales-clear-filters"
                    variant="outline"
                    size="sm"
                    style={STATE_BUTTON_STYLE}
                    onPress={clear}
                >
                    <ButtonText>Clear filters</ButtonText>
                </Button>
            </View>
        )
    }
    return (
        <View testID="sales-empty" className="items-center gap-4 p-8">
            <Text className="text-base font-medium text-foreground">{texts.yet}</Text>
            <EmptyNew isVisible={showNew} label={tab.newLabel} onPress={onNew} />
        </View>
    )
}
