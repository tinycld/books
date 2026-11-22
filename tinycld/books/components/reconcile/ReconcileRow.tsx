import { rowFocusStyle } from '@tinycld/core/components/focusable-row'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonSpinner } from '@tinycld/core/ui/button'
import { Link } from 'expo-router'
import { Check, Landmark } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import type { ReconcileLineRow } from '../../hooks/useReconcileLines'
import type { ReconcileScreenModel } from '../../hooks/useReconcileScreen'
import { entryHref } from '../../lib/entry-route'
import { amountCellText, clearBoxLabel, lineTypeNumber, RECONCILE_TEXTS } from '../../lib/reconcile'
import { formatDay } from '../../lib/register-range'
import { SelectBox } from '../SelectBox'

// Header and rows read the same objects, so the columns line up (reconcile spec §3 "The
// list (wide)"). Transaction, Payee and Memo take the free width above their minimums.
export const LINE_CELLS = {
    check: { width: 44 },
    date: { width: 104 },
    transaction: { flex: 1, minWidth: 150 },
    payee: { flex: 1, minWidth: 120 },
    memo: { flex: 2, minWidth: 140 },
    amount: { width: 110 },
} as const

// 44 + 104 + 150 + 120 + 140 + 110 + 110, and the row's right padding.
export const LINES_MIN_WIDTH = 786
export const LINE_ROW_HEIGHT = 44
export const LINE_CARD_HEIGHT = 64
export const LINE_ROW_CLASS = 'flex-row items-center pr-2'

const ROW_STYLE = { height: LINE_ROW_HEIGHT }
const SPINNER_STYLE = { width: 44, minHeight: 44 }
const AMOUNT_CLASS = 'text-right text-sm tabular-nums text-foreground'

// The row's look and whether a press clears it: a reader's row is not pressable, and a
// writer's is disabled while a batch runs or the server takes no writes.
export function rowPressOf(model: ReconcileScreenModel, row: ReconcileLineRow) {
    const { clear } = model
    return {
        canPress: model.canWrite,
        isDisabled: clear.isControlDisabled,
        hint: clear.writeHint,
        onPress: () => clear.onToggle(row.id),
        background: row.isCleared ? 'bg-surface-secondary' : 'bg-background',
    }
}

// The keyboard's focus stripe (core rowFocusStyle), and `data-focused` on the web for the
// e2e (react-native-web renders `dataSet`; a bare data- prop is dropped).
export function useLineFocus(isFocused: boolean) {
    const borderColor = useThemeColor('border')
    const activeIndicator = useThemeColor('primary')
    return {
        style: rowFocusStyle({ isFocused, borderColor, activeIndicator }),
        dataSet: { focused: isFocused ? 'true' : undefined },
    }
}

export function MatchedMark({ isVisible }: { isVisible: boolean }) {
    const color = useThemeColor('muted-foreground')
    if (!isVisible) return null
    return (
        <View accessibilityRole="image" accessibilityLabel={RECONCILE_TEXTS.matchedLabel}>
            <Landmark size={12} color={color} />
        </View>
    )
}

// "Expense 12" as a real link to the entry (entryHref), so the web gets an href. The link
// is its own Pressable, so pressing it does not clear the row.
export function LineLink({ row }: { row: ReconcileLineRow }) {
    const orgHref = useOrgHref()
    const href = orgHref(
        entryHref({
            id: row.entry,
            doc_type: row.doc_type,
            origin: row.origin,
            document: row.document,
        })
    )
    const text = lineTypeNumber(row)
    return (
        <Link href={href} asChild>
            <Pressable
                testID={`reconcile-link-${row.id}`}
                accessibilityRole="link"
                className="min-w-0 shrink web:cursor-pointer"
            >
                <Text numberOfLines={1} className="text-sm text-primary">
                    {text}
                </Text>
            </Pressable>
        </Link>
    )
}

// A reader's mark of a cleared row; nothing on a row that is not cleared. SelectBox has
// no mark-only mode.
function ClearedMark({ row }: { row: ReconcileLineRow }) {
    const color = useThemeColor('muted-foreground')
    if (!row.isCleared) return null
    return (
        <View
            testID={`reconcile-cleared-mark-${row.id}`}
            accessibilityRole="image"
            accessibilityLabel={RECONCILE_TEXTS.clearedMark}
        >
            <Check size={16} color={color} />
        </View>
    )
}

// A writer's clear box; a reader sees the check mark of a cleared row. The box is out of
// the Tab order: Space and X do what it does (lesson 29).
export function LineBox({ row, model }: { row: ReconcileLineRow; model: ReconcileScreenModel }) {
    const press = rowPressOf(model, row)
    if (!press.canPress) {
        return (
            <View className="items-center justify-center" style={LINE_CELLS.check}>
                <ClearedMark row={row} />
            </View>
        )
    }
    const label = clearBoxLabel(lineTypeNumber(row), row.isCleared)
    const state = row.isCleared ? 'checked' : 'empty'
    return (
        <View style={LINE_CELLS.check}>
            <SelectBox
                testID={`reconcile-check-${row.id}`}
                label={label}
                state={state}
                isDisabled={press.isDisabled}
                accessibilityHint={press.hint}
                tabIndex={-1}
                onPress={press.onPress}
            />
        </View>
    )
}

// The header box (wide) and "Clear all shown" (the phone bar): clears every shown row,
// unclears them when all are cleared, mixed when some are. While a batch runs, core
// ButtonSpinner in its place. Nothing for a reader.
export function SelectAllBox({ model, text }: { model: ReconcileScreenModel; text?: string }) {
    const { clear } = model
    if (!model.canWrite) return null
    if (clear.isBatchRunning) {
        return (
            <Button
                testID="reconcile-select-all"
                variant="ghost"
                size="icon"
                isDisabled
                accessibilityLabel={RECONCILE_TEXTS.selectAllLabel}
                style={SPINNER_STYLE}
            >
                <ButtonSpinner />
            </Button>
        )
    }
    return (
        <SelectBox
            testID="reconcile-select-all"
            label={RECONCILE_TEXTS.selectAllLabel}
            state={clear.allShownState}
            isDisabled={clear.isControlDisabled}
            accessibilityHint={clear.writeHint}
            tabIndex={-1}
            onPress={clear.onToggleAllShown}
            text={text}
        />
    )
}

/**
 * One transaction of the wide table (reconcile spec §3 "The list (wide)"): the clear box ·
 * Date · Transaction (the link and, when matched to a bank transaction, the Landmark mark)
 * · Payee · Memo · Payment · Deposit, on the cells the header uses. A press anywhere but
 * the link clears or unclears it; a cleared row is checked and `bg-surface-secondary`.
 */
export function ReconcileRow({
    row,
    model,
}: {
    row: ReconcileLineRow
    model: ReconcileScreenModel
}) {
    const press = rowPressOf(model, row)
    const focus = useLineFocus(row.id === model.focusedLineId)
    const className = `${LINE_ROW_CLASS} border-b border-border ${press.background}`
    const style = [ROW_STYLE, focus.style]
    const role = press.canPress ? 'button' : undefined
    const isRowDisabled = !press.canPress || press.isDisabled
    const day = formatDay(row.date)
    const outText = amountCellText(row.credit, model.currency)
    const inText = amountCellText(row.debit, model.currency)
    return (
        <Pressable
            testID={`reconcile-row-${row.id}`}
            accessibilityRole={role}
            accessibilityHint={press.hint}
            disabled={isRowDisabled}
            onPress={press.onPress}
            className={className}
            style={style}
            dataSet={focus.dataSet}
        >
            <LineBox row={row} model={model} />
            <View className="min-w-0 pr-3" style={LINE_CELLS.date}>
                <Text numberOfLines={1} className="text-sm tabular-nums text-foreground">
                    {day}
                </Text>
            </View>
            <View
                className="min-w-0 flex-row items-center gap-1.5 pr-3"
                style={LINE_CELLS.transaction}
            >
                <LineLink row={row} />
                <MatchedMark isVisible={row.bank_matched} />
            </View>
            <View className="min-w-0 pr-3" style={LINE_CELLS.payee}>
                <Text numberOfLines={1} className="text-sm text-foreground">
                    {row.payee}
                </Text>
            </View>
            <View className="min-w-0 pr-3" style={LINE_CELLS.memo}>
                <Text numberOfLines={1} className="text-sm text-muted-foreground">
                    {row.memo}
                </Text>
            </View>
            <View className="min-w-0 pr-3" style={LINE_CELLS.amount}>
                <Text numberOfLines={1} className={AMOUNT_CLASS}>
                    {outText}
                </Text>
            </View>
            <View className="min-w-0 pr-3" style={LINE_CELLS.amount}>
                <Text numberOfLines={1} className={AMOUNT_CLASS}>
                    {inText}
                </Text>
            </View>
        </Pressable>
    )
}
