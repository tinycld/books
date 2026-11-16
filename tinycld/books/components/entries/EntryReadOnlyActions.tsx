import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Menu } from '@tinycld/core/ui/menu'
import { View } from 'react-native'
import { useReadViewShortcuts } from '../../hooks/useReadViewShortcuts'
import type { EntryActionId } from '../../lib/entry-actions'

interface EntryReadOnlyActionsProps {
    isVisible: boolean
    isWide: boolean
    actions: EntryActionId[]
    // A void or reversal runs: the E, V and R keys do nothing.
    isBusy?: boolean
    // The group the E, V and R keys are listed under in core's shortcut list.
    shortcutGroup: string
    onEdit(): void
    onReverse(): void
    onVoid(): void
    // More → Audit history, for a Books reader; when given, the bar shows even with no
    // other action, and More holds it last. It opens a screen only, so it has no key.
    onAuditHistory?: () => void
}

const TAP = { minHeight: 44 }
const NO_ACTIONS: readonly EntryActionId[] = []
const BAR = 'flex-row items-center justify-end gap-2 border-t border-border bg-surface px-4 py-2'

function ActionButton({
    isVisible,
    label,
    variant = 'outline',
    testID,
    onPress,
}: {
    isVisible: boolean
    label: string
    variant?: 'outline' | 'default'
    testID?: string
    onPress(): void
}) {
    if (!isVisible) return null
    return (
        <Button testID={testID} variant={variant} style={TAP} onPress={onPress}>
            <ButtonText>{label}</ButtonText>
        </Button>
    )
}

function MenuRow({
    isVisible,
    label,
    testID,
    isDestructive = false,
    onSelect,
}: {
    isVisible: boolean
    label: string
    testID?: string
    isDestructive?: boolean
    onSelect?: () => void
}) {
    if (!isVisible || !onSelect) return null
    return (
        <Menu.Item
            testID={testID}
            label={label}
            isDestructive={isDestructive}
            onSelect={onSelect}
        />
    )
}

// A phone's More holds Reverse and Void; wide shows those as buttons, so its More holds
// Audit history alone. Audit history is always the last row.
function MoreMenu({
    isVisible,
    isBusy,
    canReverse,
    canVoid,
    onReverse,
    onVoid,
    onAuditHistory,
}: {
    isVisible: boolean
    // A void or reversal runs: More stays shut, so no row leaves the screen mid-write.
    isBusy: boolean
    canReverse: boolean
    canVoid: boolean
    onReverse(): void
    onVoid(): void
    onAuditHistory?: () => void
}) {
    if (!isVisible) return null
    return (
        <Menu
            title="More"
            placement="top-end"
            trigger={
                <Button testID="entry-more" variant="outline" style={TAP} isDisabled={isBusy}>
                    <ButtonText>More</ButtonText>
                </Button>
            }
        >
            <MenuRow isVisible={canReverse} label="Reverse" onSelect={onReverse} />
            <MenuRow isVisible={canVoid} label="Void" isDestructive onSelect={onVoid} />
            <MenuRow
                isVisible
                label="Audit history"
                testID="entry-history"
                onSelect={onAuditHistory}
            />
        </Menu>
    )
}

export function EntryReadOnlyActions({
    isVisible,
    isWide,
    actions,
    isBusy = false,
    shortcutGroup,
    onEdit,
    onReverse,
    onVoid,
    onAuditHistory,
}: EntryReadOnlyActionsProps) {
    // While the bar is hidden no read key is registered, but the hook still holds its
    // `thread` scope, so the keys of a form below it stay muted.
    const keyActions = isVisible ? actions : NO_ACTIONS
    useReadViewShortcuts({
        group: shortcutGroup,
        actions: keyActions,
        isBusy,
        onEdit,
        onVoid,
        onReverse,
    })
    const canEdit = actions.includes('edit')
    const canReverse = actions.includes('reverse')
    const canVoid = actions.includes('void')
    const hasHistory = onAuditHistory !== undefined
    if (!isVisible || !(canEdit || canReverse || canVoid || hasHistory)) return null
    const edit = (
        <ActionButton
            isVisible={canEdit}
            label="Edit"
            variant="default"
            testID="entry-edit"
            onPress={onEdit}
        />
    )
    if (isWide) {
        return (
            <View testID="entry-actions" className={BAR}>
                <MoreMenu
                    isVisible={hasHistory}
                    isBusy={isBusy}
                    canReverse={false}
                    canVoid={false}
                    onReverse={onReverse}
                    onVoid={onVoid}
                    onAuditHistory={onAuditHistory}
                />
                <ActionButton isVisible={canVoid} label="Void" onPress={onVoid} />
                <ActionButton isVisible={canReverse} label="Reverse" onPress={onReverse} />
                {edit}
            </View>
        )
    }
    return (
        <View className={BAR}>
            <MoreMenu
                isVisible={canVoid || hasHistory}
                isBusy={isBusy}
                canReverse={canReverse}
                canVoid={canVoid}
                onReverse={onReverse}
                onVoid={onVoid}
                onAuditHistory={onAuditHistory}
            />
            {edit}
        </View>
    )
}
