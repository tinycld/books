import { DateField } from '@tinycld/core/ui/forms/fields/DateField'
import { Pressable, Text, View } from 'react-native'
import {
    type BankMatchModel,
    type MatchFindModel,
    useFindRangeForm,
    useFindSearch,
    useMatchFind,
} from '../../../hooks/useBankMatch'
import { SearchField } from '../../ListToolbar'
import { MatchLoadError, MatchLoading } from './MatchLoadStates'
import { MatchOptionRow } from './MatchOptionRow'

const LINK_STYLE = { minHeight: 44 }
const SEARCH_PLACEHOLDER = 'Search number, name, memo or amount'

type FindProps = { model: BankMatchModel; currency: string }

// One end of the range: a core DateField under its label. `min-w-0 flex-1` lets the pair
// share the drawer's width and never pass it (lesson 2).
function RangeField({
    label,
    testID,
    value,
    onChange,
}: {
    label: string
    testID: string
    value: string
    onChange: (next: string | null) => void
}) {
    return (
        <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-xs text-muted-foreground">{label}</Text>
            <DateField
                value={value || null}
                onChange={onChange}
                withTime={false}
                accessibilityLabel={label}
                testID={testID}
            />
        </View>
    )
}

function RangeErrorText({ text }: { text: string | null }) {
    if (!text) return null
    return (
        <Text testID="bank-match-range-error" className="text-xs text-danger">
            {text}
        </Text>
    )
}

function FindRows({ model, find, currency }: FindProps & { find: MatchFindModel }) {
    const chosen = new Set(model.chosenIds)
    const rows = find.rows.map(option => {
        const onToggle = () => model.onToggle(option)
        return (
            <MatchOptionRow
                key={option.lineId}
                option={option}
                isChosen={chosen.has(option.lineId)}
                isDisabled={model.isChoiceDisabled}
                canChoose={model.canWrite}
                onToggle={onToggle}
                currency={currency}
            />
        )
    })
    return <View>{rows}</View>
}

function FindEmpty({ text, isVisible }: { text: string; isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text testID="bank-match-find-empty" className="text-sm text-muted-foreground">
            {text}
        </Text>
    )
}

// The find mode of the Match section: Back to suggestions, the range, the search and every
// Books transaction that can be matched on the account and side, under the chosen lines a
// search or the range hides. The totals, the refusal and Match stay in MatchSection under
// it. Keyed by the transaction (MatchSection), so the range form starts afresh for another.
export function MatchFind({ model, currency }: FindProps) {
    const range = useFindRangeForm(model)
    const find = useMatchFind(model)
    const search = useFindSearch(model)
    const isLoading = find.state === 'loading'
    const isError = find.state === 'error'
    const isEmpty = find.state === 'empty'
    return (
        <>
            <Pressable
                testID="bank-match-back"
                accessibilityRole="link"
                onPress={model.onBack}
                className="justify-center self-start"
                style={LINK_STYLE}
            >
                <Text className="text-sm font-medium text-primary">Back to suggestions</Text>
            </Pressable>
            <View className="flex-row gap-2">
                <RangeField
                    label="From"
                    testID="bank-match-from"
                    value={range.from}
                    onChange={range.onFrom}
                />
                <RangeField
                    label="To"
                    testID="bank-match-to"
                    value={range.to}
                    onChange={range.onTo}
                />
            </View>
            <RangeErrorText text={range.error} />
            <View className="flex-row">
                <SearchField
                    testIdPrefix="bank-match"
                    placeholder={SEARCH_PLACEHOLDER}
                    list={search}
                    isWide={false}
                    size="touch"
                />
            </View>
            <FindRows model={model} find={find} currency={currency} />
            <MatchLoading isVisible={isLoading} testID="bank-match-find-loading" />
            <MatchLoadError isVisible={isError} onRetry={find.onRetry} />
            <FindEmpty text={find.emptyText} isVisible={isEmpty} />
            <MatchLoading isVisible={find.isFetchingNextPage} testID="bank-match-find-more" />
        </>
    )
}
