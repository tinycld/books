import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { CircleAlert, CircleCheck } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import type { ReconcileScreenModel } from '../../hooks/useReconcileScreen'
import { moreHintsText, RECONCILE_TEXTS } from '../../lib/reconcile'
import type { ReconcileHint } from '../../lib/reconcile-hints'

// The text keeps a readable measure; on a narrow screen the actions wrap under it.
const HINT_TEXT_STYLE = { flexBasis: 240, flexShrink: 1 }
// The height of the text's first line with its padding (py-3 and a 20px line), so the mark
// sits on the first line.
const HINT_MARK_STYLE = { height: 44 }
const PRESS_STYLE = { minHeight: 44 }

// Open Banking is a link every reader may follow; Show changes the list, which only a
// writer works on.
function HintAction({ hint, model }: { hint: ReconcileHint; model: ReconcileScreenModel }) {
    const isLink = hint.action?.kind === 'banking'
    if (!hint.action || (!isLink && !model.canWrite)) return null
    const onPress = () => model.onShowHint(hint)
    return (
        <Pressable
            testID={`reconcile-hint-action-${hint.id}`}
            accessibilityRole={isLink ? 'link' : 'button'}
            onPress={onPress}
            className="justify-center"
            style={PRESS_STYLE}
        >
            <Text className="text-sm font-medium text-primary">{hint.action.label}</Text>
        </Pressable>
    )
}

function MoreHintsLink({
    count,
    isOpen,
    onPress,
}: {
    count: number
    isOpen: boolean
    onPress: () => void
}) {
    if (count === 0) return null
    const expanded = { expanded: isOpen }
    return (
        <Pressable
            testID="reconcile-hints-more"
            accessibilityRole="button"
            accessibilityState={expanded}
            onPress={onPress}
            className="justify-center"
            style={PRESS_STYLE}
        >
            <Text className="text-sm font-medium text-primary">{moreHintsText(count, isOpen)}</Text>
        </Pressable>
    )
}

function HintRow({
    hint,
    model,
    moreCount,
}: {
    hint: ReconcileHint
    model: ReconcileScreenModel
    moreCount: number
}) {
    return (
        <View className="flex-row flex-wrap items-start gap-x-3">
            <Text className="min-w-0 grow py-3 text-sm text-foreground" style={HINT_TEXT_STYLE}>
                {hint.text}
            </Text>
            <HintAction hint={hint} model={model} />
            <MoreHintsLink
                count={moreCount}
                isOpen={model.areHintsOpen}
                onPress={model.onToggleHints}
            />
        </View>
    )
}

function OtherHints({
    hints,
    model,
}: {
    hints: readonly ReconcileHint[]
    model: ReconcileScreenModel
}) {
    if (!model.areHintsOpen) return null
    const rows = hints.map(hint => (
        <HintRow key={hint.id} hint={hint} model={model} moreCount={0} />
    ))
    return <>{rows}</>
}

function BalancedLine() {
    const success = useThemeColor('success')
    return (
        <View testID="reconcile-hints" className="flex-row items-center gap-2 py-1">
            <CircleCheck size={16} color={success} />
            <Text className="text-sm text-success">{RECONCILE_TEXTS.balancedHint}</Text>
        </View>
    )
}

/**
 * The hint line under the band (reconcile spec §3 "Hints"), in progress only: at a
 * difference of 0 the balanced text with its check mark; else the first of the model's
 * hints (lib/reconcile-hints.ts) with its action, and "N more" that opens the others
 * under it (the store's `areHintsOpen`). Nothing when no hint applies.
 */
export function ReconcileHintLine({ model }: { model: ReconcileScreenModel }) {
    const warning = useThemeColor('warning')
    if (model.state !== 'work' || !model.totals) return null
    if (model.totals.difference === 0) return <BalancedLine />
    const [first, ...others] = model.hints
    if (!first) return null
    return (
        <View testID="reconcile-hints" className="flex-row items-start gap-2">
            <View className="items-center justify-center" style={HINT_MARK_STYLE}>
                <CircleAlert size={16} color={warning} />
            </View>
            <View className="min-w-0 flex-1">
                <HintRow hint={first} model={model} moreCount={others.length} />
                <OtherHints hints={others} model={model} />
            </View>
        </View>
    )
}
