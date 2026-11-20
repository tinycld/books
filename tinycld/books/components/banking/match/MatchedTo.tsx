import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { Button, ButtonSpinner, ButtonText } from '@tinycld/core/ui/button'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { Text, View } from 'react-native'
import type { BankMatchModel } from '../../../hooks/useBankMatch'
import { MatchLoadError, MatchLoading } from './MatchLoadStates'
import { MatchOptionRow } from './MatchOptionRow'

type MatchedToProps = { model: BankMatchModel; scopeOwner: ScopeOwner; currency: string }

const UNDO_KEY = { keys: 'z', scope: 'list' } as const
const NO_TOGGLE = () => {}

type Matched = BankMatchModel['matched']

// The matched Books transactions as link rows: no boxes, for writers and readers alike.
function MatchedRows({ matched, currency }: { matched: Matched; currency: string }) {
    const rows = matched.options.map(option => (
        <MatchOptionRow
            key={option.lineId}
            option={option}
            isChosen={false}
            isDisabled
            canChoose={false}
            onToggle={NO_TOGGLE}
            currency={currency}
        />
    ))
    return <View>{rows}</View>
}

function RefusalLine({ text, isVisible }: { text: string | null; isVisible: boolean }) {
    if (!isVisible || !text) return null
    return (
        <Text testID="bank-match-refusal" accessibilityRole="alert" className="text-sm text-danger">
            {text}
        </Text>
    )
}

// ShortcutButton has no spinner, so while the undo is sent a disabled Button with core
// ButtonSpinner takes its place (and Z is not registered then). A reader gets no button,
// so no key Z.
function UndoButton({ model, scopeOwner }: { model: BankMatchModel; scopeOwner: ScopeOwner }) {
    const { matched } = model
    if (!model.canWrite) return null
    if (matched.isUndoing) {
        return (
            <Button testID="bank-match-undo" variant="outline" isDisabled className="min-h-11">
                <ButtonSpinner />
                <ButtonText>Undoing…</ButtonText>
            </Button>
        )
    }
    return (
        <ShortcutButton
            testID="bank-match-undo"
            label="Undo match"
            variant="outline"
            shortcut={UNDO_KEY}
            scopeOwner={scopeOwner}
            serverAction
            isDisabled={matched.undo.isDisabled}
            accessibilityHint={matched.undo.hint}
            className="min-h-11"
            onPress={matched.onUndo}
        />
    )
}

function MatchedBody({ model, scopeOwner, currency }: MatchedToProps) {
    const { matched } = model
    if (matched.isLoading || matched.isError) return null
    return (
        <>
            <MatchedRows matched={matched} currency={currency} />
            <Text testID="bank-matched-by" className="text-sm text-muted-foreground">
                {matched.byText}
            </Text>
            <RefusalLine text={model.refusal} isVisible={model.canWrite} />
            <View className="flex-row flex-wrap gap-2">
                <UndoButton model={model} scopeOwner={scopeOwner} />
            </View>
        </>
    )
}

// The Matched to section of a Reviewed transaction that was matched, in the drawer's
// `children` slot: the matched Books transactions as links, who matched it and when, and
// for a writer Undo match (key Z, in the page's `list` scope, whose owner the page hands
// in: the drawer renders outside its ScopeProvider).
export function MatchedTo({ model, scopeOwner, currency }: MatchedToProps) {
    const { matched } = model
    return (
        <View testID="bank-matched-section" className="gap-3 border-t border-border pt-4">
            <Text className="text-base font-semibold text-foreground">Matched to</Text>
            <MatchLoading isVisible={matched.isLoading} testID="bank-match-loading" />
            <MatchLoadError isVisible={matched.isError} onRetry={model.onRetry} />
            <MatchedBody model={model} scopeOwner={scopeOwner} currency={currency} />
        </View>
    )
}
