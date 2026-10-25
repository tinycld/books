import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Menu } from '@tinycld/core/ui/menu'
import { View } from 'react-native'
import type { EntryActionId } from '../../lib/entry-actions'

interface EntryReadOnlyActionsProps {
    isVisible: boolean
    isWide: boolean
    actions: EntryActionId[]
    onEdit(): void
    onReverse(): void
    onVoid(): void
}

const TAP = { minHeight: 44 }
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

function PhoneMore({
    isVisible,
    canReverse,
    onReverse,
    onVoid,
}: {
    isVisible: boolean
    canReverse: boolean
    onReverse(): void
    onVoid(): void
}) {
    if (!isVisible) return null
    return (
        <Menu
            title="More"
            placement="top-end"
            trigger={
                <Button testID="entry-more" variant="outline" style={TAP}>
                    <ButtonText>More</ButtonText>
                </Button>
            }
        >
            {canReverse ? <Menu.Item label="Reverse" onSelect={onReverse} /> : null}
            <Menu.Item label="Void" isDestructive onSelect={onVoid} />
        </Menu>
    )
}

export function EntryReadOnlyActions({
    isVisible,
    isWide,
    actions,
    onEdit,
    onReverse,
    onVoid,
}: EntryReadOnlyActionsProps) {
    const canEdit = actions.includes('edit')
    const canReverse = actions.includes('reverse')
    const canVoid = actions.includes('void')
    if (!isVisible || !(canEdit || canReverse || canVoid)) return null
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
                <ActionButton isVisible={canVoid} label="Void" onPress={onVoid} />
                <ActionButton isVisible={canReverse} label="Reverse" onPress={onReverse} />
                {edit}
            </View>
        )
    }
    return (
        <View className={BAR}>
            <PhoneMore
                isVisible={canVoid}
                canReverse={canReverse}
                onReverse={onReverse}
                onVoid={onVoid}
            />
            {edit}
        </View>
    )
}
