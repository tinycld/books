import { LoadingState } from '@tinycld/core/components/LoadingState'
import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { Button, ButtonSpinner, ButtonText } from '@tinycld/core/ui/button'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { Pressable, Text, View } from 'react-native'
import type { BankMatchModel } from '../../../hooks/useBankMatch'
import { MatchOptionRow } from './MatchOptionRow'
import { MatchTotals } from './MatchTotals'

type SectionProps = { model: BankMatchModel; scopeOwner: ScopeOwner; currency: string }

const MATCH_KEY = { keys: 'm', scope: 'list' } as const
const FIND_KEY = { keys: 'f', scope: 'list' } as const
const LINK_STYLE = { minHeight: 44 }

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

function SectionLoading({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View testID="bank-match-loading" className="py-6">
            <LoadingState />
        </View>
    )
}

function SectionLoadError({ isVisible, onRetry }: { isVisible: boolean; onRetry: () => void }) {
    if (!isVisible) return null
    return (
        <View testID="bank-match-error" accessibilityRole="alert" className="items-start gap-3">
            <Text className="text-sm text-foreground">Books could not load the matches.</Text>
            <Button
                testID="bank-match-retry"
                variant="outline"
                className="min-h-11"
                onPress={onRetry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

function OptionRows({ model, currency }: { model: BankMatchModel; currency: string }) {
    const chosen = new Set(model.chosenIds)
    const rows = model.options.map(option => {
        const onToggle = () => model.onToggle(option.lineId)
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

function FindButton({ model, scopeOwner }: { model: BankMatchModel; scopeOwner: ScopeOwner }) {
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

// The suggestions and, for a writer, the totals, the refusal, Match and Find other matches:
// a reader chooses nothing. With no suggestion: the "found no transaction" text and, for a
// writer, Find other matches.
function SuggestionsBody({
    model,
    scopeOwner,
    currency,
    isVisible,
}: SectionProps & { isVisible: boolean }) {
    if (!isVisible) return null
    if (model.options.length === 0) {
        return (
            <>
                <Text testID="bank-match-none" className="text-sm text-foreground">
                    {model.emptyText}
                </Text>
                <WriterButtons model={model} scopeOwner={scopeOwner} hasMatch={false} />
            </>
        )
    }
    return (
        <>
            <OptionRows model={model} currency={currency} />
            <MatchTotals totals={model.totals} currency={currency} isVisible={model.canWrite} />
            <RefusalLine text={model.refusal} isVisible={model.canWrite} />
            <WriterButtons model={model} scopeOwner={scopeOwner} hasMatch />
        </>
    )
}

// A reader gets no button, so no key is registered for one.
function WriterButtons({
    model,
    scopeOwner,
    hasMatch,
}: {
    model: BankMatchModel
    scopeOwner: ScopeOwner
    hasMatch: boolean
}) {
    if (!model.canWrite) return null
    const submit = hasMatch ? <MatchSubmit model={model} scopeOwner={scopeOwner} /> : null
    return (
        <View className="flex-row flex-wrap gap-2">
            {submit}
            <FindButton model={model} scopeOwner={scopeOwner} />
        </View>
    )
}

// The find mode; checkpoint 3 adds its date range, search and rows.
function FindBody({ model, isVisible }: { model: BankMatchModel; isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Pressable
            testID="bank-match-back"
            accessibilityRole="link"
            onPress={model.onBack}
            className="justify-center self-start"
            style={LINK_STYLE}
        >
            <Text className="text-sm font-medium text-primary">Back to suggestions</Text>
        </Pressable>
    )
}

// The Match section of a For review transaction, in the drawer's `children` slot. The
// drawer renders outside the page's ScopeProvider, so the page hands its `list` scope
// owner in for the M and F buttons.
export function MatchSection({ model, scopeOwner, currency }: SectionProps) {
    if (model.kind === 'hidden') return null
    const isReady = !model.isLoading && !model.isError
    const isFind = isReady && model.canWrite && model.mode === 'find'
    const isSuggestions = isReady && !isFind
    return (
        <View testID="bank-match-section" className="gap-3 border-t border-border pt-4">
            <SectionHeading />
            <SectionLoading isVisible={model.isLoading} />
            <SectionLoadError isVisible={model.isError} onRetry={model.onRetry} />
            <SuggestionsBody
                model={model}
                scopeOwner={scopeOwner}
                currency={currency}
                isVisible={isSuggestions}
            />
            <FindBody model={model} isVisible={isFind} />
        </View>
    )
}
