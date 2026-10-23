import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Menu } from '@tinycld/core/ui/menu'
import { CheckSquare } from 'lucide-react-native'

interface BatchActionsProps {
    selectedCount: number
    onMakeInactive: () => void
    isWorking: boolean
    // The phone toolbar has room for an icon only.
    isIcon: boolean
}

export function BatchActions({
    selectedCount,
    onMakeInactive,
    isWorking,
    isIcon,
}: BatchActionsProps) {
    const isBlocked = selectedCount === 0 || isWorking
    return (
        <Menu
            title="Batch actions"
            trigger={
                <Button
                    testID="account-batch-actions"
                    variant="outline"
                    size="sm"
                    isDisabled={isBlocked}
                    accessibilityLabel="Batch actions"
                >
                    <TriggerContent isIcon={isIcon} />
                </Button>
            }
        >
            <Menu.Item label="Make inactive" isDisabled={isBlocked} onSelect={onMakeInactive} />
        </Menu>
    )
}

function TriggerContent({ isIcon }: { isIcon: boolean }) {
    const color = useThemeColor('foreground')
    if (isIcon) return <CheckSquare size={18} color={color} />
    return <ButtonText>Batch actions</ButtonText>
}
