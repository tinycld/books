import { LoadingState } from '@tinycld/core/components/LoadingState'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Text, View } from 'react-native'
import { type DocumentListTab, emptyTexts, hasFilterSet } from '../../lib/document-list'
import { areaOf } from '../../lib/list-areas'

interface DocumentListStatesProps {
    tab: DocumentListTab
    list: { isLoading: boolean; isError: boolean; rows: readonly unknown[] }
    filters: Parameters<typeof hasFilterSet>[0]
    // The empty state's New button; false for a reader and in the names column.
    showNew: boolean
    onNew(): void
    onClearFilters(): void
}

const STATE_BUTTON_STYLE = { minHeight: 44 }

function EmptyNew({
    isVisible,
    testIdPrefix,
    label,
    onPress,
}: {
    isVisible: boolean
    testIdPrefix: string
    label: string
    onPress(): void
}) {
    if (!isVisible) return null
    const press = () => onPress()
    return (
        <Button
            testID={`${testIdPrefix}-empty-new`}
            size="sm"
            style={STATE_BUTTON_STYLE}
            onPress={press}
        >
            <ButtonText>{label}</ButtonText>
        </Button>
    )
}

function Loading({ testIdPrefix }: { testIdPrefix: string }) {
    return (
        <View testID={`${testIdPrefix}-loading`} className="flex-1">
            <LoadingState />
        </View>
    )
}

/**
 * The list's loading, empty and no-match states (spec §3 "States"). Loading shows core
 * LoadingState while the tab's first rows load. With no rows, and neither loading nor
 * failed: "No invoices yet" with the tab's New action when no filter is set, else
 * "No invoices match" with Clear filters, which resets search, chip, date range and
 * party. A failed load shows the list's banner instead. Test ids start with the area's
 * prefix.
 */
export function DocumentListStates({
    tab,
    list,
    filters,
    showNew,
    onNew,
    onClearFilters,
}: DocumentListStatesProps) {
    const prefix = areaOf(tab).testIdPrefix
    const texts = emptyTexts(tab)
    const clear = () => onClearFilters()
    const isEmpty = !list.isLoading && !list.isError && list.rows.length === 0
    if (list.isLoading) return <Loading testIdPrefix={prefix} />
    if (!isEmpty) return null
    if (hasFilterSet(filters)) {
        return (
            <View testID={`${prefix}-no-match`} className="items-center gap-4 p-8">
                <Text className="text-base font-medium text-foreground">{texts.match}</Text>
                <Button
                    testID={`${prefix}-clear-filters`}
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
        <View testID={`${prefix}-empty`} className="items-center gap-4 p-8">
            <Text className="text-base font-medium text-foreground">{texts.yet}</Text>
            <EmptyNew
                isVisible={showNew}
                testIdPrefix={prefix}
                label={tab.newLabel}
                onPress={onNew}
            />
        </View>
    )
}
