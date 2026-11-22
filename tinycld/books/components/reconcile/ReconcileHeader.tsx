import { formatHint } from '@tinycld/core/lib/shortcuts'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonSpinner, ButtonText } from '@tinycld/core/ui/button'
import { Menu } from '@tinycld/core/ui/menu'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { ArrowLeft, EllipsisVertical } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import type { ReconcileScreenModel } from '../../hooks/useReconcileScreen'
import { RECONCILE_TEXTS, statementEndingText } from '../../lib/reconcile'
import { EDIT_KEY, FINISH_KEY, LATER_KEY } from '../../lib/reconcile-shortcuts'
import { WhileOpen } from '../RecordRowMenu'
import { StatusBadge } from '../StatusBadge'

// "Reconcile", back to the accounts screen (useReconcileScreen's onBack).
function BackLink({ onBack }: { onBack: () => void }) {
    const color = useThemeColor('muted-foreground')
    return (
        <Pressable
            testID="reconcile-back"
            accessibilityRole="link"
            onPress={onBack}
            className="flex-row items-center gap-1 self-start"
            style={{ minHeight: 44 }}
        >
            <ArrowLeft size={16} color={color} />
            <Text className="text-sm text-muted-foreground">Reconcile</Text>
        </Pressable>
    )
}

function ReconciledBadge({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <StatusBadge label="Reconciled" tone="success" testID="reconcile-status" />
}

// The account and "Statement ending Oct 31, 2026"; a finished reconciliation has the
// "Reconciled" badge beside the account.
function TitleBlock({ model }: { model: ReconcileScreenModel }) {
    const { reconciliation } = model
    if (!reconciliation) return null
    const isFinished = model.state === 'finished'
    return (
        <View testID="reconcile-title" className="min-w-0 flex-1 gap-0.5">
            <View className="flex-row flex-wrap items-center gap-2">
                <Text numberOfLines={1} className="shrink text-2xl font-semibold text-foreground">
                    {model.accountLabel}
                </Text>
                <ReconciledBadge isVisible={isFinished} />
            </View>
            <Text className="text-xs text-muted-foreground">
                {statementEndingText(reconciliation.statement_date)}
            </Text>
        </View>
    )
}

// A writer's actions are on a reconciliation in progress only.
function hasActions(model: ReconcileScreenModel): boolean {
    return model.canWrite && model.state === 'work'
}

const MORE_STYLE = { width: 44, minHeight: 44 }

// An element, not a component: Menu clones its trigger with the press and ref props, which
// a wrapper component would drop.
function moreTrigger(color: string) {
    return (
        <Pressable
            testID="reconcile-more"
            accessibilityRole="button"
            accessibilityLabel={RECONCILE_TEXTS.more}
            className="items-center justify-center"
            style={MORE_STYLE}
        >
            <EllipsisVertical size={18} color={color} />
        </Pressable>
    )
}

// The keys as the menu rows show them (E, ⌘S); useReconcileHeaderKeys registers them.
const EDIT_KEY_TEXT = formatHint(EDIT_KEY.keys).text
const LATER_KEY_TEXT = formatHint(LATER_KEY.keys).text

// On a phone the menu also holds Edit info and Finish later, which wide shows as buttons,
// with their keys. While the server takes no writes, Edit info says why it is disabled.
function PhoneItems({ model }: { model: ReconcileScreenModel }) {
    if (model.isWide) return null
    return (
        <>
            <Menu.Item
                testID="reconcile-menu-edit"
                label={RECONCILE_TEXTS.editInfo}
                description={model.actions.writeHint}
                shortcut={EDIT_KEY_TEXT}
                isDisabled={model.actions.isActionDisabled}
                onSelect={model.onEdit}
            />
            <Menu.Item
                testID="reconcile-menu-later"
                label={RECONCILE_TEXTS.finishLater}
                shortcut={LATER_KEY_TEXT}
                onSelect={model.onLater}
            />
        </>
    )
}

function MoreMenu({ model }: { model: ReconcileScreenModel }) {
    const color = useThemeColor('muted-foreground')
    const trigger = moreTrigger(color)
    return (
        <Menu
            title={RECONCILE_TEXTS.menuTitle}
            placement="bottom-end"
            sheetSide="bottom"
            trigger={trigger}
        >
            <WhileOpen>
                <PhoneItems model={model} />
                <Menu.Item
                    testID="reconcile-menu-discard"
                    label={RECONCILE_TEXTS.discardItem}
                    description={model.actions.writeHint}
                    isDestructive
                    isDisabled={model.actions.isActionDisabled}
                    onSelect={model.onDiscard}
                />
            </WhileOpen>
        </Menu>
    )
}

/**
 * Finish (reconcile spec §3 "Finish"): enabled only at a difference of 0 and while nothing
 * else runs (useReconcileActions' `canFinish`), with the reason as its hint while the
 * difference is not 0. While it is sent it reads "Finishing…" with the spinner. Shared by
 * the wide header and the phone's bar (`isFull`).
 */
export function ReconcileFinishButton({
    model,
    isFull,
}: {
    model: ReconcileScreenModel
    isFull: boolean
}) {
    const width = isFull ? 'w-full' : ''
    if (model.isFinishing) {
        return (
            <Button testID="reconcile-finish" isDisabled className={`min-h-11 ${width}`}>
                <ButtonSpinner />
                <ButtonText>{RECONCILE_TEXTS.finishing}</ButtonText>
            </Button>
        )
    }
    return (
        <ShortcutButton
            testID="reconcile-finish"
            label={RECONCILE_TEXTS.finish}
            shortcut={FINISH_KEY}
            onPress={model.onFinish}
            serverAction
            isDisabled={!model.canFinish}
            accessibilityHint={model.actions.finishHint}
            className={`min-h-11 ${width}`}
            scopeOwner={model.scopeOwner}
        />
    )
}

// Why Finish is disabled, as text: the web drops `accessibilityHint`, and a disabled
// ShortcutButton shows no tooltip.
export function FinishReason({
    model,
    align,
}: {
    model: ReconcileScreenModel
    align: 'right' | 'center'
}) {
    const text = model.actions.finishHint
    if (text === undefined) return null
    const alignClass = align === 'right' ? 'text-right' : 'text-center'
    return (
        <Text
            testID="reconcile-disabled-reason"
            className={`text-xs text-muted-foreground ${alignClass}`}
        >
            {text}
        </Text>
    )
}

// Wide: Edit info, Finish later, Finish and More in a row, the reason right under them.
function WideActions({ model }: { model: ReconcileScreenModel }) {
    if (!hasActions(model) || !model.isWide) return null
    return (
        <View className="items-end gap-1">
            <View className="flex-row items-center gap-2">
                <ShortcutButton
                    testID="reconcile-edit-info"
                    label={RECONCILE_TEXTS.editInfo}
                    shortcut={EDIT_KEY}
                    onPress={model.onEdit}
                    serverAction
                    isDisabled={model.actions.isActionDisabled}
                    variant="outline"
                    className="min-h-11"
                    scopeOwner={model.scopeOwner}
                />
                <ShortcutButton
                    testID="reconcile-later"
                    label={RECONCILE_TEXTS.finishLater}
                    shortcut={LATER_KEY}
                    onPress={model.onLater}
                    variant="outline"
                    className="min-h-11"
                    scopeOwner={model.scopeOwner}
                />
                <ReconcileFinishButton model={model} isFull={false} />
                <MoreMenu model={model} />
            </View>
            <FinishReason model={model} align="right" />
        </View>
    )
}

function PhoneMore({ model }: { model: ReconcileScreenModel }) {
    if (!hasActions(model) || model.isWide) return null
    return <MoreMenu model={model} />
}

/**
 * The work screen's header (reconcile spec §3 "Header", "Actions"): the back link, which
 * every state keeps, then the account and the statement line once the reconciliation is
 * loaded. A writer's reconciliation in progress has its actions: on wide Edit info (E),
 * Finish later (⌘S), Finish (⌘↵) and More (Discard reconciliation), all in the screen's
 * `list` scope, with the reason Finish is disabled under them; on a phone only More, which
 * also holds Edit info (E) and Finish later (⌘S), whose keys useReconcileHeaderKeys
 * registers in the same scope (Finish is the bar at the bottom, ReconcileScreenView). While
 * the server takes no writes, More's Edit info and Discard show core's reason. A reader gets
 * none.
 */
export function ReconcileHeader({ model }: { model: ReconcileScreenModel }) {
    return (
        <View className="gap-1">
            <BackLink onBack={model.onBack} />
            <View className="flex-row items-center justify-between gap-3">
                <TitleBlock model={model} />
                <WideActions model={model} />
                <PhoneMore model={model} />
            </View>
        </View>
    )
}
