import { rowFocusStyle } from '@tinycld/core/components/focusable-row'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Link } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import type { ReviewRowData, ReviewTabModel } from '../../../hooks/useReviewTab'
import { inBooksText } from '../../../lib/bank-match'
import {
    REVIEW_CELLS,
    REVIEW_ROW_HEIGHT,
    REVIEWED_CELLS,
    txnAmountCells,
    txnPhoneLine,
    txnSecondLine,
} from '../../../lib/bank-review'
import { entryHref } from '../../../lib/entry-route'
import { formatMoney } from '../../../lib/money'
import { PARTY_ROW_CLASS } from '../../../lib/party-list'
import { formatDay } from '../../../lib/register-range'
import { SelectBox } from '../../SelectBox'
import { SuggestionMark } from '../match/SuggestionMark'

const ROW_STYLE = { height: REVIEW_ROW_HEIGHT }
const AMOUNT_CLASS = 'text-right text-sm tabular-nums text-foreground'

const NO_SHRINK = { flexShrink: 0 }

function SecondLine({ text }: { text: string }) {
    if (!text) return null
    return (
        <Text numberOfLines={1} className="text-xs text-muted-foreground">
            {text}
        </Text>
    )
}

// A wide row's second line: the match mark when Books found a match, the memo and check
// number otherwise (both stay in the drawer). The list passes an empty list while the
// suggestions load, after their read failed, and on Reviewed and Excluded.
function RowSecondLine({ row }: { row: ReviewRowData }) {
    if (row.suggestions.length > 0) {
        return <SuggestionMark txnId={row.id} suggestions={row.suggestions} form="row" />
    }
    return <SecondLine text={txnSecondLine(row.memo, row.checkNumber)} />
}

// A card's second line: the day, then the mark in place of "Check n".
function CardSecondLine({ row }: { row: ReviewRowData }) {
    if (row.suggestions.length === 0) {
        return <SecondLine text={txnPhoneLine(row.date, row.checkNumber)} />
    }
    const day = `${formatDay(row.date)} ·`
    return (
        <View className="flex-row items-center gap-1">
            <Text numberOfLines={1} className="text-xs text-muted-foreground" style={NO_SHRINK}>
                {day}
            </Text>
            <SuggestionMark txnId={row.id} suggestions={row.suggestions} form="card" />
        </View>
    )
}

type MatchLine = ReviewRowData['matchLines'][number]
type LinkedEntry = NonNullable<MatchLine['entry']>

// The one matched Books transaction as a real link (entryHref), so the web gets an href.
// The link is its own Pressable, so pressing it does not open the drawer.
function InBooksLink({ txnId, entry, text }: { txnId: string; entry: LinkedEntry; text: string }) {
    const orgHref = useOrgHref()
    const href = orgHref(entryHref(entry))
    return (
        <Link href={href} asChild>
            <Pressable
                testID={`bank-review-inbooks-${txnId}`}
                accessibilityRole="link"
                className="min-w-0 self-start web:cursor-pointer"
            >
                <Text numberOfLines={1} className="text-sm text-primary">
                    {text}
                </Text>
            </Pressable>
        </Link>
    )
}

// What a Reviewed transaction was matched to: a link to the one Books transaction, or the
// count of several as plain text (the row press opens the drawer, which lists them).
// Nothing for a row with no match.
function InBooksText({ row }: { row: ReviewRowData }) {
    const text = inBooksText(row.matchLines)
    const [only] = row.matchLines
    if (row.matchLines.length === 1 && only?.entry) {
        return <InBooksLink txnId={row.id} entry={only.entry} text={text} />
    }
    if (!text) return null
    return (
        <Text
            testID={`bank-review-inbooks-${row.id}`}
            numberOfLines={1}
            className="text-sm text-foreground"
        >
            {text}
        </Text>
    )
}

// The In Books cell of the Reviewed table, between Description and Spent.
function InBooksCell({ row, isVisible }: { row: ReviewRowData; isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View className="min-w-0 pr-3" style={REVIEWED_CELLS.inBooks}>
            <InBooksText row={row} />
        </View>
    )
}

// A Reviewed card's third line: the same text and link as the In Books cell.
function CardInBooksLine({ row, isVisible }: { row: ReviewRowData; isVisible: boolean }) {
    if (!isVisible) return null
    return <InBooksText row={row} />
}

// The row's part in the choice; null where rows cannot be chosen (Reviewed, readers).
export type RowChoice = {
    isChosen: boolean
    isDisabled: boolean
    onToggle: (id: string) => void
} | null

export function rowChoiceOf(model: ReviewTabModel, id: string): RowChoice {
    if (!model.canChoose) return null
    return {
        isChosen: model.isChosen(id),
        isDisabled: model.isChoiceDisabled,
        onToggle: model.onToggle,
    }
}

type RowProps = {
    row: ReviewRowData
    currency: string
    isOpen: boolean
    // The review keys' focus stripe (web only, core rowFocusStyle).
    isFocused: boolean
    onOpen: (id: string) => void
    choice: RowChoice
    // Reviewed: the In Books cell (REVIEWED_CELLS) or the card's third line.
    showsInBooks: boolean
}

// The register's focus stripe, and `data-focused` on the web for the e2e (react-native-web
// renders `dataSet`; a bare data- prop is dropped).
function useRowFocus(isFocused: boolean) {
    const borderColor = useThemeColor('border')
    const activeIndicator = useThemeColor('primary')
    return {
        style: rowFocusStyle({ isFocused, borderColor, activeIndicator }),
        dataSet: { focused: isFocused ? 'true' : undefined },
    }
}

// The row's check box, on the cell the header's select-all uses. SelectBox stops its own
// press, so pressing it does not open the drawer.
function RowBox({ row, choice }: { row: ReviewRowData; choice: RowChoice }) {
    if (!choice) return null
    const state = choice.isChosen ? 'checked' : 'empty'
    const onPress = () => choice.onToggle(row.id)
    return (
        <View style={REVIEW_CELLS.check}>
            <SelectBox
                testID={`bank-review-check-${row.id}`}
                label={`Choose ${row.description}`}
                state={state}
                isDisabled={choice.isDisabled}
                onPress={onPress}
            />
        </View>
    )
}

// The open row is highlighted as the register's open row is.
function rowBackground(isOpen: boolean): string {
    return isOpen ? 'bg-accent' : 'bg-background'
}

// One transaction of the wide table: the check box (when rows can be chosen) · Date ·
// Description (the match mark, or the memo and check number, under it) · In Books
// (Reviewed) · Spent · Received, on the cells the header uses. Pressing it opens the
// drawer. react-native-web writes no aria-selected from accessibilityState, so both are set.
export function ReviewRow({
    row,
    currency,
    isOpen,
    isFocused,
    onOpen,
    choice,
    showsInBooks,
}: RowProps) {
    const cells = showsInBooks ? REVIEWED_CELLS : REVIEW_CELLS
    const amounts = txnAmountCells(row.amount, currency)
    const day = formatDay(row.date)
    const onPress = () => onOpen(row.id)
    const selected = { selected: isOpen }
    const className = `${PARTY_ROW_CLASS} border-b border-border ${rowBackground(isOpen)}`
    const focus = useRowFocus(isFocused)
    const style = [ROW_STYLE, focus.style]
    return (
        <Pressable
            testID={`bank-review-row-${row.id}`}
            accessibilityRole="button"
            accessibilityState={selected}
            aria-selected={isOpen}
            onPress={onPress}
            className={className}
            style={style}
            dataSet={focus.dataSet}
        >
            <RowBox row={row} choice={choice} />
            <View className="min-w-0 pr-3" style={cells.date}>
                <Text numberOfLines={1} className="text-sm tabular-nums text-foreground">
                    {day}
                </Text>
            </View>
            <View className="min-w-0 pr-3" style={cells.description}>
                <Text numberOfLines={1} className="text-sm text-foreground">
                    {row.description}
                </Text>
                <RowSecondLine row={row} />
            </View>
            <InBooksCell row={row} isVisible={showsInBooks} />
            <View className="min-w-0 pr-3" style={cells.spent}>
                <Text numberOfLines={1} className={AMOUNT_CLASS}>
                    {amounts.spent}
                </Text>
            </View>
            <View className="min-w-0 pr-3" style={cells.received}>
                <Text numberOfLines={1} className={AMOUNT_CLASS}>
                    {amounts.received}
                </Text>
            </View>
        </Pressable>
    )
}

// One transaction on a phone: the check box (when rows can be chosen), description and
// "day · Check n" (or the day and the match mark), on Reviewed what it was matched to,
// then the signed amount on the right. Pressing it opens the drawer as a sheet.
export function ReviewCard({
    row,
    currency,
    height,
    isOpen,
    isFocused,
    onOpen,
    choice,
    showsInBooks,
}: RowProps & { height: number }) {
    const focus = useRowFocus(isFocused)
    const cardStyle = [{ height }, focus.style]
    const amountText = formatMoney(row.amount, currency)
    const onPress = () => onOpen(row.id)
    const selected = { selected: isOpen }
    const className = `flex-row items-center gap-3 border-b border-border px-1 ${rowBackground(isOpen)}`
    return (
        <Pressable
            testID={`bank-review-row-${row.id}`}
            accessibilityRole="button"
            accessibilityState={selected}
            aria-selected={isOpen}
            onPress={onPress}
            className={className}
            style={cardStyle}
            dataSet={focus.dataSet}
        >
            <RowBox row={row} choice={choice} />
            <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-sm text-foreground">
                    {row.description}
                </Text>
                <CardSecondLine row={row} />
                <CardInBooksLine row={row} isVisible={showsInBooks} />
            </View>
            <Text className="text-sm font-semibold tabular-nums text-foreground">{amountText}</Text>
        </Pressable>
    )
}
