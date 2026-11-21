import { LoadingState } from '@tinycld/core/components/LoadingState'
import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { Button, ButtonSpinner, ButtonText } from '@tinycld/core/ui/button'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { Text, View } from 'react-native'
import type { AddedLine, AddedShown, BankAddedModel } from '../../../hooks/useBankAdded'
import { ADDED_LOAD_ERROR_TEXT } from '../../../lib/bank-categorize'
import { formatMoney } from '../../../lib/money'
import { MatchOptionRow } from '../match/MatchOptionRow'

type AddedToBooksProps = { model: BankAddedModel; scopeOwner: ScopeOwner; currency: string }

const UNDO_KEY = { keys: 'z', scope: 'list' } as const
const NO_TOGGLE = () => {}

function LineMemo({ memo }: { memo: string }) {
    if (!memo) return null
    return (
        <Text numberOfLines={1} className="text-xs text-muted-foreground">
            {memo}
        </Text>
    )
}

function AddedLineRow({ line, currency }: { line: AddedLine; currency: string }) {
    const amount = formatMoney(line.amount, currency)
    return (
        <View className="flex-row items-start justify-between gap-2">
            <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-sm text-foreground">
                    {line.label}
                </Text>
                <LineMemo memo={line.memo} />
            </View>
            <Text className="text-sm tabular-nums text-foreground">{amount}</Text>
        </View>
    )
}

// The lines of a categorized transaction but the bank line; a transfer has none here.
function AddedLines({ lines, currency }: { lines: AddedShown['lines']; currency: string }) {
    if (lines.length === 0) return null
    const rows = lines.map(line => <AddedLineRow key={line.id} line={line} currency={currency} />)
    return (
        <View testID="bank-added-lines" className="gap-2">
            {rows}
        </View>
    )
}

// The Books transaction as a link row (MatchOptionRow with no box).
function AddedLink({ link, currency }: { link: AddedShown['link']; currency: string }) {
    if (!link) return null
    return (
        <MatchOptionRow
            option={link}
            isChosen={false}
            isDisabled
            canChoose={false}
            onToggle={NO_TOGGLE}
            currency={currency}
        />
    )
}

function RefusalLine({ text, isVisible }: { text: string | null; isVisible: boolean }) {
    if (!isVisible || !text) return null
    return (
        <Text testID="bank-added-refusal" accessibilityRole="alert" className="text-sm text-danger">
            {text}
        </Text>
    )
}

// ShortcutButton has no spinner, so while the undo is sent a disabled Button with core
// ButtonSpinner takes its place (and Z is not registered then). A reader gets no button,
// so no key Z.
function UndoButton({ model, scopeOwner }: { model: BankAddedModel; scopeOwner: ScopeOwner }) {
    if (!model.canWrite) return null
    if (model.isUndoing) {
        return (
            <Button testID="bank-added-undo" variant="outline" isDisabled className="min-h-11">
                <ButtonSpinner />
                <ButtonText>Undoing…</ButtonText>
            </Button>
        )
    }
    return (
        <ShortcutButton
            testID="bank-added-undo"
            label="Undo"
            variant="outline"
            shortcut={UNDO_KEY}
            scopeOwner={scopeOwner}
            serverAction
            isDisabled={model.undo.isDisabled}
            accessibilityHint={model.undo.hint}
            className="min-h-11"
            onPress={model.onUndo}
        />
    )
}

function AddedLoading({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View testID="bank-added-loading" className="py-6">
            <LoadingState />
        </View>
    )
}

function AddedLoadError({ isVisible, onRetry }: { isVisible: boolean; onRetry: () => void }) {
    if (!isVisible) return null
    return (
        <View testID="bank-added-error" accessibilityRole="alert" className="items-start gap-3">
            <Text className="text-sm text-foreground">{ADDED_LOAD_ERROR_TEXT}</Text>
            <Button
                testID="bank-added-retry"
                variant="outline"
                className="min-h-11"
                onPress={onRetry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

function AddedBody({ model, scopeOwner, currency }: AddedToBooksProps) {
    const { shown } = model
    if (model.view !== 'added' || !shown) return null
    return (
        <>
            <AddedLink link={shown.link} currency={currency} />
            <AddedLines lines={shown.lines} currency={currency} />
            <Text testID="bank-added-by" className="text-sm text-muted-foreground">
                {shown.byText}
            </Text>
            <RefusalLine text={model.refusal} isVisible={model.canWrite} />
            <View className="flex-row flex-wrap gap-2">
                <UndoButton model={model} scopeOwner={scopeOwner} />
            </View>
        </>
    )
}

// The Added to Books section of a Reviewed transaction that was categorized or
// transferred, in the place of Matched to (the drawer's `children` slot): the Books
// transaction as a link, its lines, who added it and when, and for a writer Undo (key Z,
// in the page's `list` scope, whose owner the page hands in: the drawer renders outside
// its ScopeProvider). Core LoadingState while the categorization loads, the load error
// with Retry after its read failed.
export function AddedToBooks({ model, scopeOwner, currency }: AddedToBooksProps) {
    return (
        <View testID="bank-added-section" className="gap-3 border-t border-border pt-4">
            <Text className="text-base font-semibold text-foreground">Added to Books</Text>
            <AddedLoading isVisible={model.view === 'loading'} />
            <AddedLoadError isVisible={model.view === 'error'} onRetry={model.onRetry} />
            <AddedBody model={model} scopeOwner={scopeOwner} currency={currency} />
        </View>
    )
}
