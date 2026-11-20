import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { Button, ButtonSpinner, ButtonText } from '@tinycld/core/ui/button'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { Text, View } from 'react-native'
import type { BankMatchModel, MatchOption } from '../../../hooks/useBankMatch'
import { MatchedTo } from './MatchedTo'
import { MatchFind } from './MatchFind'
import { MatchLoadError, MatchLoading } from './MatchLoadStates'
import { MatchOptionRow } from './MatchOptionRow'
import { MatchTotals } from './MatchTotals'

type SectionProps = { model: BankMatchModel; scopeOwner: ScopeOwner; currency: string }

const MATCH_KEY = { keys: 'm', scope: 'list' } as const
const FIND_KEY = { keys: 'f', scope: 'list' } as const

function SectionHeading() {
    return (
        <View className="gap-0.5">
            <Text className="text-base font-semibold text-foreground">Match</Text>
            <Text className="text-sm text-muted-foreground">
                Books transactions that fit this bank transaction.
            </Text>
        </View>
    )
}

// The suggestions, then the lines chosen in the find mode that are not suggestions, so a
// choice made there shows here too.
function OptionRows({
    model,
    options,
    currency,
}: {
    model: BankMatchModel
    options: readonly MatchOption[]
    currency: string
}) {
    const chosen = new Set(model.chosenIds)
    const rows = options.map(option => {
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

function RefusalLine({ text, isVisible }: { text: string | null; isVisible: boolean }) {
    if (!isVisible || !text) return null
    return (
        <Text testID="bank-match-refusal" accessibilityRole="alert" className="text-sm text-danger">
            {text}
        </Text>
    )
}

// ShortcutButton has no spinner, so while the match is sent a disabled Button with core
// ButtonSpinner takes its place (and M is not registered then).
function MatchSubmit({ model, scopeOwner }: { model: BankMatchModel; scopeOwner: ScopeOwner }) {
    if (model.isSending) {
        return (
            <Button testID="bank-match-submit" isDisabled className="min-h-11">
                <ButtonSpinner />
                <ButtonText>Matching…</ButtonText>
            </Button>
        )
    }
    return (
        <ShortcutButton
            testID="bank-match-submit"
            label="Match"
            shortcut={MATCH_KEY}
            scopeOwner={scopeOwner}
            serverAction
            isDisabled={model.submit.isDisabled}
            accessibilityHint={model.submit.hint}
            className="min-h-11"
            onPress={model.onMatch}
        />
    )
}

function FindButton({
    model,
    scopeOwner,
    isVisible,
}: {
    model: BankMatchModel
    scopeOwner: ScopeOwner
    isVisible: boolean
}) {
    if (!isVisible) return null
    return (
        <ShortcutButton
            testID="bank-match-find"
            label="Find other matches"
            variant="outline"
            shortcut={FIND_KEY}
            scopeOwner={scopeOwner}
            isDisabled={model.isSending}
            className="min-h-11"
            onPress={model.onFind}
        />
    )
}

// A reader gets no button, so no key is registered for one. Find other matches is the
// suggestions' own: the find mode has no button and no key F.
function WriterButtons({
    model,
    scopeOwner,
    hasMatch,
    hasFind,
}: {
    model: BankMatchModel
    scopeOwner: ScopeOwner
    hasMatch: boolean
    hasFind: boolean
}) {
    if (!model.canWrite) return null
    const submit = hasMatch ? <MatchSubmit model={model} scopeOwner={scopeOwner} /> : null
    return (
        <View className="flex-row flex-wrap gap-2">
            {submit}
            <FindButton model={model} scopeOwner={scopeOwner} isVisible={hasFind} />
        </View>
    )
}

function NoSuggestion({ text, isVisible }: { text: string; isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text testID="bank-match-none" className="text-sm text-foreground">
            {text}
        </Text>
    )
}

// The totals, the refusal and Match behave the same in the suggestions and in the find
// mode, so they sit under both. A reader chooses nothing, so sees none of them.
function ChoiceFooter({
    model,
    scopeOwner,
    currency,
    hasFind,
}: SectionProps & { hasFind: boolean }) {
    return (
        <>
            <MatchTotals totals={model.totals} currency={currency} isVisible={model.canWrite} />
            <RefusalLine text={model.refusal} isVisible={model.canWrite} />
            <WriterButtons model={model} scopeOwner={scopeOwner} hasMatch hasFind={hasFind} />
        </>
    )
}

// The suggestions and the lines chosen in the find mode. With no row: the "found no
// transaction" text and, for a writer, Find other matches.
function SuggestionsBody({
    model,
    scopeOwner,
    currency,
    isVisible,
}: SectionProps & { isVisible: boolean }) {
    if (!isVisible) return null
    const options = [...model.options, ...model.foundChosen]
    const hasNoSuggestion = model.options.length === 0
    if (options.length === 0) {
        return (
            <>
                <NoSuggestion text={model.emptyText} isVisible />
                <WriterButtons model={model} scopeOwner={scopeOwner} hasMatch={false} hasFind />
            </>
        )
    }
    return (
        <>
            <NoSuggestion text={model.emptyText} isVisible={hasNoSuggestion} />
            <OptionRows model={model} options={options} currency={currency} />
            <ChoiceFooter model={model} scopeOwner={scopeOwner} currency={currency} hasFind />
        </>
    )
}

function FindBody({
    model,
    scopeOwner,
    currency,
    isVisible,
}: SectionProps & { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <>
            <MatchFind key={model.txnId} model={model} currency={currency} />
            <ChoiceFooter
                model={model}
                scopeOwner={scopeOwner}
                currency={currency}
                hasFind={false}
            />
        </>
    )
}

// The Match section of a For review transaction, in the drawer's `children` slot, or the
// Matched to section of a matched Reviewed one. The drawer renders outside the page's
// ScopeProvider, so the page hands its `list` scope owner in for the M, F and Z buttons.
// The find mode is a writer's only.
export function MatchSection({ model, scopeOwner, currency }: SectionProps) {
    if (model.kind === 'hidden') return null
    if (model.kind === 'matched') {
        return <MatchedTo model={model} scopeOwner={scopeOwner} currency={currency} />
    }
    const isReady = !model.isLoading && !model.isError
    const isFind = isReady && model.canWrite && model.mode === 'find'
    const isSuggestions = isReady && !isFind
    return (
        <View testID="bank-match-section" className="gap-3 border-t border-border pt-4">
            <SectionHeading />
            <MatchLoading isVisible={model.isLoading} testID="bank-match-loading" />
            <MatchLoadError isVisible={model.isError} onRetry={model.onRetry} />
            <SuggestionsBody
                model={model}
                scopeOwner={scopeOwner}
                currency={currency}
                isVisible={isSuggestions}
            />
            <FindBody
                model={model}
                scopeOwner={scopeOwner}
                currency={currency}
                isVisible={isFind}
            />
        </View>
    )
}
